import React, { useState, useEffect, useRef } from "react";
import {
  Cpu,
  Play,
  Pause,
  Power,
  RotateCcw,
  Zap,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Hash,
  Layers,
  ArrowRight,
  ShieldCheck,
  Terminal,
  Smartphone,
  QrCode,
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

interface WebWorkerNodeProps {
  onOpenShareModal?: () => void;
}

export function WebWorkerNode({ onOpenShareModal }: WebWorkerNodeProps = {}) {
  const [cores, setCores] = useState<number>(() => {
    return typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? Math.max(1, Math.min(8, navigator.hardwareConcurrency))
      : 2;
  });

  const [maxDetectedCores] = useState<number>(() => {
    return typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;
  });

  const [workerId, setWorkerId] = useState<string>("WEB-AUTO");
  const [assignedId, setAssignedId] = useState<string>("");
  const [startMode, setStartMode] = useState<"immediate" | "standby">("immediate");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [engineType, setEngineType] = useState<string>("Pyodide (Wasm)");
  const [connectionStatus, setConnectionStatus] = useState<string>("未接続");
  const [recentSolutions, setRecentSolutions] = useState<DiscoveredSolution[]>([]);
  const [totalProcessedRange, setTotalProcessedRange] = useState<number>(0);
  const [totalDiscoveredSolutions, setTotalDiscoveredSolutions] = useState<number>(0);
  const [clusterCommandStatus, setClusterCommandStatus] = useState<"STANDBY" | "RUNNING" | "PAUSED">("STANDBY");
  const [logMessages, setLogMessages] = useState<string[]>([]);

  // Threads state
  const [threads, setThreads] = useState<SubWorkerThread[]>([]);

  // WebSocket ref
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatTimerRef = useRef<any>(null);
  const threadsRef = useRef<SubWorkerThread[]>([]);
  threadsRef.current = threads;

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogMessages((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 49)]);
  };

  // Heartbeat sender
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
          worker_id: assignedId || workerId,
          progress_pct: Math.round(totalPct * 10) / 10,
          current_speed: currentSpeed,
          total_solutions: totalDiscoveredSolutions,
        })
      );
    }
  };

  // 1つのスレッドワーカーを作成
  const createSubWorker = (threadId: number): Worker => {
    const worker = new Worker("/worker_engine.js");

    worker.onmessage = (e) => {
      const { type, task_id, current_n, pct, speed, total_solutions, last_found, result, engine, text } = e.data;

      if (type === "STATUS") {
        setThreads((prev) =>
          prev.map((t) => (t.threadId === threadId ? { ...t, statusText: text } : t))
        );
      } else if (type === "READY") {
        setEngineType(engine || "Pyodide (Wasm)");
        setThreads((prev) =>
          prev.map((t) =>
            t.threadId === threadId
              ? {
                  ...t,
                  status: clusterCommandStatus === "RUNNING" ? "RUNNING" : "STANDBY",
                  statusText: "計算エンジン準備完了",
                }
              : t
          )
        );
        addLog(`Core #${threadId}: エンジン準備完了 (${engine})`);

        // もしすでにサーバーから開始号令が出ていてタスクがなければ要求
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && clusterCommandStatus === "RUNNING") {
          wsRef.current.send(JSON.stringify({ type: "REQUEST_TASK", worker_id: assignedId || workerId }));
        }
      } else if (type === "PROGRESS") {
        setThreads((prev) =>
          prev.map((t) =>
            t.threadId === threadId
              ? {
                  ...t,
                  currentN: current_n,
                  pct: pct,
                  speed: speed,
                  solutionsCount: total_solutions,
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
              sample: last_found.sample,
              timestamp: new Date().toLocaleTimeString(),
            },
            ...prev.slice(0, 19),
          ]);
        }
      } else if (type === "TASK_DONE") {
        addLog(
          `Core #${threadId}: タスク #${task_id} 完了 (解数: ${result.total_solutions}, 所要: ${result.duration_sec}s)`
        );

        setTotalProcessedRange((prev) => prev + result.count);
        setTotalDiscoveredSolutions((prev) => prev + result.total_solutions);

        setThreads((prev) =>
          prev.map((t) =>
            t.threadId === threadId
              ? {
                  ...t,
                  pct: 100,
                  taskId: null,
                  status: clusterCommandStatus === "RUNNING" ? "STANDBY" : "PAUSED",
                  statusText: `タスク #${task_id} 完了`,
                }
              : t
          )
        );

        // サーバーへ完了報告
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "TASK_COMPLETED",
              worker_id: assignedId || workerId,
              task_id: task_id,
              duration_sec: result.duration_sec,
              total_solutions: result.total_solutions,
              result: result,
            })
          );
        }
      } else if (type === "TASK_ABORTED") {
        addLog(`Core #${threadId}: タスク #${task_id} が中断されました`);
        setThreads((prev) =>
          prev.map((t) => (t.threadId === threadId ? { ...t, taskId: null, status: "PAUSED" } : t))
        );
      }
    };

    worker.postMessage({ action: "INIT" });
    return worker;
  };

  // サーバーへ接続
  const handleConnect = () => {
    if (isConnected) return;
    setConnectionStatus("接続中...");
    addLog(`WebSocket サーバーへの接続を開始 (コア数: ${cores}, モード: ${startMode})...`);

    // プロトコルとホストの決定
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/worker`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setConnectionStatus("接続済み (初期化中)");
      addLog("WebSocket 接続確立。ワーカー登録メッセージを送信します...");

      // 初期スレッド生成
      const newThreads: SubWorkerThread[] = [];
      for (let i = 1; i <= cores; i++) {
        const workerInstance = createSubWorker(i);
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
          statusText: "Pyodide エンジン初期化中...",
        });
      }
      setThreads(newThreads);

      // ワーカー登録
      ws.send(
        JSON.stringify({
          type: "REGISTER",
          worker_id: workerId.trim() || "AUTO",
          cores: cores,
          mode: startMode,
          engine: "Pyodide (WebAssembly)",
        })
      );

      // ハートビート開始 (3秒間隔)
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = setInterval(sendHeartbeat, 3000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case "REGISTERED": {
            setAssignedId(msg.assigned_id);
            setClusterCommandStatus(msg.status === "RUNNING" ? "RUNNING" : "STANDBY");
            setConnectionStatus(msg.status === "RUNNING" ? "稼働中 (RUNNING)" : "待機中 (STANDBY)");
            addLog(`サーバー承認完了: 確定WorkerID = [${msg.assigned_id}], 状態 = ${msg.status}`);
            break;
          }

          case "ASSIGN_TASK": {
            const { task_id, start, end } = msg;
            addLog(`新タスク割当受信: タスク #${task_id} (${start}〜${end})`);

            // 空いているスレッドを探す
            setThreads((prev) => {
              const freeIdx = prev.findIndex((t) => t.taskId === null);
              if (freeIdx !== -1) {
                const target = prev[freeIdx];
                if (target.workerInstance) {
                  target.workerInstance.postMessage({
                    action: "CALCULATE",
                    task_id: task_id,
                    start: start,
                    end: end,
                  });
                }
                const updated = [...prev];
                updated[freeIdx] = {
                  ...target,
                  taskId: task_id,
                  startN: start,
                  endN: end,
                  currentN: start,
                  pct: 0,
                  status: "RUNNING",
                  statusText: `タスク #${task_id} (${start}〜${end}) 開始`,
                };
                return updated;
              } else {
                // すべて埋まっている場合は最初のスレッドに割り当て
                const target = prev[0];
                if (target?.workerInstance) {
                  target.workerInstance.postMessage({
                    action: "CALCULATE",
                    task_id: task_id,
                    start: start,
                    end: end,
                  });
                }
                return prev;
              }
            });
            break;
          }

          case "NO_TASK": {
            addLog("サーバーに現在未完了のタスクはありません (キュー消化完了)");
            break;
          }

          case "START_COMMAND": {
            addLog("サーバーから【開始】号令を受信しました");
            setClusterCommandStatus("RUNNING");
            setConnectionStatus("稼働中 (RUNNING)");
            // タスクを要求
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "REQUEST_TASK", worker_id: assignedId || workerId }));
            }
            break;
          }

          case "PAUSE_COMMAND": {
            addLog("サーバーから【一時停止】号令を受信しました");
            setClusterCommandStatus("PAUSED");
            setConnectionStatus("一時停止 (PAUSED)");
            break;
          }

          case "HEARTBEAT_ACK": {
            // ACK received
            break;
          }
        }
      } catch (err) {
        console.error("受信メッセージ解析エラー:", err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setConnectionStatus("切断");
      addLog("WebSocket サーバーから切断されました");
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    };

    ws.onerror = (err) => {
      console.error("WebSocket エラー:", err);
      setConnectionStatus("接続エラー");
      addLog("WebSocket 通信エラーが発生しました");
    };
  };

  // 切断処理
  const handleDisconnect = () => {
    if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
    // スレッドを停止
    threads.forEach((t) => {
      if (t.workerInstance) {
        t.workerInstance.postMessage({ action: "STOP" });
        t.workerInstance.terminate();
      }
    });
    setThreads([]);

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setConnectionStatus("未接続");
    setAssignedId("");
    addLog("ワーカーノードを切断・停止しました");
  };

  // ワーカー側からの手動開始
  const handleManualStart = () => {
    if (!isConnected || !wsRef.current) return;
    setClusterCommandStatus("RUNNING");
    setConnectionStatus("稼働中 (RUNNING)");
    addLog("ワーカー側から計算開始を要求しました");
    wsRef.current.send(JSON.stringify({ type: "WORKER_START", worker_id: assignedId || workerId }));
  };

  // ワーカー側からの手動一時停止
  const handleManualPause = () => {
    if (!isConnected || !wsRef.current) return;
    setClusterCommandStatus("PAUSED");
    setConnectionStatus("一時停止 (PAUSED)");
    addLog("ワーカー側から計算一時停止を要求しました");
    wsRef.current.send(JSON.stringify({ type: "WORKER_PAUSE", worker_id: assignedId || workerId }));
  };

  useEffect(() => {
    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      threads.forEach((t) => {
        if (t.workerInstance) t.workerInstance.terminate();
      });
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const totalCurrentSpeed = threads.reduce((sum, t) => sum + t.speed, 0);

  return (
    <div className="space-y-6">
      {/* 参加制御 & ステータスヘッダー */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
              <span className="text-xs font-mono uppercase tracking-wider text-cyan-400">
                Browser Distributed Compute Node
              </span>
              <span className="text-xs font-mono text-slate-500">·</span>
              <span className="text-xs text-slate-400">オイラー関数 φ(x) = n (Endo Method)</span>
            </div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              Webブラウザ・分散計算ワーカー
              {isConnected && (
                <span className="text-xs px-2 py-0.5 rounded font-mono font-normal bg-cyan-950 text-cyan-300 border border-cyan-800">
                  {assignedId || workerId}
                </span>
              )}
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Pyodide (WebAssembly) と マルチコア Web Worker により、ブラウザのCPUリソースを用いて並列計算を実行します。
            </p>
          </div>

          {/* アクションボタン */}
          <div className="flex flex-wrap items-center gap-3">
            {onOpenShareModal && (
              <button
                onClick={onOpenShareModal}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-800/80 font-medium text-sm rounded-lg flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Smartphone className="w-4 h-4 text-cyan-400" />
                スマホ・別端末を招待 (QR)
              </button>
            )}

            {!isConnected ? (
              <button
                onClick={handleConnect}
                className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm rounded-lg flex items-center gap-2 shadow-lg shadow-cyan-900/30 transition-all cursor-pointer"
              >
                <Power className="w-4 h-4 text-slate-950" />
                ▶ クラスタに参加 (Connect &amp; Join)
              </button>
            ) : (
              <>
                {clusterCommandStatus !== "RUNNING" ? (
                  <button
                    onClick={handleManualStart}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-lg flex items-center gap-2 transition-colors cursor-pointer shadow-md shadow-emerald-950/40"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    計算を開始 (Start)
                  </button>
                ) : (
                  <button
                    onClick={handleManualPause}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm rounded-lg flex items-center gap-2 transition-colors cursor-pointer shadow-md shadow-amber-950/40"
                  >
                    <Pause className="w-4 h-4 fill-white" />
                    一時停止 (Pause)
                  </button>
                )}
                <button
                  onClick={handleDisconnect}
                  className="px-4 py-2 bg-slate-800 hover:bg-rose-950/50 hover:border-rose-700 text-rose-300 border border-slate-700 font-medium text-sm rounded-lg flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Power className="w-4 h-4" />
                  切断 (Disconnect)
                </button>
              </>
            )}
          </div>
        </div>

        {/* 設定パネル (未接続時に設定可能) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-800">
          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1.5 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              並列スレッド数 (CPUコア数):{" "}
              <span className="font-mono text-cyan-300 font-bold">{cores} Threads</span>
              <span className="text-xs text-slate-500">(検出: 最大 {maxDetectedCores} コア)</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="1"
                max={Math.max(4, maxDetectedCores)}
                value={cores}
                disabled={isConnected}
                onChange={(e) => setCores(parseInt(e.target.value, 10))}
                className="w-full accent-cyan-500 cursor-pointer disabled:opacity-50"
              />
              <span className="text-sm font-mono text-slate-300 w-6 text-right">{cores}</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              接続時の計算開始モード
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isConnected}
                onClick={() => setStartMode("immediate")}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer text-center ${
                  startMode === "immediate"
                    ? "bg-cyan-950/60 border-cyan-500 text-cyan-200"
                    : "bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200"
                } disabled:opacity-50`}
              >
                即時開始 (Immediate)
              </button>
              <button
                type="button"
                disabled={isConnected}
                onClick={() => setStartMode("standby")}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer text-center ${
                  startMode === "standby"
                    ? "bg-amber-950/60 border-amber-500 text-amber-200"
                    : "bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200"
                } disabled:opacity-50`}
              >
                待機 (Standby)
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 block mb-1.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              ワーカー識別名 (Worker ID)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                disabled={isConnected}
                value={workerId}
                onChange={(e) => setWorkerId(e.target.value)}
                placeholder="AUTO または WEB-PC01"
                className="w-full bg-slate-950 border border-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-lg focus:outline-none focus:border-cyan-500 font-mono disabled:opacity-50"
              />
              <span className="text-[11px] text-slate-500 whitespace-nowrap">
                {assignedId ? `確定: ${assignedId}` : "AUTOで自動採番"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* テレメトリー概要カード */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
            <span>接続状態</span>
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-lg font-bold font-mono text-slate-100 flex items-center gap-2">
            {isConnected ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>{connectionStatus}</span>
              </>
            ) : (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-slate-600"></span>
                <span className="text-slate-500">OFFLINE</span>
              </>
            )}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            エンジン: {engineType}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
            <span>計算スループット</span>
            <Zap className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100 tabular-nums">
            {totalCurrentSpeed} <span className="text-xs font-normal text-slate-400">n/sec</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            {threads.filter((t) => t.status === "RUNNING").length} スレッド稼働中
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
            <span>累計処理範囲</span>
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100 tabular-nums">
            {totalProcessedRange.toLocaleString()} <span className="text-xs font-normal text-slate-400">values</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            完了タスク集計
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="text-xs font-mono uppercase tracking-wider text-slate-400 mb-1 flex items-center justify-between">
            <span>発見した解の総数</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
            {totalDiscoveredSolutions.toLocaleString()} <span className="text-xs font-normal text-slate-400">solutions</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 font-mono">
            ∑ |φ⁻¹(n)|
          </div>
        </div>
      </div>

      {/* スレッド別実行モニター */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-200 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            マルチスレッド Web Worker 実行グリッド ({threads.length} Threads)
          </h3>
          <span className="text-xs font-mono text-slate-500">
            {isConnected ? "WebSocket リアルタイム同期中" : "未起動"}
          </span>
        </div>

        {threads.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-800 rounded-lg text-slate-500 text-sm">
            ワーカーが接続されていません。上部の「クラスタに参加」ボタンを押すと、Pyodide Web Worker が起動します。
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {threads.map((t) => (
              <div
                key={t.threadId}
                className="bg-slate-950 border border-slate-800 rounded-lg p-4 relative overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono font-bold text-slate-300 flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                      Core #{t.threadId}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded ${
                        t.status === "RUNNING"
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                          : t.status === "STANDBY"
                          ? "bg-amber-950 text-amber-400 border border-amber-800"
                          : "bg-slate-900 text-slate-400 border border-slate-800"
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>

                  <div className="text-xs text-slate-400 font-mono mb-2">
                    タスク: {t.taskId ? `#${t.taskId} (${t.startN}〜${t.endN})` : "待機中"}
                  </div>

                  {/* 進捗バー */}
                  <div className="w-full bg-slate-800 rounded-full h-2 mb-2 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        t.status === "RUNNING" ? "bg-cyan-500" : "bg-slate-600"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, t.pct))}%` }}
                    ></div>
                  </div>

                  <div className="flex justify-between items-center text-[11px] font-mono text-slate-400 tabular-nums">
                    <span>{t.pct.toFixed(1)}%</span>
                    <span>{t.speed} n/sec</span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-900 text-[11px] text-slate-500 font-mono truncate">
                  {t.statusText}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 発見された最新解 & ターミナルログ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 最新の発見解 */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col h-96">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              リアルタイム解の発見ストリーム (φ(x) = n)
            </h3>
            <span className="text-xs font-mono text-slate-500">{recentSolutions.length} 件</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-xs">
            {recentSolutions.length === 0 ? (
              <div className="text-slate-500 text-center py-16">
                計算が開始されると、発見されたオイラー逆像の解がここにストリーミングされます。
              </div>
            ) : (
              recentSolutions.map((sol, idx) => (
                <div
                  key={`${sol.n}-${idx}`}
                  className="bg-slate-950 border border-slate-800/80 rounded-lg p-3 flex flex-col gap-1 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="font-bold text-cyan-300">
                      n = {sol.n}
                    </span>
                    <span className="text-[11px] text-emerald-400">
                      |φ⁻¹({sol.n})| = {sol.count} 個
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 break-all">
                    解 x: [{sol.sample.join(", ")}
                    {sol.count > sol.sample.length ? " ..." : ""}]
                  </div>
                  <div className="text-[10px] text-slate-600 text-right">
                    {sol.timestamp}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ログビューア */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col h-96">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              ワーカーノード・イベントログ
            </h3>
            <button
              onClick={() => setLogMessages([])}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
            >
              クリア
            </button>
          </div>

          <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-3 overflow-y-auto font-mono text-[11px] text-slate-400 space-y-1">
            {logMessages.length === 0 ? (
              <div className="text-slate-600 py-16 text-center">ログはありません</div>
            ) : (
              logMessages.map((log, i) => (
                <div key={i} className="leading-relaxed">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
