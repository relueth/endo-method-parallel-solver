import React from "react";
import { Server, Play, Square, Cpu, RefreshCw, Smartphone } from "lucide-react";

interface HeaderProps {
  activeTab: "server" | "worker" | "benchmark" | "endo" | "code";
  onSelectTab: (tab: "server" | "worker" | "benchmark" | "endo" | "code") => void;
  serverRunning: boolean;
  activeWorkers: number;
  totalWorkers: number;
  onOpenShareModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  serverRunning,
  activeWorkers,
  totalWorkers,
  onOpenShareModal,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur-md sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Zone 1: Wordmark */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-lg bg-slate-900 border border-cyan-800 text-cyan-400 flex items-center justify-center font-mono font-bold text-base shadow-inner">
            φ⁻¹
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-base sm:text-lg font-bold text-slate-100 tracking-tight whitespace-nowrap">
                LAN分散計算システム
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded font-mono font-medium bg-cyan-950 text-cyan-300 border border-cyan-800">
                Endo Method
              </span>
            </div>
          </div>
        </div>

        {/* Zone 2: Navigation Links (Mode Selection) */}
        <nav className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-1">
          <button
            onClick={() => onSelectTab("server")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === "server"
                ? "bg-sky-500 text-slate-950 shadow-sm shadow-sky-500/30"
                : "bg-slate-900 text-slate-300 hover:text-white border border-slate-800"
            }`}
          >
            <span>🖥️ 親サーバー</span>
            <span className="text-[10px] opacity-75 font-mono">(gui_server)</span>
          </button>

          <button
            onClick={() => onSelectTab("worker")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
              activeTab === "worker"
                ? "bg-cyan-400 text-slate-950 shadow-sm shadow-cyan-400/30"
                : "bg-slate-900 text-slate-300 hover:text-white border border-slate-800"
            }`}
          >
            <span>⚡ ワーカーPC</span>
            <span className="text-[10px] opacity-75 font-mono">(gui_worker)</span>
          </button>

          <button
            onClick={() => onSelectTab("benchmark")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "benchmark"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            📊 処理時間グラフ
          </button>

          <button
            onClick={() => onSelectTab("endo")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "endo"
                ? "bg-slate-800 text-cyan-300 border border-slate-700 font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            🧮 単体検算
          </button>

          <button
            onClick={() => onSelectTab("code")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === "code"
                ? "bg-slate-800 text-cyan-300 border border-slate-700 font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            📖 起動手順
          </button>
        </nav>

        {/* Zone 3: 1-2 Primary Actions & Quick Telemetry */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Server Indicator */}
          <div className="hidden sm:flex items-center px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-xs font-mono">
            <span
              className={`w-2 h-2 rounded-full mr-2 ${
                serverRunning ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
              }`}
            />
            <span className="text-slate-400 mr-1.5">サーバー:</span>
            <span className={`font-semibold ${serverRunning ? "text-emerald-400" : "text-slate-500"}`}>
              {serverRunning ? "稼働中" : "停止中"}
            </span>
          </div>

          {/* Active Workers Badge */}
          <div className="flex items-center px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-xs font-mono">
            <Cpu className="w-3.5 h-3.5 mr-1.5 text-cyan-400" />
            <span className="text-slate-400 mr-1">稼働:</span>
            <span className="font-bold text-slate-100 tabular-nums">{activeWorkers}台</span>
          </div>

          {onOpenShareModal && (
            <button
              onClick={onOpenShareModal}
              title="スマホや別PCから接続するためのQRコードを表示"
              className="px-3 py-1.5 rounded-md text-xs font-semibold bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-700/60 shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
              <span>📱 端末招待</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
