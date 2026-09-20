import React from "react";
import { Server, Play, Square, Cpu, RefreshCw, Layers } from "lucide-react";

interface HeaderProps {
  serverRunning: boolean;
  activeWorkers: number;
  totalWorkers: number;
  onStartServer: () => void;
  onStopServer: () => void;
  onSpawnWorkers: (count: number) => void;
  onResetTasks: () => void;
  isActionLoading: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  serverRunning,
  activeWorkers,
  totalWorkers,
  onStartServer,
  onStopServer,
  onSpawnWorkers,
  onResetTasks,
  isActionLoading,
}) => {
  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-cyan-400 flex items-center justify-center font-mono font-bold text-lg shadow-inner">
            φ⁻¹
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                LAN分散計算システム
              </h1>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-50 text-cyan-800 border border-cyan-200 font-mono">
                Endo Method
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              親サーバー1台・最大22台ワーカーPCによるオイラー関数逆像 φ(x)=n 動的並列求解
            </p>
          </div>
        </div>

        {/* Status Pills & Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* Server Indicator */}
          <div className="flex items-center px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium">
            <span
              className={`w-2 h-2 rounded-full mr-2 ${
                serverRunning ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
              }`}
            />
            <span className="text-slate-600 mr-1.5">親サーバー:</span>
            <span
              className={`font-semibold ${
                serverRunning ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {serverRunning ? "RUNNING (0.0.0.0:5000)" : "STOPPED"}
            </span>
          </div>

          {/* Active Workers Badge */}
          <div className="flex items-center px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-medium">
            <Cpu className="w-3.5 h-3.5 mr-1.5 text-cyan-600" />
            <span className="text-slate-600 mr-1">ワーカー:</span>
            <span className="font-bold text-slate-900 font-mono">
              {activeWorkers} / {totalWorkers}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            {!serverRunning ? (
              <button
                id="btn-start-server"
                disabled={isActionLoading}
                onClick={onStartServer}
                className="inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs transition-colors disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 mr-1 fill-current" />
                サーバー起動
              </button>
            ) : (
              <button
                id="btn-stop-server"
                disabled={isActionLoading}
                onClick={onStopServer}
                className="inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 text-white hover:bg-rose-700 shadow-xs transition-colors disabled:opacity-50"
              >
                <Square className="w-3.5 h-3.5 mr-1 fill-current" />
                サーバー停止
              </button>
            )}

            {serverRunning && (
              <>
                <button
                  id="btn-spawn-workers-5"
                  disabled={isActionLoading}
                  onClick={() => onSpawnWorkers(activeWorkers + 3 <= 22 ? activeWorkers + 3 : 22)}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 shadow-xs transition-colors disabled:opacity-50"
                >
                  <Cpu className="w-3.5 h-3.5 mr-1" />
                  +3 ワーカー
                </button>
                <button
                  id="btn-spawn-workers-22"
                  disabled={isActionLoading || activeWorkers >= 22}
                  onClick={() => onSpawnWorkers(22)}
                  className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 text-white hover:bg-cyan-700 shadow-xs transition-colors disabled:opacity-50"
                >
                  <Layers className="w-3.5 h-3.5 mr-1" />
                  全22台一括
                </button>
              </>
            )}

            <button
              id="btn-reset-tasks"
              disabled={isActionLoading}
              onClick={onResetTasks}
              title="全タスクを未処理(PENDING)に戻す"
              className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
