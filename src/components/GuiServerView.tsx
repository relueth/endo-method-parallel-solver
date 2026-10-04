import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Square,
  Copy,
  Check,
  RefreshCw,
  Plus,
  Zap,
  RotateCcw,
  Cpu,
  Database,
  Download,
  BarChart2,
  Trash2,
  FolderOpen,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { ClusterStatus, WorkerSlot, WebWorkerSlot } from "../types";

interface GuiServerViewProps {
  status: ClusterStatus;
  isActionLoading: boolean;
  onStartServer: () => Promise<void>;
  onStopServer: () => Promise<void>;
  onOpenShareModal: () => void;
  onOpenBenchmark: () => void;
  onRefresh: () => void;
}

export const GuiServerView: React.FC<GuiServerViewProps> = ({
  status,
  isActionLoading,
  onStartServer,
  onStopServer,
  onOpenShareModal,
  onOpenBenchmark,
  onRefresh,
}) => {
  // Task input states (mirroring gui_server.py)
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(10000);
  const [chunkSize, setChunkSize] = useState<number>(100);
  const [isTaskOperating, setIsTaskOperating] = useState<boolean>(false);
  const [taskNotice, setTaskNotice] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  // Worker controls state
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>("");
  const [isWorkerActionLoading, setIsWorkerActionLoading] = useState<boolean>(false);

  // Backup modal / status
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [backupsList, setBackupsList] = useState<Array<{ filename: string; size_bytes: number; created_at: string }>>([]);
  const [showBackupsModal, setShowBackupsModal] = useState<boolean>(false);

  // Results modal / files
  const [showResultsModal, setShowResultsModal] = useState<boolean>(false);
  const [resultsData, setResultsData] = useState<{
    folder_path: string;
    database_path: string;
    backups_dir: string;
    files: Array<{ filename: string; task_id: number | null; size_bytes: number; updated_at: string }>;
    total_count: number;
    total_size_bytes: number;
  } | null>(null);
  const [isLoadingResults, setIsLoadingResults] = useState<boolean>(false);

  const handleOpenResultsModal = async () => {
    setIsLoadingResults(true);
    setShowResultsModal(true);
    try {
      const res = await fetch("/api/cluster/results/files");
      if (res.ok) {
        const data = await res.json();
        setResultsData(data);
      }
    } catch (e) {
      console.error("結果ファイル取得エラー:", e);
    } finally {
      setIsLoadingResults(false);
    }
  };

  // Server Log state
  const [serverLogs, setServerLogs] = useState<string[]>([]);
  const [autoScrollLog, setAutoScrollLog] = useState<boolean>(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // IP / Connection info
  const [copied, setCopied] = useState<boolean>(false);
  const currentUrl = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  // Max range info from server
  const [maxRangeInfo, setMaxRangeInfo] = useState<{ max_id: number; max_end: number; total: number }>({
    max_id: 0,
    max_end: 0,
    total: 0,
  });

  const fetchMaxRange = async () => {
    try {
      const res = await fetch("/api/cluster/tasks/max-range");
      if (res.ok) {
        const data = await res.json();
        setMaxRangeInfo(data);
      }
    } catch (e) {
      // ignore
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/cluster/logs");
      if (res.ok) {
        const data = await res.json();
        let lines: string[] = [];
        if (Array.isArray(data.server_lines)) {
          lines = data.server_lines;
        } else if (typeof data.server_log === "string") {
          lines = data.server_log
            .split("\n")
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0);
        } else if (Array.isArray(data.server_log)) {
          lines = data.server_log;
        }
        setServerLogs(lines.slice(-60));
      }
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    fetchMaxRange();
    fetchLogs();
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && !document.hidden) {
        fetchMaxRange();
        fetchLogs();
      }
    }, 2500);

    const onVisChange = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        fetchMaxRange();
        fetchLogs();
      }
    };
    document.addEventListener("visibilitychange", onVisChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, []);

  useEffect(() => {
    if (autoScrollLog && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [serverLogs, autoScrollLog]);

  // Combined active workers list (Web Workers + LAN Workers)
  const allActiveWorkers: Array<{
    id: string;
    type: "LAN" | "WEB";
    status: string;
    address: string;
    task_range: string;
    last_hb: string;
    completed: number;
    rawStatus: string;
  }> = [];

  // Add web workers
  if (status.web_workers) {
    status.web_workers.forEach((w) => {
      let displayStatus = "切断";
      if (w.status === "RUNNING") displayStatus = "計算実行中";
      else if (w.status === "STANDBY") displayStatus = "待機中 (指示待ち)";
      else if (w.status === "PAUSED") displayStatus = "一時停止中";
      else displayStatus = "接続完了";

      allActiveWorkers.push({
        id: w.worker_id,
        type: "WEB",
        status: displayStatus,
        rawStatus: w.status,
        address: w.address,
        task_range: w.task_range || "待機中",
        last_hb: w.last_heartbeat_ago !== null ? `${w.last_heartbeat_ago}秒前` : "-",
        completed: w.completed_count || 0,
      });
    });
  }

  // Add LAN workers
  if (status.workers) {
    status.workers.forEach((w) => {
      if (w.status !== "DISCONNECTED" || w.is_active_process) {
        let displayStatus = "切断";
        if (w.status === "RUNNING") displayStatus = "計算実行中";
        else if (w.status === "CONNECTED") displayStatus = "接続完了 (LAN)";
        else if (w.status === "WAITING") displayStatus = "待機中 (タスク待ち)";

        allActiveWorkers.push({
          id: w.worker_id,
          type: "LAN",
          status: displayStatus,
          rawStatus: w.status,
          address: w.address,
          task_range: w.task_range || "待機中",
          last_hb: w.last_heartbeat_ago !== null ? `${w.last_heartbeat_ago}秒前` : "-",
          completed: w.completed_count || 0,
        });
      }
    });
  }

  // Set default selected worker if none selected
  useEffect(() => {
    if (!selectedWorkerId && allActiveWorkers.length > 0) {
      setSelectedWorkerId(allActiveWorkers[0].id);
    }
  }, [allActiveWorkers.length, selectedWorkerId]);

  // Copy IP/URL
  const handleCopyIp = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ⏩ 続きの範囲を自動入力 (auto fill next range)
  const handleAutoFillNextRange = () => {
    const nextStart = maxRangeInfo.max_end > 0 ? maxRangeInfo.max_end + 1 : 1;
    const span = Math.max(100, rangeEnd - rangeStart + 1) || 5000;
    const nextEnd = nextStart + span - 1;
    setRangeStart(nextStart);
    setRangeEnd(nextEnd);
    setTaskNotice({
      type: "info",
      text: `続きの範囲 [ ${nextStart.toLocaleString()} 〜 ${nextEnd.toLocaleString()} ] を自動入力しました。`,
    });
  };

  // ➕ 続きのタスクを追加 (append tasks)
  const handleAppendTasks = async () => {
    if (rangeEnd < rangeStart) {
      setTaskNotice({ type: "error", text: "終了 n は開始 n 以上にしてください。" });
      return;
    }
    if (chunkSize <= 0) {
      setTaskNotice({ type: "error", text: "分割単位は1以上にしてください。" });
      return;
    }

    setIsTaskOperating(true);
    setTaskNotice(null);
    try {
      const res = await fetch("/api/cluster/tasks/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range_start: rangeStart, range_end: rangeEnd, chunk_size: chunkSize }),
      });
      const data = await res.json();
      if (res.ok) {
        setTaskNotice({
          type: "success",
          text: `新しく ${data.count} 件のタスク (n=${rangeStart}〜${rangeEnd}) を追加登録しました！待機ワーカーが自動で処理を開始します。`,
        });
        await fetchMaxRange();
        onRefresh();
        // 次回用に自動繰り上げ
        handleAutoFillNextRange();
      } else {
        setTaskNotice({ type: "error", text: data.error || "タスク追加に失敗しました。" });
      }
    } catch (e: any) {
      setTaskNotice({ type: "error", text: e.message });
    } finally {
      setIsTaskOperating(false);
    }
  };

  // ⚡ 最初からやり直す (全リセット)
  const handleRegenerateTasks = async () => {
    if (!window.confirm(`タスク全リセットの確認:\n計算範囲 [ ${rangeStart} 〜 ${rangeEnd} ] (分割: ${chunkSize}) で最初からやり直しますか？\n※ 以前の tasks.db の進行状況はすべて初期化されます。`)) {
      return;
    }

    setIsTaskOperating(true);
    setTaskNotice(null);
    try {
      const res = await fetch("/api/cluster/tasks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range_start: rangeStart, range_end: rangeEnd, chunk_size: chunkSize }),
      });
      const data = await res.json();
      if (res.ok) {
        setTaskNotice({
          type: "success",
          text: `新しく ${data.count} 件のタスクを生成しました！`,
        });
        await fetchMaxRange();
        onRefresh();
      } else {
        setTaskNotice({ type: "error", text: data.error || "タスク生成に失敗しました。" });
      }
    } catch (e: any) {
      setTaskNotice({ type: "error", text: e.message });
    } finally {
      setIsTaskOperating(false);
    }
  };

  // ↺ 全て再計算 (revert all to pending)
  const handleRevertAllTasks = async () => {
    if (!window.confirm("すべてのタスクを未完了(PENDING)に戻して最初から計算し直しますか？")) {
      return;
    }

    setIsTaskOperating(true);
    try {
      const res = await fetch("/api/cluster/tasks/reset", { method: "POST" });
      if (res.ok) {
        setTaskNotice({ type: "success", text: "全タスクを未処理(PENDING)にリセットしました。" });
        onRefresh();
      }
    } catch (e: any) {
      setTaskNotice({ type: "error", text: e.message });
    } finally {
      setIsTaskOperating(false);
    }
  };

  // Worker controls
  const handleStartAllWorkers = async () => {
    setIsWorkerActionLoading(true);
    try {
      await fetch("/api/cluster/workers/start-all", { method: "POST" });
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setIsWorkerActionLoading(false);
    }
  };

  const handlePauseAllWorkers = async () => {
    setIsWorkerActionLoading(true);
    try {
      await fetch("/api/cluster/workers/pause-all", { method: "POST" });
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setIsWorkerActionLoading(false);
    }
  };

  const handleStartSelectedWorker = async () => {
    if (!selectedWorkerId) return;
    setIsWorkerActionLoading(true);
    try {
      await fetch(`/api/cluster/workers/start/${encodeURIComponent(selectedWorkerId)}`, { method: "POST" });
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setIsWorkerActionLoading(false);
    }
  };

  const handlePauseSelectedWorker = async () => {
    if (!selectedWorkerId) return;
    setIsWorkerActionLoading(true);
    try {
      await fetch(`/api/cluster/workers/pause/${encodeURIComponent(selectedWorkerId)}`, { method: "POST" });
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setIsWorkerActionLoading(false);
    }
  };

  const handleSpawnLanWorkers = async () => {
    setIsWorkerActionLoading(true);
    try {
      await fetch("/api/cluster/worker/spawn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 3 }),
      });
      onRefresh();
    } catch (e) {
      console.error(e);
    } finally {
      setIsWorkerActionLoading(false);
    }
  };

  // Database backup
  const handleBackupDatabase = async () => {
    try {
      const res = await fetch("/api/cluster/database/backup", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setBackupNotice(`バックアップ完了: ${data.filename}`);
        setTimeout(() => setBackupNotice(null), 4000);
      } else {
        alert(data.error || "バックアップに失敗しました。");
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleOpenBackupsModal = async () => {
    try {
      const res = await fetch("/api/cluster/database/backups");
      if (res.ok) {
        const list = await res.json();
        setBackupsList(list);
        setShowBackupsModal(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearLog = () => {
    setServerLogs([]);
  };

  const db = status.db_stats || {
    completed: 0,
    running: 0,
    pending: 0,
    total: 0,
    completion_rate: 0,
    total_solutions: 0,
  };

  const completionPct = db.total > 0 ? ((db.completed / db.total) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-5">
      {/* 1. 最上部ヘッダー（サーバー状態 & 接続先IP案内）- gui_server.py top_frame */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Status Badge */}
            <div
              className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 border ${
                status.server_running
                  ? "bg-emerald-950/70 text-emerald-400 border-emerald-600/50"
                  : "bg-slate-800 text-slate-400 border-slate-700"
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  status.server_running ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
                }`}
              />
              <span>
                {status.server_running ? "● 稼働中 (HTTP 3000 / WebSocket)" : "● 停止中"}
              </span>
            </div>

            {/* IP / Connection Info */}
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">
                  ワーカーPCに入力する親サーバーのIPv4アドレス / 接続URL:
                </span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                    currentUrl.includes(".trycloudflare.com")
                      ? "bg-amber-950/80 text-amber-300 border-amber-600/60"
                      : currentUrl.includes(".run.app") || currentUrl.includes(".aistudio")
                      ? "bg-blue-950/80 text-blue-300 border-blue-600/60"
                      : currentUrl.includes("localhost") || currentUrl.includes("127.0.0.1")
                      ? "bg-emerald-950/80 text-emerald-300 border-emerald-600/60"
                      : "bg-slate-800 text-slate-300 border-slate-700"
                  }`}
                >
                  {currentUrl.includes(".trycloudflare.com")
                    ? "Cloudflare Tunnel (世界公開中)"
                    : currentUrl.includes(".run.app") || currentUrl.includes(".aistudio")
                    ? "AI Studio クラウド開発環境"
                    : currentUrl.includes("localhost") || currentUrl.includes("127.0.0.1")
                    ? "自前PC (ローカル)"
                    : "アクセス中URL"}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <code className="px-3 py-1 bg-slate-950 border border-cyan-800 text-cyan-300 font-mono font-bold text-xs sm:text-sm rounded-md tracking-wider max-w-md truncate">
                  {currentUrl}
                </code>
                <button
                  onClick={handleCopyIp}
                  title="URL/IPアドレスをクリップボードにコピー"
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? "コピー完了" : "URLをコピー"}</span>
                </button>
                <button
                  onClick={onOpenShareModal}
                  title="スマホや別PCから接続するためのQRコードやCloudflare設定を表示"
                  className="px-3 py-1.5 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/60 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                  <span>📱 接続案内・QR</span>
                </button>
              </div>

              {/* URL解説・案内バー */}
              <div className="text-[11px] text-slate-400 bg-slate-950/60 rounded-lg p-2.5 border border-slate-800/80 space-y-1">
                <div className="flex items-center gap-1.5 text-cyan-300 font-semibold">
                  <HelpCircle className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>表示中のURLとCloudflare Tunnelについて</span>
                </div>
                <ul className="space-y-1 pl-4 list-disc text-slate-400 leading-relaxed">
                  <li>
                    <span className="text-slate-300 font-medium">現在表示中のURL:</span> ブラウザで開いている現在の接続先です（AI Studioクラウド環境、自前PC localhost、またはTunnelのいずれか）。
                  </li>
                  <li>
                    <span className="text-slate-300 font-medium">Cloudflare Tunnel（<code>https://*.trycloudflare.com</code>）:</span> Windows PCで <code className="text-cyan-300 bg-slate-900 px-1 py-0.5 rounded">start-server-and-tunnel.bat</code> を起動すると、黒い画面に自動発行されます。そのURLをブラウザで開くと、この表示も自動でそのアドレスになります。
                  </li>
                  {status.lan_ips && status.lan_ips.length > 0 && (
                    <li>
                      <span className="text-slate-300 font-medium">同一Wi-Fi/LAN接続:</span>{" "}
                      {status.lan_ips.map((ip) => (
                        <code key={ip} className="mr-2 text-cyan-300 font-mono bg-slate-900 px-1.5 py-0.5 rounded">http://{ip}:3000</code>
                      ))}
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* Server Start / Stop Button */}
          <div className="flex items-center gap-2 self-start lg:self-center">
            {!status.server_running ? (
              <button
                disabled={isActionLoading}
                onClick={onStartServer}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-lg flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>▶ サーバー起動</span>
              </button>
            ) : (
              <button
                disabled={isActionLoading}
                onClick={onStopServer}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm rounded-lg flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>⏹ サーバー停止</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 2. タスク管理設定 & 計算進捗サマリー (Mid Frame: 2 Columns) - gui_server.py mid_frame */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* 左側: タスク範囲設定 & 続きの追加 (task_cfg_frame) */}
        <section className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                タスク範囲設定 &amp; 続きの追加
              </h3>
              <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800/80 px-2.5 py-0.5 rounded">
                全体範囲: [ 1 〜 {maxRangeInfo.max_end > 0 ? maxRangeInfo.max_end.toLocaleString() : "未登録"} ] (計 {maxRangeInfo.total} タスク)
              </span>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  開始 n:
                </label>
                <input
                  type="number"
                  min={1}
                  value={rangeStart}
                  onChange={(e) => setRangeStart(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-slate-100 font-mono text-sm focus:outline-hidden focus:border-cyan-500"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  終了 n:
                </label>
                <input
                  type="number"
                  min={1}
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-slate-100 font-mono text-sm focus:outline-hidden focus:border-cyan-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  分割:
                </label>
                <input
                  type="number"
                  min={1}
                  value={chunkSize}
                  onChange={(e) => setChunkSize(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-md text-slate-100 font-mono text-sm focus:outline-hidden focus:border-cyan-500"
                />
              </div>

              <div className="sm:col-span-4">
                <button
                  type="button"
                  onClick={handleAutoFillNextRange}
                  className="w-full py-1.5 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                >
                  <span>⏩ 続きの範囲を自動入力</span>
                </button>
              </div>
            </div>

            {/* Notification alert */}
            {taskNotice && (
              <div
                className={`mt-3 p-2.5 rounded-lg text-xs flex items-center gap-2 border ${
                  taskNotice.type === "success"
                    ? "bg-emerald-950/80 border-emerald-600/50 text-emerald-200"
                    : taskNotice.type === "error"
                    ? "bg-rose-950/80 border-rose-600/50 text-rose-200"
                    : "bg-cyan-950/80 border-cyan-600/50 text-cyan-200"
                }`}
              >
                {taskNotice.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{taskNotice.text}</span>
              </div>
            )}
          </div>

          {/* Action buttons bar (gui_server.py: ➕ 続きのタスクを追加, ⚡ 最初からやり直す, ↺ 全て再計算) */}
          <div className="flex flex-wrap items-center gap-2 pt-4 mt-4 border-t border-slate-800/80">
            <button
              disabled={isTaskOperating}
              onClick={handleAppendTasks}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>➕ 続きのタスクを追加</span>
            </button>

            <button
              disabled={isTaskOperating}
              onClick={handleRegenerateTasks}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>⚡ 最初からやり直す (全リセット)</span>
            </button>

            <button
              disabled={isTaskOperating}
              onClick={handleRevertAllTasks}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>↺ 全て再計算</span>
            </button>
          </div>
        </section>

        {/* 右側: 計算進捗サマリー (stats_frame) */}
        <section className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-emerald-400" />
                計算進捗サマリー
              </h3>
              <span className="text-xs font-mono font-bold text-emerald-400">
                {completionPct} %
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-950 rounded-full h-3.5 border border-slate-800 overflow-hidden mb-4 p-0.5">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500 shadow-sm shadow-emerald-500/50"
                style={{ width: `${Math.min(100, Math.max(0, parseFloat(completionPct)))}%` }}
              />
            </div>

            {/* 4 Metric Badges - gui_server.py 完了, 実行中, 未処理, 発見解数 */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg">
                <div className="text-[11px] text-slate-400">完了タスク</div>
                <div className="text-base font-bold font-mono text-emerald-400 tabular-nums">
                  {db.completed.toLocaleString()} / {db.total.toLocaleString()}
                </div>
              </div>

              <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg">
                <div className="text-[11px] text-slate-400">実行中タスク</div>
                <div className="text-base font-bold font-mono text-sky-400 tabular-nums">
                  {db.running.toLocaleString()}
                </div>
              </div>

              <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg">
                <div className="text-[11px] text-slate-400">未処理タスク</div>
                <div className="text-base font-bold font-mono text-amber-400 tabular-nums">
                  {db.pending.toLocaleString()}
                </div>
              </div>

              <div className="p-2.5 bg-slate-950/80 border border-indigo-900/60 rounded-lg bg-indigo-950/20">
                <div className="text-[11px] text-indigo-300">発見解数 φ⁻¹(n)</div>
                <div className="text-base font-bold font-mono text-indigo-300 tabular-nums">
                  {db.total_solutions.toLocaleString()} 個
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>稼働時間: {Math.floor(status.uptime_seconds / 60)}分 {status.uptime_seconds % 60}秒</span>
            <button
              onClick={onRefresh}
              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>更新</span>
            </button>
          </div>
        </section>
      </div>

      {/* 3. 接続中のワーカーPC (最大22台) & 計算開始指示 - gui_server.py worker_frame */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
        {/* Worker Action Control Bar (gui_server.py w_ctl_bar) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            {/* 一括操作ボタン */}
            <button
              disabled={isWorkerActionLoading}
              onClick={handleStartAllWorkers}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>▶ 全ワーカー一括開始</span>
            </button>

            <button
              disabled={isWorkerActionLoading}
              onClick={handlePauseAllWorkers}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold text-xs rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <span>⏸ 全ワーカー一時停止</span>
            </button>

            {/* Separator */}
            <div className="h-5 w-px bg-slate-700 mx-1 hidden sm:block" />

            {/* 個別ワーカー指定操作 */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">指定ワーカー:</span>
              <select
                value={selectedWorkerId}
                onChange={(e) => setSelectedWorkerId(e.target.value)}
                className="px-2 py-1 bg-slate-950 border border-slate-700 text-slate-200 text-xs font-mono rounded-md focus:outline-hidden focus:border-cyan-500"
              >
                {allActiveWorkers.length === 0 ? (
                  <option value="">(接続ワーカーなし)</option>
                ) : (
                  allActiveWorkers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.id} ({w.status})
                    </option>
                  ))
                )}
              </select>

              <button
                disabled={isWorkerActionLoading || !selectedWorkerId}
                onClick={handleStartSelectedWorker}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg flex items-center gap-1 shadow-sm transition-all disabled:opacity-50 cursor-pointer"
              >
                <span>▶ 開始</span>
              </button>

              <button
                disabled={isWorkerActionLoading || !selectedWorkerId}
                onClick={handlePauseSelectedWorker}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold text-xs rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                <span>⏸ 停止</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSpawnLanWorkers}
              disabled={isWorkerActionLoading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-800/60 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>+3 LANワーカー起動</span>
            </button>
          </div>
        </div>

        {/* Workers Table (Treeview) */}
        <div className="overflow-x-auto border border-slate-800 rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase font-mono tracking-wider">
              <tr>
                <th className="py-2.5 px-3">ワーカーID</th>
                <th className="py-2.5 px-3">状態</th>
                <th className="py-2.5 px-3">IP / 接続元</th>
                <th className="py-2.5 px-3">現在担当の計算範囲</th>
                <th className="py-2.5 px-3 text-center">最終生存確認</th>
                <th className="py-2.5 px-3 text-right">完了タスク数</th>
                <th className="py-2.5 px-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {allActiveWorkers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    現在接続中のワーカーPCはありません。ワーカーPCを起動するか、上部の「ワーカーPC」タブからブラウザで参加してください。
                  </td>
                </tr>
              ) : (
                allActiveWorkers.map((w) => {
                  const isSelected = selectedWorkerId === w.id;
                  const isRunning = w.rawStatus === "RUNNING";
                  return (
                    <tr
                      key={w.id}
                      onClick={() => setSelectedWorkerId(w.id)}
                      className={`hover:bg-slate-800/60 transition-colors cursor-pointer ${
                        isSelected ? "bg-slate-800/90 font-medium" : ""
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-100 flex items-center gap-2">
                        <span>{w.id}</span>
                        {w.type === "WEB" && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded font-sans font-semibold bg-cyan-950 text-cyan-400 border border-cyan-800">
                            Web
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            isRunning
                              ? "bg-emerald-950/80 text-emerald-400 border border-emerald-700/60"
                              : w.rawStatus === "STANDBY"
                              ? "bg-amber-950/80 text-amber-300 border border-amber-700/60"
                              : w.rawStatus === "PAUSED"
                              ? "bg-slate-800 text-slate-300 border border-slate-700"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isRunning ? "bg-emerald-400 animate-pulse" : "bg-slate-400"
                            }`}
                          />
                          {w.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-400">{w.address}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-300">{w.task_range}</td>
                      <td className="py-2.5 px-3 font-mono text-center text-slate-400">{w.last_hb}</td>
                      <td className="py-2.5 px-3 font-mono text-right font-bold text-slate-200 tabular-nums">
                        {w.completed.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {!isRunning ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedWorkerId(w.id);
                                handleStartSelectedWorker();
                              }}
                              className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold cursor-pointer"
                            >
                              開始
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedWorkerId(w.id);
                                handlePauseSelectedWorker();
                              }}
                              className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[11px] cursor-pointer"
                            >
                              停止
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. サーバーリアルタイム動作ログ - gui_server.py log_frame */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <span>サーバーリアルタイム動作ログ</span>
            <span className="text-[11px] font-mono text-slate-400">
              (最新 {serverLogs.length} 行)
            </span>
          </h3>
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoScrollLog}
                onChange={(e) => setAutoScrollLog(e.target.checked)}
                className="rounded border-slate-700 bg-slate-950 text-cyan-500 focus:ring-0"
              />
              <span>自動スクロール</span>
            </label>
          </div>
        </div>

        {/* Monospace Log Box */}
        <div
          ref={logContainerRef}
          className="h-44 sm:h-52 bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-300 overflow-y-auto space-y-1 select-text"
        >
          {!Array.isArray(serverLogs) || serverLogs.length === 0 ? (
            <div className="text-slate-600 italic">ログ待機中...</div>
          ) : (
            serverLogs.map((log, idx) => (
              <div key={idx} className="leading-relaxed hover:bg-slate-900/60 px-1 rounded">
                {log}
              </div>
            ))
          )}
        </div>

        {/* Log Toolbar (gui_server.py: ログ消去, tasks.dbをバックアップ, バックアップ先を開く, 結果保存フォルダを開く, 処理時間グラフ作成) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div className="flex items-center gap-2">
            <button
              onClick={handleClearLog}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>ログ消去</span>
            </button>

            <button
              onClick={handleBackupDatabase}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              <span>💾 tasks.dbをバックアップ</span>
            </button>

            <button
              onClick={handleOpenBackupsModal}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-md text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>📂 バックアップ一覧</span>
            </button>

            <button
              onClick={handleOpenResultsModal}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-800/60 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
              <span>📁 結果フォルダ・ファイル一覧</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {backupNotice && (
              <span className="text-xs text-emerald-400 font-semibold">{backupNotice}</span>
            )}
            <button
              onClick={onOpenBenchmark}
              className="px-3.5 py-1.5 bg-indigo-900/60 hover:bg-indigo-800/70 text-indigo-200 border border-indigo-700/60 rounded-md text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>📊 処理時間グラフ作成</span>
            </button>
          </div>
        </div>
      </section>

      {/* Backups List Modal */}
      {showBackupsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-amber-400" />
                <span>tasks.db バックアップ一覧 (parallel/data/backups)</span>
              </h3>
              <button
                onClick={() => setShowBackupsModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-2">
              {backupsList.length === 0 ? (
                <div className="text-xs text-slate-500 py-4 text-center">
                  保存されているバックアップはありません。「tasks.dbをバックアップ」ボタンを押して作成できます。
                </div>
              ) : (
                backupsList.map((b) => (
                  <div
                    key={b.filename}
                    className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-mono font-bold text-slate-200">{b.filename}</div>
                      <div className="text-slate-500 text-[11px]">
                        {new Date(b.created_at).toLocaleString()} · {(b.size_bytes / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <a
                      href={`/api/cluster/database/backup/download/${encodeURIComponent(b.filename)}`}
                      download={b.filename}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded text-xs flex items-center gap-1 font-semibold transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      <span>DL</span>
                    </a>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowBackupsModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results Folder Modal */}
      {showResultsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full p-5 space-y-4 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    計算結果の保存先フォルダ (parallel/data/results)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    各タスクごとの計算完了データ (JSON) およびデータベースがここに保存されています
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowResultsModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Folder Location & Downloads Header Box */}
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 space-y-2.5 text-xs">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-semibold">📁 結果JSONファイル格納フォルダ:</span>
                  <span className="font-mono text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-800/80 px-2 py-0.5 rounded">
                    parallel/data/results/
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-semibold">🗄️ 全体進行状況・タスクDB:</span>
                  <span className="font-mono text-cyan-400 font-bold bg-cyan-950/60 border border-cyan-800/80 px-2 py-0.5 rounded">
                    parallel/data/tasks.db
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-400 text-[11px]">
                  保存済み結果ファイル:{" "}
                  <strong className="text-slate-100 font-mono">
                    {resultsData ? resultsData.total_count : "..."} 件
                  </strong>{" "}
                  ({resultsData ? (resultsData.total_size_bytes / 1024).toFixed(1) : 0} KB)
                </span>

                <div className="flex items-center gap-2">
                  <a
                    href="/api/cluster/results/download/zip"
                    download="endo_results_all.zip"
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>📦 全結果を一括ZIPダウンロード</span>
                  </a>

                  <a
                    href="/api/cluster/database/download"
                    download="tasks.db"
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 font-semibold rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Database className="w-3.5 h-3.5 text-cyan-400" />
                    <span>💾 tasks.db</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Structure info box */}
            <div className="bg-slate-800/40 border border-slate-800 rounded-lg p-2.5 text-[11px] text-slate-300 space-y-1">
              <div className="font-semibold text-slate-200">ℹ️ 各結果ファイル (task_XX.json) に含まれるデータ:</div>
              <ul className="list-disc list-inside space-y-0.5 text-slate-400 font-mono text-[10px]">
                <li><code className="text-slate-200">task_id</code>: タスク番号 / <code className="text-slate-200">worker_id</code>: 担当ワーカー</li>
                <li><code className="text-slate-200">duration</code>: 計算所要時間 (秒) / <code className="text-slate-200">completed_at</code>: 完了日時</li>
                <li><code className="text-slate-200">result.start 〜 result.end</code>: 計算した n の整数区間</li>
                <li><code className="text-slate-200">result.total_solutions</code>: 発見されたトーシェント逆像解の総数</li>
                <li><code className="text-slate-200">result.sample_solutions</code>: 各 n の解リスト</li>
              </ul>
            </div>

            {/* Files List */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-[160px]">
              {isLoadingResults ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  結果ファイル一覧を読み込み中...
                </div>
              ) : !resultsData || resultsData.files.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  まだ完了したタスク結果ファイルはありません。
                </div>
              ) : (
                resultsData.files.map((f) => (
                  <div
                    key={f.filename}
                    className="p-2 bg-slate-950 border border-slate-800/80 rounded-lg flex items-center justify-between text-xs hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-200">{f.filename}</span>
                      {f.task_id && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                          タスク #{f.task_id}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-mono text-slate-500">
                        {(f.size_bytes / 1024).toFixed(1)} KB
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(f.updated_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
              <span className="text-[11px] text-slate-500">
                ローカル環境ではプロジェクトの <code>parallel/data/results/</code> ディレクトリを開くことで直接閲覧できます。
              </span>
              <button
                onClick={() => setShowResultsModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
