import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Square,
  Pause,
  Trash2,
  Cpu,
  Globe,
  Smartphone,
  CheckCircle2,
  Clock,
  Layers,
  Terminal,
} from "lucide-react";

interface SubWorkerThread {
  threadId: number;
  workerInstance: Worker | null;
  status: "INITIALIZING" | "STANDBY" | "RUNNING" | "PAUSED" | "ERROR";
  taskId: number | null;
  startN: number;
  endN: number;
  currentN: number;
  pct: number;
  solutionsCount: number;
  speed: number;
  statusText: string;
}

interface DiscoveredSolution {
  n: number;
  count: number;
  sample: number[];
  timestamp: string;
}

interface GuiWorkerViewProps {
  onOpenShareModal?: () => void;
}

export const GuiWorkerView: React.FC<GuiWorkerViewProps> = ({ onOpenShareModal }) => {
  // 1. Connection Settings (gui_worker.py settings)
  const [workerIdInput, setWorkerIdInput] = useState<string>("AUTO");
  const [assignedWorkerId, setAssignedWorkerId] = useState<string>("");
  const [serverHost, setServerHost] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return window.location.hostname || "127.0.0.1";
    }
    return "127.0.0.1";
  });
  const [serverPort, setServerPort] = useState<string>(() => {
    if (typeof window !== "undefined") {
      if (window.location.protocol === "https:" || window.location.hostname.includes("trycloudflare.com")) {
        return "";
      }
      return window.location.port || "3000";
    }
    return "3000";
  });

  const [cores, setCores] = useState<number>(() => {
    return typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? Math.max(1, Math.min(8, navigator.hardwareConcurrency))
      : 2;
  });

  const [detectedCores] = useState<number>(() => {
    return typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;
  });

  // 2. Worker state (gui_worker.py status)
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [workerState, setWorkerState] = useState<"DISCONNECTED" | "STANDBY" | "RUNNING" | "WAITING" | "PAUSED">("DISCONNECTED");
  const [currentTask, setCurrentTask] = useState<{ taskId: number; start: number; end: number } | null>(null);
  const [completedCount, setCompletedCount] = useState<number>(0);
  const [solutionsCount, setSolutionsCount] = useState<number>(0);
  const [lastDuration, setLastDuration] = useState<number>(0);
  const [engineType, setEngineType] = useState<string>("Wasm Pyodide / JS Endo");
  const [recentSolutions, setRecentSolutions] = useState<DiscoveredSolution[]>([]);

  // 3. Log
  const [logMessages, setLogMessages] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // References
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatTimerRef = useRef<any>(null);
  const threadsRef = useRef<SubWorkerThread[]>([]);
  const [threads, setThreads] = useState<SubWorkerThread[]>([]);
  threadsRef.current = threads;

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogMessages((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 70)]);
  };

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logMessages]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      disconnectWorker();
    };
  }, []);

  // Send Heartbeat to Server
  const sendHeartbeat = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const activeRunning = threadsRef.current.filter((t) => t.status === "RUNNING");
      const currentSpeed = activeRunning.reduce((sum, t) => sum + t.speed, 0);
      const totalPct =
        threadsRef.current.length > 0
          ? threadsRef.current.reduce((sum, t) => sum + t.pct, 0) / threadsRef.current.length
          : 0;

      wsRef.current.send(
        JSON.stringify({
          type: "HEARTBEAT",
          worker_id: assignedWorkerId || workerIdInput,
          progress_pct: Math.round(totalPct * 10) / 10,
          current_speed: currentSpeed,
          total_solutions: solutionsCount,
        })
      );

      // 待機中または全スレッドが空いている場合、定期的にタスクを要求 (タスク追加時に自動再開)
      if (activeRunning.length === 0 && workerState !== "PAUSED") {
        wsRef.current.send(
          JSON.stringify({
            type: "REQUEST_TASK",
            worker_id: assignedWorkerId || workerIdInput,
          })
        );
      }
    }
  };

  // 手動タスク要求
  const requestTaskNow = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      addLog("手動で親サーバーへタスク要求を送信しました");
      setWorkerState("RUNNING");
      wsRef.current.send(
        JSON.stringify({
          type: "REQUEST_TASK",
          worker_id: assignedWorkerId || workerIdInput,
        })
      );
    }
  };

  // Sub worker thread creator
  const createSubWorker = (threadId: number): Worker => {
    const worker = new Worker("/worker_engine.js");

    worker.onerror = (err) => {
      console.error(`Core #${threadId} Workerエラー:`, err);
      addLog(`Core #${threadId} エラー: ${err.message || "Workerスクリプトの実行で問題が発生しました"}`);
    };

    worker.onmessage = (e) => {
      const { type, task_id, current_n, pct, speed, total_solutions, last_found, result, engine, text } = e.data || {};

      if (type === "STATUS") {
        setThreads((prev) =>
          prev.map((t) => (t.threadId === threadId ? { ...t, statusText: text || "" } : t))
        );
      } else if (type === "READY") {
        setEngineType(engine || "Wasm Pyodide / JS Endo");
        setThreads((prev) =>
          prev.map((t) =>
            t.threadId === threadId
              ? {
                  ...t,
                  status: workerState === "RUNNING" ? "RUNNING" : "STANDBY",
                  statusText: "エンジン待機中",
                }
              : t
          )
        );
        addLog(`Core #${threadId}: 計算エンジン起動完了 (${engine})`);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && workerState === "RUNNING") {
          wsRef.current.send(JSON.stringify({ type: "REQUEST_TASK", worker_id: assignedWorkerId || workerIdInput }));
        }
      } else if (type === "PROGRESS") {
        setThreads((prev) =>
          prev.map((t) =>
            t.threadId === threadId
              ? {
                  ...t,
                  currentN: current_n || 0,
                  pct: pct || 0,
                  speed: speed || 0,
                  solutionsCount: total_solutions || 0,
                  statusText: `n=${current_n} 計算中 (${speed} ops/s)`,
                }
              : t
          )
        );

        if (last_found) {
          setRecentSolutions((prev) => [
            {
              n: last_found.n,
              count: last_found.count,
              sample: last_found.sample || [],
              timestamp: new Date().toLocaleTimeString(),
            },
            ...prev.slice(0, 19),
          ]);
        }
      } else if (type === "COMPLETE" || type === "TASK_DONE") {
        const finishedTaskId = task_id ?? result?.task_id ?? "?";
        const dur = typeof result?.duration_sec === "number" ? result.duration_sec : 0;
        const totalSols = typeof result?.total_solutions === "number" ? result.total_solutions : 0;

        addLog(
          `Core #${threadId}: タスク #${finishedTaskId} 完了! 発見解: ${totalSols}個 (所要時間: ${dur.toFixed(3)}s)`
        );

        setCompletedCount((prev) => prev + 1);
        setSolutionsCount((prev) => prev + totalSols);
        setLastDuration(dur);

        // スレッドステータスを即座に解放
        const threadObj = threadsRef.current.find((t) => t.threadId === threadId);
        if (threadObj) {
          threadObj.status = "STANDBY";
          threadObj.taskId = null;
          threadObj.pct = 100;
          threadObj.speed = 0;
          threadObj.statusText = "完了・次のタスク待機中";
        }
        setThreads([...threadsRef.current]);
        setCurrentTask(null);

        // サーバーへ報告
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "TASK_COMPLETED",
              worker_id: assignedWorkerId || workerIdInput,
              task_id: finishedTaskId,
              duration_sec: dur,
              total_solutions: totalSols,
              result: result || {},
            })
          );
        }
      } else if (type === "ERROR") {
        addLog(`Core #${threadId} エラー: ${text || "計算エラー"}`);
      }
    };

    return worker;
  };

  // サーバーへ接続 (待機開始)
  const connectWorker = () => {
    try {
      let host = (serverHost || "").trim();
      let port = (serverPort || "").trim();
      let protocol = "ws:";

      // ユーザーが入力したホスト名のクレンジング (https:// や http://, wss:// を自動処理)
      if (host.startsWith("https://")) {
        protocol = "wss:";
        host = host.replace("https://", "");
      } else if (host.startsWith("http://")) {
        protocol = "ws:";
        host = host.replace("http://", "");
      } else if (host.startsWith("wss://")) {
        protocol = "wss:";
        host = host.replace("wss://", "");
      } else if (host.startsWith("ws://")) {
        protocol = "ws:";
        host = host.replace("ws://", "");
      } else {
        const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
        protocol = isSecure ? "wss:" : "ws:";
      }

      // 末尾スラッシュやパスを除去 (例: xxx.trycloudflare.com/ -> xxx.trycloudflare.com)
      host = host.split("/")[0];

      // ホスト名にすでにポートが含まれている場合 (例: 192.168.1.100:3000)
      if (host.includes(":")) {
        const parts = host.split(":");
        host = parts[0];
        port = parts[1];
      }

      // Cloudflare Tunnel (*.trycloudflare.com) や Cloud Run (*.run.app) または HTTPS 環境下ではポート3000は付与しない
      let targetHost = host;
      if (
        host.includes("trycloudflare.com") ||
        host.includes("run.app") ||
        protocol === "wss:"
      ) {
        if (port && port !== "3000" && port !== "443" && port !== "80") {
          targetHost = `${host}:${port}`;
        }
      } else if (port && port !== "80") {
        targetHost = `${host}:${port}`;
      }

      const wsUrl = `${protocol}//${targetHost}/ws/worker`;

      addLog(`サーバーへ接続開始 (${wsUrl})...`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setWorkerState("STANDBY");
        addLog(`サーバーとWebSocket接続確立。ハンドシェイク送信中...`);

        // 初期登録メッセージ (mode: immediate で接続と同時にタスク配分開始)
        ws.send(
          JSON.stringify({
            type: "REGISTER",
            worker_id: workerIdInput.trim() || "AUTO",
            cores: cores,
            engine: engineType,
            mode: "immediate",
          })
        );

        // 心拍タイマー開始 (3秒ごと)
        if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = setInterval(sendHeartbeat, 3000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "REGISTERED") {
            const confirmedId = data.assigned_id || data.worker_id || "PC01";
            setAssignedWorkerId(confirmedId);
            addLog(`サーバーにより確定したワーカーID: [ ${confirmedId} ]`);
            // 自動採番された場合は入力欄も更新
            if (workerIdInput === "AUTO" || !workerIdInput.trim()) {
              setWorkerIdInput(confirmedId);
            }

            // 即座にタスク要求
            setWorkerState("RUNNING");
            ws.send(JSON.stringify({ type: "REQUEST_TASK", worker_id: confirmedId }));
          } else if (data.type === "START_COMMAND") {
            addLog("親サーバーから 【計算開始指示 (START)】 を受信しました！");
            setWorkerState("RUNNING");
            ws.send(
              JSON.stringify({
                type: "REQUEST_TASK",
                worker_id: assignedWorkerId || workerIdInput,
              })
            );
          } else if (data.type === "PAUSE_COMMAND") {
            addLog("親サーバーから 【一時停止指示 (PAUSE)】 を受信しました。");
            setWorkerState("PAUSED");
            threadsRef.current.forEach((t) => {
              if (t.workerInstance) t.workerInstance.postMessage({ action: "PAUSE", type: "PAUSE" });
            });
          } else if (data.type === "ASSIGN_TASK") {
            const { task_id, start, end } = data;
            addLog(`新タスク割当: task_${task_id} [ ${start} 〜 ${end} ]`);
            setCurrentTask({ taskId: task_id, start, end });
            setWorkerState("RUNNING");

            // 空いているスレッド（または先頭スレッド）にタスクを割当
            const targetThread = threadsRef.current.find((t) => t.status !== "RUNNING") || threadsRef.current[0];
            if (targetThread && targetThread.workerInstance) {
              targetThread.status = "RUNNING";
              targetThread.taskId = task_id;
              targetThread.startN = start;
              targetThread.endN = end;
              targetThread.pct = 0;
              targetThread.statusText = `task_${task_id} 計算開始`;
              setThreads([...threadsRef.current]);

              targetThread.workerInstance.postMessage({
                action: "CALCULATE",
                type: "START_TASK",
                task_id,
                start,
                end,
              });
            }
          } else if (data.type === "NO_TASK") {
            setWorkerState("WAITING");
            addLog("サーバーに現在未完了のタスクはありません (全タスク完了または待機中)");
          }
        } catch (e: any) {
          console.error("メッセージ解析エラー:", e);
        }
      };

      ws.onclose = () => {
        addLog("サーバーとの通信が切断されました。");
        disconnectWorker();
      };

      ws.onerror = () => {
        addLog("WebSocket通信エラー: サーバーと通信できませんでした。ホスト名・親サーバーの起動状態をご確認ください。");
      };

      // スレッドワーカーの初期化
      const newThreads: SubWorkerThread[] = [];
      for (let i = 1; i <= cores; i++) {
        const workerInstance = createSubWorker(i);
        workerInstance.postMessage({ action: "INIT", type: "INIT", thread_id: i });
        newThreads.push({
          threadId: i,
          workerInstance,
          status: "INITIALIZING",
          taskId: null,
          startN: 0,
          endN: 0,
          currentN: 0,
          pct: 0,
          solutionsCount: 0,
          speed: 0,
          statusText: "初期化中...",
        });
      }
      threadsRef.current = newThreads;
      setThreads(newThreads);
    } catch (e: any) {
      addLog(`接続開始エラー: ${e.message}`);
    }
  };

  // 切断・停止
  const disconnectWorker = () => {
    setIsConnected(false);
    setWorkerState("DISCONNECTED");
    setCurrentTask(null);

    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {}
      wsRef.current = null;
    }

    threadsRef.current.forEach((t) => {
      if (t.workerInstance) {
        t.workerInstance.terminate();
      }
    });
    setThreads([]);
  };

  const handleToggleConnection = () => {
    if (!isConnected) {
      connectWorker();
    } else {
      disconnectWorker();
      addLog("ユーザー操作によりワーカーを切断・停止しました。");
    }
  };

  const handleClearLog = () => {
    setLogMessages([]);
  };

  const currentWid = assignedWorkerId || workerIdInput || "PC";

  return (
    <div className="space-y-5">
      {/* 1. 接続設定 (gui_worker.py conn_frame) */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            接続設定 (ワーカーPC / ブラウザノード)
          </h3>
          <span className="text-xs text-slate-400">
            検出コア数: {detectedCores} コア
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 items-end">
          {/* 1行目: ワーカーID */}
          <div className="sm:col-span-3">
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              ワーカーID:
            </label>
            <input
              type="text"
              disabled={isConnected}
              value={workerIdInput}
              onChange={(e) => setWorkerIdInput(e.target.value)}
              placeholder="AUTO"
              className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-slate-100 font-mono font-bold text-sm focus:outline-hidden focus:border-cyan-500 disabled:opacity-60"
            />
          </div>

          {/* 親サーバーIP */}
          <div className="sm:col-span-4">
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              親サーバーIP / ホスト名:
            </label>
            <input
              type="text"
              disabled={isConnected}
              value={serverHost}
              onChange={(e) => setServerHost(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-slate-100 font-mono text-sm focus:outline-hidden focus:border-cyan-500 disabled:opacity-60"
            />
          </div>

          {/* ポート */}
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              ポート:
            </label>
            <input
              type="text"
              disabled={isConnected}
              value={serverPort}
              onChange={(e) => setServerPort(e.target.value)}
              placeholder="自動 (443/3000)"
              className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-slate-100 font-mono text-sm focus:outline-hidden focus:border-cyan-500 disabled:opacity-60"
            />
          </div>

          {/* 並列スレッド数 */}
          <div className="sm:col-span-3">
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              使用CPUコア数:
            </label>
            <select
              disabled={isConnected}
              value={cores}
              onChange={(e) => setCores(parseInt(e.target.value))}
              className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-slate-100 text-sm font-semibold focus:outline-hidden focus:border-cyan-500 disabled:opacity-60"
            >
              {Array.from({ length: Math.min(8, Math.max(1, detectedCores)) }, (_, i) => i + 1).map((c) => (
                <option key={c} value={c}>
                  {c} コア (並列 {c} スレッド)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
          <div className="text-xs text-slate-400 space-y-0.5">
            <div>
              <span className="text-cyan-400 font-semibold">※AUTOまたは空欄で接続順に自動採番 (PC01, PC02...)</span>
            </div>
            <div className="text-[11px] text-slate-500">
              ※Cloudflare Tunnel（<code>trycloudflare.com</code>）接続時はポート指定不要（標準HTTPSで暗号化通信）
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenShareModal && (
              <button
                type="button"
                onClick={onOpenShareModal}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-800/60 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                <span>📱 スマホで参加</span>
              </button>
            )}

            {isConnected && (
              <button
                type="button"
                onClick={requestTaskNow}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 shadow-sm shadow-emerald-600/30 transition-all cursor-pointer"
                title="新しいタスクが親サーバーに追加された際に即座に取得して計算を開始します"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>⚡ タスク即時取得</span>
              </button>
            )}

            <button
              onClick={handleToggleConnection}
              className={`px-6 py-2.5 rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer ${
                !isConnected
                  ? "bg-sky-600 hover:bg-sky-500 text-white shadow-sky-600/30"
                  : "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30"
              }`}
            >
              {!isConnected ? (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>▶ サーバーへ接続 (待機開始)</span>
                </>
              ) : (
                <>
                  <Square className="w-4 h-4 fill-current" />
                  <span>⏹ 切断・停止</span>
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* 2. ワーカー稼働状況 (gui_worker.py status_frame) */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            ワーカー稼働状況
          </h3>
          <span className="text-xs font-mono text-slate-400">
            エンジン: {engineType}
          </span>
        </div>

        {/* 状態バッジ (gui_worker.py lbl_status_badge) */}
        <div>
          <div
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-sm border ${
              workerState === "RUNNING"
                ? "bg-sky-950/80 text-sky-400 border-sky-600/50"
                : workerState === "STANDBY"
                ? "bg-amber-950/80 text-amber-300 border-amber-600/50"
                : workerState === "WAITING"
                ? "bg-emerald-950/80 text-emerald-400 border-emerald-600/50"
                : "bg-slate-950 text-slate-400 border-slate-800"
            }`}
          >
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                workerState === "RUNNING"
                  ? "bg-sky-400 animate-pulse"
                  : workerState === "STANDBY"
                  ? "bg-amber-400 animate-pulse"
                  : workerState === "WAITING"
                  ? "bg-emerald-400 animate-pulse"
                  : "bg-slate-500"
              }`}
            />
            <span>
              {workerState === "RUNNING"
                ? `● 計算実行中 [${currentWid}] (RUNNING)`
                : workerState === "STANDBY"
                ? `● 接続中・開始指示待ち [${currentWid}] (STANDBY)`
                : workerState === "WAITING"
                ? `● 新規タスク待機中 [${currentWid}] (タスク追加時に自動再開・自動巡回中)`
                : workerState === "PAUSED"
                ? `● 一時停止中 [${currentWid}] (PAUSED)`
                : "● 未接続 (DISCONNECTED)"}
            </span>
          </div>
        </div>

        {/* 4 Key Metrics (gui_worker.py: 現在担当のタスク, このPCの完了タスク, 計算した解の総数, 直前の計算時間) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
            <div className="text-[11px] text-slate-400">現在担当のタスク:</div>
            <div className="text-base font-bold font-mono text-sky-400 mt-1 truncate">
              {currentTask ? `task_${currentTask.taskId} [${currentTask.start} 〜 ${currentTask.end}]` : "なし (待機中)"}
            </div>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
            <div className="text-[11px] text-slate-400">このPCの完了タスク:</div>
            <div className="text-base font-bold font-mono text-emerald-400 mt-1 tabular-nums">
              {completedCount} 件
            </div>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
            <div className="text-[11px] text-slate-400">計算した解の総数:</div>
            <div className="text-base font-bold font-mono text-indigo-300 mt-1 tabular-nums">
              {solutionsCount.toLocaleString()} 個 (φ⁻¹(n))
            </div>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
            <div className="text-[11px] text-slate-400">直前の計算時間:</div>
            <div className="text-base font-bold font-mono text-slate-200 mt-1 tabular-nums">
              {lastDuration > 0 ? `${lastDuration.toFixed(4)} 秒` : "- 秒"}
            </div>
          </div>
        </div>

        {/* Core Thread Status Bars */}
        {threads.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80 space-y-2">
            <div className="text-xs font-semibold text-slate-400">
              スレッド稼働状態:
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {threads.map((t) => (
                <div
                  key={t.threadId}
                  className="p-2.5 bg-slate-950 border border-slate-800 rounded-md text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono font-bold text-slate-300">Core #{t.threadId}</span>
                    <span className="text-slate-400">{t.statusText}</span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-cyan-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(0, t.pct))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Real-time solutions discovered preview */}
        {recentSolutions.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80">
            <div className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>このワーカーが発見した直近の解 φ⁻¹(n):</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {recentSolutions.map((sol, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded bg-indigo-950/70 border border-indigo-800 text-indigo-200 text-xs font-mono"
                >
                  n={sol.n}: {sol.count}解 [x={sol.sample.slice(0, 3).join(", ")}{sol.sample.length > 3 ? "..." : ""}]
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 3. ワーカー通信 & 計算ログ (gui_worker.py log_frame) */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <span>ワーカー通信 &amp; 計算ログ</span>
          </h3>
          <span className="text-xs font-mono text-slate-400">
            ({logMessages.length} 行)
          </span>
        </div>

        {/* Monospace Log Box */}
        <div
          ref={logContainerRef}
          className="h-44 sm:h-56 bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-300 overflow-y-auto space-y-1 select-text"
        >
          {logMessages.length === 0 ? (
            <div className="text-slate-600 italic">「サーバーへ接続」を押すと通信・計算ログが表示されます...</div>
          ) : (
            logMessages.map((log, idx) => (
              <div key={idx} className="leading-relaxed hover:bg-slate-900/60 px-1 rounded">
                {log}
              </div>
            ))
          )}
        </div>

        {/* Bottom controls */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={handleClearLog}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>ログ消去</span>
          </button>
        </div>
      </section>
    </div>
  );
};
