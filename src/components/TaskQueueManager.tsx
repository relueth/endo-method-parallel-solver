import React, { useState, useEffect } from "react";
import { TaskItem } from "../types";
import { ListFilter, PlusCircle, RefreshCw, CheckCircle, Clock, PlayCircle, Search } from "lucide-react";

interface TaskQueueManagerProps {
  onGenerateTasks: (start: number, end: number, chunkSize: number) => Promise<void>;
  isGenerating: boolean;
}

export const TaskQueueManager: React.FC<TaskQueueManagerProps> = ({
  onGenerateTasks,
  isGenerating,
}) => {
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(10000);
  const [chunkSize, setChunkSize] = useState<number>(100);

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [page, setPage] = useState<number>(1);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/cluster/tasks/list?page=${page}&limit=15&status=${statusFilter}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
        setTotalCount(data.total || 0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, [page, statusFilter]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    await onGenerateTasks(rangeStart, rangeEnd, chunkSize);
    setPage(1);
    fetchTasks();
  };

  const totalPages = Math.ceil(totalCount / 15) || 1;

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center space-x-2">
            <ListFilter className="w-4 h-4 text-cyan-600" />
            <h2 className="text-sm font-bold text-slate-900 tracking-wide uppercase">
              タスク管理・範囲設定 (SQLite tasks.db)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            仕様書 第3項(タスク概念)・第4項(タスク管理)・第6項(タスク完了処理)
          </p>
        </div>

        {/* Task Generator Form */}
        <form onSubmit={handleGenerate} className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center space-x-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
            <span className="text-slate-500">範囲:</span>
            <input
              type="number"
              min={1}
              value={rangeStart}
              onChange={(e) => setRangeStart(parseInt(e.target.value, 10) || 1)}
              className="w-16 font-mono font-semibold bg-white border border-slate-200 rounded px-1.5 py-0.5 text-center text-slate-900"
            />
            <span className="text-slate-400">〜</span>
            <input
              type="number"
              min={rangeStart}
              value={rangeEnd}
              onChange={(e) => setRangeEnd(parseInt(e.target.value, 10) || 1000)}
              className="w-20 font-mono font-semibold bg-white border border-slate-200 rounded px-1.5 py-0.5 text-center text-slate-900"
            />
          </div>

          <div className="flex items-center space-x-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200">
            <span className="text-slate-500">分割単位:</span>
            <input
              type="number"
              min={10}
              max={10000}
              value={chunkSize}
              onChange={(e) => setChunkSize(parseInt(e.target.value, 10) || 100)}
              className="w-16 font-mono font-semibold bg-white border border-slate-200 rounded px-1.5 py-0.5 text-center text-slate-900"
            />
          </div>

          <button
            type="submit"
            disabled={isGenerating}
            className="inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <PlusCircle className="w-3.5 h-3.5 mr-1" />
            {isGenerating ? "生成中..." : "タスク再生成"}
          </button>
        </form>
      </div>

      {/* Filter Tabs & Count */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 text-xs">
        <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-lg">
          {["ALL", "PENDING", "RUNNING", "COMPLETED"].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setStatusFilter(tab);
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded font-medium transition-colors ${
                statusFilter === tab
                  ? "bg-white text-slate-900 shadow-xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab === "ALL" ? "すべて" : tab}
            </button>
          ))}
        </div>

        <div className="text-slate-500 text-xs font-mono">
          該当タスク: <span className="font-bold text-slate-900">{totalCount}</span> 件 (ページ {page}/{totalPages})
        </div>
      </div>

      {/* Tasks Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
            <tr>
              <th className="py-2.5 px-3">Task ID</th>
              <th className="py-2.5 px-3">計算範囲 [start - end]</th>
              <th className="py-2.5 px-3">ステータス</th>
              <th className="py-2.5 px-3">担当ワーカー</th>
              <th className="py-2.5 px-3 text-right">求めた解の個数</th>
              <th className="py-2.5 px-3 text-right">所要時間</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono">
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-400 font-sans">
                  {isLoading ? "タスクを読み込み中..." : "該当するタスクはありません"}
                </td>
              </tr>
            ) : (
              tasks.map((t) => (
                <tr key={t.task_id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-2 px-3 font-semibold text-slate-800">#{t.task_id}</td>
                  <td className="py-2 px-3 text-slate-700">
                    {t.start.toLocaleString()} 〜 {t.end.toLocaleString()}
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                        t.status === "COMPLETED"
                          ? "bg-emerald-100 text-emerald-800"
                          : t.status === "RUNNING"
                          ? "bg-cyan-100 text-cyan-800 animate-pulse"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    {t.worker_id ? (
                      <span className="font-semibold text-cyan-800 bg-cyan-50 px-1.5 py-0.5 rounded border border-cyan-200">
                        {t.worker_id}
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-right font-bold text-indigo-700">
                    {t.total_solutions > 0 ? t.total_solutions.toLocaleString() : "-"}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-600">
                    {t.duration !== null ? `${t.duration.toFixed(3)}s` : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between mt-3 text-xs">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="px-3 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          前へ
        </button>
        <span className="text-slate-500 font-mono">
          Page {page} of {totalPages}
        </span>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="px-3 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          次へ
        </button>
      </div>
    </section>
  );
};
