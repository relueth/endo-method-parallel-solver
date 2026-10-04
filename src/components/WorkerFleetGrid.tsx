import React from "react";
import { WorkerSlot, WebWorkerSlot } from "../types";
import {
  Cpu,
  Power,
  Zap,
  AlertTriangle,
  CheckCircle,
  Wifi,
  WifiOff,
  Globe,
  Play,
  Pause,
  Layers,
} from "lucide-react";

interface WorkerFleetGridProps {
  workers: WorkerSlot[];
  webWorkers?: WebWorkerSlot[];
  serverRunning: boolean;
  onSpawnWorker: (workerId: string) => void;
  onKillWorker: (workerId: string) => void;
  onStartAllWebWorkers?: () => void;
  onPauseAllWebWorkers?: () => void;
  onStartWebWorker?: (id: string) => void;
  onPauseWebWorker?: (id: string) => void;
  onOpenWebWorker?: () => void;
}

export const WorkerFleetGrid: React.FC<WorkerFleetGridProps> = ({
  workers,
  webWorkers = [],
  serverRunning,
  onSpawnWorker,
  onKillWorker,
  onStartAllWebWorkers,
  onPauseAllWebWorkers,
  onStartWebWorker,
  onPauseWebWorker,
  onOpenWebWorker,
}) => {
  return (
    <div className="space-y-6">
      {/* Webワーカー (ブラウザ接続ノード) セクション */}
      <section className="bg-white rounded-xl border border-cyan-200/80 p-5 shadow-xs bg-linear-to-b from-cyan-50/20 to-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-cyan-100">
          <div>
            <div className="flex items-center space-x-2">
              <Globe className="w-4 h-4 text-cyan-600" />
              <h2 className="text-sm font-bold text-slate-900 tracking-wide uppercase">
                Webブラウザ・計算ワーカーフリート (WebSocket ノード)
              </h2>
              <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-cyan-100 text-cyan-800 font-bold">
                {webWorkers.length} 台接続中
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Pyodide (Wasm) とマルチコア Web Worker でブラウザ上からリアルタイム参加している分散計算ノード
            </p>
          </div>

          <div className="flex items-center gap-2">
            {webWorkers.length > 0 ? (
              <>
                <button
                  onClick={onStartAllWebWorkers}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Play className="w-3.5 h-3.5 fill-white" />
                  Web全開始
                </button>
                <button
                  onClick={onPauseAllWebWorkers}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Pause className="w-3.5 h-3.5 fill-white" />
                  Web全一時停止
                </button>
              </>
            ) : (
              onOpenWebWorker && (
                <button
                  onClick={onOpenWebWorker}
                  className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Globe className="w-3.5 h-3.5" />
                  Webワーカー画面を開く
                </button>
              )
            )}
          </div>
        </div>

        {webWorkers.length === 0 ? (
          <div className="text-center py-6 px-4 border border-dashed border-cyan-300 rounded-xl bg-cyan-50/40 text-xs text-slate-600 flex flex-col items-center justify-center gap-3">
            <p className="text-slate-600">
              現在接続中のWebブラウザワーカーはいません。下のボタンを押すと、このブラウザを計算ワーカーとして参加させることができます。
            </p>
            {onOpenWebWorker && (
              <button
                onClick={onOpenWebWorker}
                className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-lg flex items-center gap-2 shadow-md shadow-cyan-600/25 transition-all cursor-pointer"
              >
                <Globe className="w-4 h-4" />
                このブラウザで分散計算に参加する (Web Worker を開く)
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {webWorkers.map((w) => {
              const isRunning = w.status === "RUNNING";
              const isStandby = w.status === "STANDBY";
              const isPaused = w.status === "PAUSED";

              return (
                <div
                  key={w.worker_id}
                  className={`rounded-lg p-3.5 border transition-all text-xs flex flex-col justify-between ${
                    isRunning
                      ? "bg-emerald-50/60 border-emerald-300 shadow-xs"
                      : isStandby
                      ? "bg-amber-50/50 border-amber-200"
                      : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-cyan-600" />
                        {w.worker_id}
                      </span>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono ${
                          isRunning
                            ? "bg-emerald-100 text-emerald-800"
                            : isStandby
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {w.status}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-slate-600 mb-2">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-400">スレッド / エンジン:</span>
                        <span className="font-mono font-semibold text-slate-800">
                          {w.cores} コア ({w.engine})
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-400">担当タスク:</span>
                        <span
                          className={`font-mono font-medium truncate max-w-[120px] ${
                            isRunning ? "text-emerald-700 font-semibold" : "text-slate-500"
                          }`}
                        >
                          {w.task_range !== "-" ? `#${w.task_id} (${w.task_range})` : "待機中"}
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-400">計算速度:</span>
                        <span className="font-mono font-bold text-cyan-700">
                          {w.speed} n/sec
                        </span>
                      </div>

                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-400">完了数 / 発見解数:</span>
                        <span className="font-mono text-slate-700">
                          {w.completed_count} 回 / {w.total_solutions} 解
                        </span>
                      </div>

                      {w.last_heartbeat_ago !== null && (
                        <div className="flex justify-between items-center text-[10px] text-slate-400 pt-0.5">
                          <span>Heartbeat:</span>
                          <span className="font-mono text-emerald-600">
                            {w.last_heartbeat_ago}s 前
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200/60 flex items-center gap-1.5">
                    {isRunning ? (
                      <button
                        onClick={() => onPauseWebWorker && onPauseWebWorker(w.worker_id)}
                        className="w-full py-1 px-2 rounded bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 text-[11px] font-medium flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Pause className="w-3 h-3 mr-1" />
                        一時停止
                      </button>
                    ) : (
                      <button
                        onClick={() => onStartWebWorker && onStartWebWorker(w.worker_id)}
                        className="w-full py-1 px-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 text-[11px] font-medium flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <Play className="w-3 h-3 mr-1 fill-white" />
                        計算開始
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* LAN物理PCワーカー一覧 (PC01 〜 PC22) */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
          <div>
            <div className="flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-slate-700" />
              <h2 className="text-sm font-bold text-slate-900 tracking-wide uppercase">
                LAN物理PCワーカー (最大22台: PC01 〜 PC22)
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Python Socket通信ワーカー・自動検出IP・5秒Heartbeat・30秒異常検知タスク自動再配分
            </p>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <span className="inline-flex items-center text-emerald-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
              RUNNING
            </span>
            <span className="inline-flex items-center text-cyan-700">
              <span className="w-2 h-2 rounded-full bg-cyan-500 mr-1.5" />
              CONNECTED
            </span>
            <span className="inline-flex items-center text-amber-700">
              <span className="w-2 h-2 rounded-full bg-amber-500 mr-1.5" />
              WAITING
            </span>
            <span className="inline-flex items-center text-slate-400">
              <span className="w-2 h-2 rounded-full bg-slate-300 mr-1.5" />
              OFFLINE
            </span>
          </div>
        </div>

        {/* Grid of 22 Workers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {workers.map((worker) => {
            const isRunning = worker.status === "RUNNING";
            const isConnected = worker.status === "CONNECTED";
            const isWaiting = worker.status === "WAITING";
            const isOffline = worker.status === "DISCONNECTED";

            return (
              <div
                key={worker.worker_id}
                className={`relative rounded-lg p-3 border transition-all text-xs ${
                  isRunning
                    ? "bg-emerald-50/60 border-emerald-300 shadow-xs"
                    : isConnected
                    ? "bg-cyan-50/40 border-cyan-200"
                    : isWaiting
                    ? "bg-amber-50/40 border-amber-200"
                    : "bg-slate-50 border-slate-200 opacity-80 hover:opacity-100"
                }`}
              >
                {/* Header inside card */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono font-bold text-slate-900 text-sm flex items-center">
                    {worker.worker_id}
                  </span>

                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                      isRunning
                        ? "bg-emerald-100 text-emerald-800"
                        : isConnected
                        ? "bg-cyan-100 text-cyan-800"
                        : isWaiting
                        ? "bg-amber-100 text-amber-800"
                        : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {worker.status}
                  </span>
                </div>

                {/* IP and stats */}
                <div className="space-y-1 text-slate-600 mb-2">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-400">IPアドレス:</span>
                    <span className="font-mono text-slate-700">{worker.address}</span>
                  </div>

                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-400">担当タスク:</span>
                    <span
                      className={`font-mono font-medium truncate max-w-[110px] ${
                        isRunning ? "text-emerald-700 font-semibold" : "text-slate-500"
                      }`}
                    >
                      {worker.task_range !== "-" ? worker.task_range : "なし"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-400">完了件数:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {worker.completed_count} 回
                    </span>
                  </div>

                  {worker.last_heartbeat_ago !== null && !isOffline && (
                    <div className="flex justify-between items-center text-[10px] text-slate-500 pt-0.5">
                      <span>Heartbeat:</span>
                      <span className="font-mono text-cyan-700">
                        {worker.last_heartbeat_ago}s 前
                      </span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between gap-1">
                  {isOffline ? (
                    <button
                      disabled={!serverRunning}
                      onClick={() => onSpawnWorker(worker.worker_id)}
                      className="w-full py-1 px-2 rounded bg-slate-800 text-white hover:bg-slate-700 text-[11px] font-medium flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      <Power className="w-3 h-3 mr-1" />
                      接続起動
                    </button>
                  ) : (
                    <button
                      onClick={() => onKillWorker(worker.worker_id)}
                      title="ワーカーを強制切断し、異常検知＆タスク再配分を検証"
                      className="w-full py-1 px-2 rounded bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 text-[11px] font-medium flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <AlertTriangle className="w-3 h-3 mr-1 text-rose-500" />
                      強制離脱テスト
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
