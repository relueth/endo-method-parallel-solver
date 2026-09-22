import React, { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  RefreshCw,
  Clock,
  CheckCircle2,
  Cpu,
  BarChart3,
  Layers,
  FileSpreadsheet,
} from "lucide-react";

interface BenchmarkPoint {
  task_id: number;
  start: number;
  end: number;
  label: string;
  range_display: string;
  duration_sec: number;
  total_solutions: number;
  solvable_count: number;
  worker_id: string;
  completed_at: string;
}

interface BenchmarkData {
  points: BenchmarkPoint[];
  summary: {
    total_tasks: number;
    avg_duration: number;
    total_solutions: number;
    min_end: number;
    max_end: number;
  };
}

export const BenchmarkChart: React.FC = () => {
  const [data, setData] = useState<BenchmarkData>({
    points: [],
    summary: { total_tasks: 0, avg_duration: 0, total_solutions: 0, min_end: 0, max_end: 0 },
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const [metric, setMetric] = useState<"duration" | "solutions">("duration");

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/cluster/results/benchmark");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error("ベンチマーク取得エラー:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const points = data.points || [];
  const maxDuration = points.length > 0 ? Math.max(...points.map((p) => p.duration_sec)) : 0;
  const maxSolutions = points.length > 0 ? Math.max(...points.map((p) => p.total_solutions)) : 0;

  return (
    <div id="benchmark-chart-container" className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-800 tracking-tight">
                  処理時間・スケーラビリティ分析
                </h2>
                <p className="text-xs text-slate-500">
                  results/ フォルダの完了データから、分割範囲ごとの計算所要時間（秒）を可視化
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Metric Toggle */}
            <div className="inline-flex bg-slate-100 p-1 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setMetric("duration")}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                  metric === "duration"
                    ? "bg-white text-slate-900 shadow-xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                処理時間 (秒)
              </button>
              <button
                type="button"
                onClick={() => setMetric("solutions")}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                  metric === "solutions"
                    ? "bg-white text-slate-900 shadow-xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                発見解数
              </button>
            </div>

            {/* Chart Type Toggle */}
            <div className="inline-flex bg-slate-100 p-1 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setChartType("line")}
                className={`px-2.5 py-1.5 rounded-md transition-all ${
                  chartType === "line"
                    ? "bg-white text-slate-900 shadow-xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                折れ線
              </button>
              <button
                type="button"
                onClick={() => setChartType("bar")}
                className={`px-2.5 py-1.5 rounded-md transition-all ${
                  chartType === "bar"
                    ? "bg-white text-slate-900 shadow-xs font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                棒グラフ
              </button>
            </div>

            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-xs transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              再集計
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
          <div className="p-3 bg-slate-50 rounded-lg">
            <span className="text-[11px] font-medium text-slate-500 block">完了タスク数</span>
            <span className="text-xl font-bold text-slate-800">{data.summary.total_tasks} 件</span>
          </div>
          <div className="p-3 bg-indigo-50/60 rounded-lg">
            <span className="text-[11px] font-medium text-indigo-700 block">平均所要時間</span>
            <span className="text-xl font-bold text-indigo-900">{data.summary.avg_duration} 秒</span>
          </div>
          <div className="p-3 bg-emerald-50/60 rounded-lg">
            <span className="text-[11px] font-medium text-emerald-700 block">累計発見解数</span>
            <span className="text-xl font-bold text-emerald-900">
              {data.summary.total_solutions.toLocaleString()} 件
            </span>
          </div>
          <div className="p-3 bg-amber-50/60 rounded-lg">
            <span className="text-[11px] font-medium text-amber-700 block">最大所要時間</span>
            <span className="text-xl font-bold text-amber-900">{maxDuration.toFixed(2)} 秒</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
            <h3 className="text-sm font-semibold text-slate-800">
              {metric === "duration"
                ? "横軸: 範囲 (n=〜) ✕ 縦軸: 処理所要時間 (秒)"
                : "横軸: 範囲 (n=〜) ✕ 縦軸: 発見解数"}
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {points.length > 0 ? `n = ${points[0].start} 〜 ${points[points.length - 1].end}` : "データ待機中"}
          </span>
        </div>

        {points.length === 0 ? (
          <div className="h-72 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
            <Clock className="w-8 h-8 mb-2 stroke-[1.5]" />
            <p className="text-sm font-medium">results/ フォルダに計算完了データがまだありません</p>
            <p className="text-xs mt-1">タスクを実行して完了すると、ここにグラフが自動プロットされます。</p>
          </div>
        ) : (
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "line" ? (
                <LineChart data={points} margin={{ top: 10, right: 20, left: 10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    label={{
                      value: "分割上限 n (例: 100, 200, 300, ...)",
                      position: "insideBottom",
                      offset: -15,
                      fill: "#64748b",
                      fontSize: 12,
                    }}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    label={{
                      value: metric === "duration" ? "所要時間 (秒)" : "発見解数",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#64748b",
                      fontSize: 12,
                    }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const p: BenchmarkPoint = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-lg shadow-lg text-xs space-y-1 border border-slate-700">
                            <div className="font-bold text-indigo-300 border-b border-slate-700 pb-1 mb-1">
                              タスク #{p.task_id} (n: {p.range_display})
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">所要時間:</span>
                              <span className="font-mono font-bold text-emerald-400">
                                {p.duration_sec.toFixed(3)} 秒
                              </span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">発見解数:</span>
                              <span className="font-mono">{p.total_solutions.toLocaleString()} 件</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">解有り n 数:</span>
                              <span className="font-mono">{p.solvable_count} 件</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">ワーカー:</span>
                              <span className="font-mono text-slate-300">{p.worker_id}</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <ReferenceLine
                    y={metric === "duration" ? data.summary.avg_duration : undefined}
                    stroke="#f59e0b"
                    strokeDasharray="3 3"
                    label={{
                      value: `平均: ${data.summary.avg_duration}s`,
                      fill: "#d97706",
                      fontSize: 10,
                      position: "top",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey={metric === "duration" ? "duration_sec" : "total_solutions"}
                    stroke="#4f46e5"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: "#4f46e5" }}
                    activeDot={{ r: 6, fill: "#4338ca" }}
                  />
                </LineChart>
              ) : (
                <BarChart data={points} margin={{ top: 10, right: 20, left: 10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="label"
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    label={{
                      value: "分割上限 n (例: 100, 200, 300, ...)",
                      position: "insideBottom",
                      offset: -15,
                      fill: "#64748b",
                      fontSize: 12,
                    }}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={11}
                    tickLine={false}
                    label={{
                      value: metric === "duration" ? "所要時間 (秒)" : "発見解数",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#64748b",
                      fontSize: 12,
                    }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const p: BenchmarkPoint = payload[0].payload;
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-lg shadow-lg text-xs space-y-1 border border-slate-700">
                            <div className="font-bold text-indigo-300 border-b border-slate-700 pb-1 mb-1">
                              タスク #{p.task_id} (n: {p.range_display})
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">所要時間:</span>
                              <span className="font-mono font-bold text-emerald-400">
                                {p.duration_sec.toFixed(3)} 秒
                              </span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">発見解数:</span>
                              <span className="font-mono">{p.total_solutions.toLocaleString()} 件</span>
                            </div>
                            <div className="flex justify-between gap-4">
                              <span className="text-slate-400">ワーカー:</span>
                              <span className="font-mono text-slate-300">{p.worker_id}</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey={metric === "duration" ? "duration_sec" : "total_solutions"}
                    fill="#4f46e5"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Detail Table */}
      {points.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">
            タスク分割別 実測データ一覧 (昇順)
          </h4>
          <div className="max-h-60 overflow-y-auto border border-slate-100 rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 sticky top-0 border-b border-slate-100">
                <tr>
                  <th className="py-2 px-3 font-semibold">タスクID</th>
                  <th className="py-2 px-3 font-semibold">計算範囲 (n)</th>
                  <th className="py-2 px-3 font-semibold">横軸値 (分割点)</th>
                  <th className="py-2 px-3 font-semibold">所要時間 (縦軸)</th>
                  <th className="py-2 px-3 font-semibold">発見解数</th>
                  <th className="py-2 px-3 font-semibold">担当ワーカー</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {points.map((p) => (
                  <tr key={p.task_id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-indigo-600">#{p.task_id}</td>
                    <td className="py-2 px-3">{p.range_display}</td>
                    <td className="py-2 px-3 font-bold text-slate-800">{p.label}</td>
                    <td className="py-2 px-3 text-emerald-600 font-bold">{p.duration_sec.toFixed(3)}s</td>
                    <td className="py-2 px-3">{p.total_solutions.toLocaleString()}</td>
                    <td className="py-2 px-3 text-slate-500">{p.worker_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
