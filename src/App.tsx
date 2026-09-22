import React, { useState, useEffect } from "react";
import { ClusterStatus, DbStats, WorkerSlot } from "./types";
import { Header } from "./components/Header";
import { ClusterOverview } from "./components/ClusterOverview";
import { WorkerFleetGrid } from "./components/WorkerFleetGrid";
import { TaskQueueManager } from "./components/TaskQueueManager";
import { EndoExplorer } from "./components/EndoExplorer";
import { BenchmarkChart } from "./components/BenchmarkChart";
import { LogsViewer } from "./components/LogsViewer";
import { CodeInspector } from "./components/CodeInspector";

const defaultDbStats: DbStats = {
  exists: true,
  pending: 0,
  running: 0,
  completed: 0,
  total: 0,
  completion_rate: 0,
  total_solutions: 0,
};

export default function App() {
  const [status, setStatus] = useState<ClusterStatus>({
    server_running: false,
    db_stats: defaultDbStats,
    active_workers_count: 0,
    workers: [],
    updated_at: "",
    uptime_seconds: 0,
  });

  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"cluster" | "tasks" | "benchmark" | "endo" | "logs" | "code">("cluster");

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/cluster/status");
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      console.error("ステータス取得エラー:", err);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 1500);
    return () => clearInterval(interval);
  }, []);

  const handleStartServer = async () => {
    setIsActionLoading(true);
    try {
      await fetch("/api/cluster/server/start", { method: "POST" });
      setTimeout(fetchStatus, 500);
    } catch (e) {
      console.error(e);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleStopServer = async () => {
    setIsActionLoading(true);
    try {
      await fetch("/api/cluster/server/stop", { method: "POST" });
      setTimeout(fetchStatus, 500);
    } catch (e) {
      console.error(e);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSpawnWorkers = async (count: number) => {
    setIsActionLoading(true);
    try {
      await fetch("/api/cluster/worker/spawn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      setTimeout(fetchStatus, 500);
    } catch (e) {
      console.error(e);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleSpawnSingleWorker = async (workerId: string) => {
    try {
      await fetch("/api/cluster/worker/spawn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worker_id: workerId }),
      });
      setTimeout(fetchStatus, 500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleKillWorker = async (workerId: string) => {
    try {
      await fetch("/api/cluster/worker/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worker_id: workerId }),
      });
      setTimeout(fetchStatus, 500);
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateTasks = async (start: number, end: number, chunkSize: number) => {
    setIsActionLoading(true);
    try {
      await fetch("/api/cluster/tasks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range_start: start, range_end: end, chunk_size: chunkSize }),
      });
      setTimeout(fetchStatus, 500);
    } catch (e) {
      console.error(e);
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleResetTasks = async () => {
    setIsActionLoading(true);
    try {
      await fetch("/api/cluster/tasks/reset", { method: "POST" });
      setTimeout(fetchStatus, 500);
    } catch (e) {
      console.error(e);
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans selection:bg-cyan-500 selection:text-white">
      {/* Top Header */}
      <Header
        serverRunning={status.server_running}
        activeWorkers={status.active_workers_count}
        totalWorkers={22}
        onStartServer={handleStartServer}
        onStopServer={handleStopServer}
        onSpawnWorkers={handleSpawnWorkers}
        onResetTasks={handleResetTasks}
        isActionLoading={isActionLoading}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 overflow-x-auto no-scrollbar space-x-1 sm:space-x-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("cluster")}
            className={`pb-3 px-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "cluster"
                ? "border-cyan-600 text-cyan-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            クラスタ監視 &amp; ワーカー22台
          </button>
          <button
            onClick={() => setActiveTab("tasks")}
            className={`pb-3 px-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "tasks"
                ? "border-cyan-600 text-cyan-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            タスク管理 (SQLite DB)
          </button>
          <button
            onClick={() => setActiveTab("benchmark")}
            className={`pb-3 px-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "benchmark"
                ? "border-indigo-600 text-indigo-700 font-bold"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            📊 処理時間グラフ分析
          </button>
          <button
            onClick={() => setActiveTab("endo")}
            className={`pb-3 px-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "endo"
                ? "border-cyan-600 text-cyan-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            φ⁻¹(n) 単体計算 (Endo_method)
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`pb-3 px-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "logs"
                ? "border-cyan-600 text-cyan-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            動作ログ (server/worker.log)
          </button>
          <button
            onClick={() => setActiveTab("code")}
            className={`pb-3 px-2 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === "code"
                ? "border-cyan-600 text-cyan-700"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            配布用コード &amp; LAN展開手順
          </button>
        </div>

        {/* Tab 1: Cluster Overview & Worker Fleet */}
        {activeTab === "cluster" && (
          <div className="space-y-6">
            <ClusterOverview
              stats={status.db_stats || defaultDbStats}
              uptimeSeconds={status.uptime_seconds}
              activeWorkers={status.active_workers_count}
            />

            <WorkerFleetGrid
              workers={status.workers}
              serverRunning={status.server_running}
              onSpawnWorker={handleSpawnSingleWorker}
              onKillWorker={handleKillWorker}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <EndoExplorer />
              <LogsViewer />
            </div>
          </div>
        )}

        {/* Tab 2: Tasks Manager */}
        {activeTab === "tasks" && (
          <div className="space-y-6">
            <ClusterOverview
              stats={status.db_stats || defaultDbStats}
              uptimeSeconds={status.uptime_seconds}
              activeWorkers={status.active_workers_count}
            />
            <TaskQueueManager
              onGenerateTasks={handleGenerateTasks}
              isGenerating={isActionLoading}
            />
          </div>
        )}

        {/* Tab 2.5: Benchmark Chart */}
        {activeTab === "benchmark" && (
          <div className="space-y-6">
            <BenchmarkChart />
          </div>
        )}

        {/* Tab 3: Endo_method Explorer */}
        {activeTab === "endo" && (
          <div className="space-y-6">
            <EndoExplorer />
            <CodeInspector />
          </div>
        )}

        {/* Tab 4: Logs */}
        {activeTab === "logs" && (
          <div className="space-y-6">
            <LogsViewer />
          </div>
        )}

        {/* Tab 5: Code & Deployment */}
        {activeTab === "code" && (
          <div className="space-y-6">
            <CodeInspector />
          </div>
        )}
      </main>
    </div>
  );
}
