import React from "react";
import { DbStats } from "../types";
import { CheckCircle2, Clock, PlayCircle, Layers, Award, Activity } from "lucide-react";

interface ClusterOverviewProps {
  stats: DbStats;
  uptimeSeconds: number;
  activeWorkers: number;
}

export const ClusterOverview: React.FC<ClusterOverviewProps> = ({
  stats,
  uptimeSeconds,
  activeWorkers,
}) => {
  const formatUptime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    if (m >= 60) {
      const h = Math.floor(m / 60);
      return `${h}h ${m % 60}m ${s}s`;
    }
    return `${m}m ${s}s`;
  };

  const rate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-cyan-600" />
            <h2 className="text-sm font-bold text-slate-900 tracking-wide uppercase">
              分散クラスタ進捗状況 (Server Status)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            仕様書 第14項・第16項 準拠: SQLiteタスク永続化と動的負荷分散
          </p>
        </div>

        <div className="flex items-center space-x-4 text-xs text-slate-600">
          <div className="flex items-center">
            <Clock className="w-3.5 h-3.5 mr-1 text-slate-400" />
            <span>稼働時間: </span>
            <span className="font-mono font-semibold text-slate-800 ml-1">
              {formatUptime(uptimeSeconds)}
            </span>
          </div>
          <div className="flex items-center">
            <span className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
            <span>通信形式: </span>
            <span className="font-mono font-semibold text-slate-800 ml-1">
              TCP / JSON 1行単位
            </span>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3.5">
        {/* Pending */}
        <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">未処理 (Pending)</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-slate-900">
              {stats.pending.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400">タスク</span>
          </div>
        </div>

        {/* Running */}
        <div className="p-3.5 rounded-lg bg-cyan-50/50 border border-cyan-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-cyan-900">処理中 (Running)</span>
            <PlayCircle className="w-4 h-4 text-cyan-600 animate-spin" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-cyan-700">
              {stats.running.toLocaleString()}
            </span>
            <span className="text-xs text-cyan-600 font-medium">{activeWorkers} PC稼働</span>
          </div>
        </div>

        {/* Completed */}
        <div className="p-3.5 rounded-lg bg-emerald-50/50 border border-emerald-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-900">完了 (Completed)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-emerald-700">
              {stats.completed.toLocaleString()}
            </span>
            <span className="text-xs text-emerald-600">/ {stats.total.toLocaleString()}</span>
          </div>
        </div>

        {/* Total Solutions */}
        <div className="p-3.5 rounded-lg bg-indigo-50/50 border border-indigo-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-indigo-900">求めた解の総数</span>
            <Award className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-indigo-700">
              {stats.total_solutions.toLocaleString()}
            </span>
            <span className="text-xs text-indigo-600 font-medium">∑|φ⁻¹(n)|</span>
          </div>
        </div>

        {/* Progress Rate */}
        <div className="p-3.5 rounded-lg bg-slate-900 text-white col-span-2 sm:col-span-4 lg:col-span-1 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">全体完了率</span>
            <Layers className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-cyan-400">
              {rate.toFixed(1)}%
            </span>
            <span className="text-xs text-slate-400">
              {stats.completed}/{stats.total}
            </span>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-4">
        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-linear-to-r from-cyan-500 to-emerald-500 h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
          />
        </div>
      </div>
    </section>
  );
};
