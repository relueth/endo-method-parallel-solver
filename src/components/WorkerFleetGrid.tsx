import React from "react";
import { WorkerSlot } from "../types";
import { Cpu, Power, Zap, AlertTriangle, CheckCircle, Wifi, WifiOff } from "lucide-react";

interface WorkerFleetGridProps {
  workers: WorkerSlot[];
  serverRunning: boolean;
  onSpawnWorker: (workerId: string) => void;
  onKillWorker: (workerId: string) => void;
}

export const WorkerFleetGrid: React.FC<WorkerFleetGridProps> = ({
  workers,
  serverRunning,
  onSpawnWorker,
  onKillWorker,
}) => {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-cyan-600" />
            <h2 className="text-sm font-bold text-slate-900 tracking-wide uppercase">
              ワーカーPC一覧 (最大22台: PC01 〜 PC22)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            仕様書 第8項(5秒Heartbeat)・第9項(30秒異常検知)・第10項(タスク自動再配分)
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
                    className="w-full py-1 px-2 rounded bg-slate-800 text-white hover:bg-slate-700 text-[11px] font-medium flex items-center justify-center transition-colors disabled:opacity-40"
                  >
                    <Power className="w-3 h-3 mr-1" />
                    接続起動
                  </button>
                ) : (
                  <button
                    onClick={() => onKillWorker(worker.worker_id)}
                    title="ワーカーを強制切断し、異常検知＆タスク再配分を検証"
                    className="w-full py-1 px-2 rounded bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 text-[11px] font-medium flex items-center justify-center transition-colors"
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
  );
};
