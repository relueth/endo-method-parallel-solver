import React, { useState, useEffect } from "react";
import { ClusterStatus, DbStats } from "./types";
import { Header } from "./components/Header";
import { GuiServerView } from "./components/GuiServerView";
import { GuiWorkerView } from "./components/GuiWorkerView";
import { BenchmarkChart } from "./components/BenchmarkChart";
import { EndoExplorer } from "./components/EndoExplorer";
import { CodeInspector } from "./components/CodeInspector";
import { ShareDeviceModal } from "./components/ShareDeviceModal";

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
    web_workers: [],
    updated_at: "",
    uptime_seconds: 0,
  });

  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"server" | "worker" | "benchmark" | "endo" | "code">(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "worker" || tabParam === "web-worker") return "worker";
      if (tabParam === "benchmark") return "benchmark";
      if (tabParam === "endo") return "endo";
      if (tabParam === "code") return "code";
    }
    return "server";
  });

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

    let intervalId: any = null;
    const startPolling = (ms: number) => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        if (!document.hidden) {
          fetchStatus();
        }
      }, ms);
    };

    startPolling(2000);

    const onVisibilityChange = () => {
      if (!document.hidden) {
        fetchStatus();
        startPolling(2000);
      } else {
        startPolling(10000);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const handleStartServer = async () => {
    setIsActionLoading(true);
    try {
      await fetch("/api/cluster/server/start", { method: "POST" });
      setTimeout(fetchStatus, 400);
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
      setTimeout(fetchStatus, 400);
    } catch (e) {
      console.error(e);
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Top Header Navigation */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        serverRunning={status.server_running}
        activeWorkers={status.active_workers_count}
        totalWorkers={22 + (status.web_workers?.length || 0)}
        onOpenShareModal={() => setIsShareModalOpen(true)}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5">
        {/* Mode 1: 🖥️ 親サーバー (gui_server.py と同一構成) */}
        {activeTab === "server" && (
          <GuiServerView
            status={status}
            isActionLoading={isActionLoading}
            onStartServer={handleStartServer}
            onStopServer={handleStopServer}
            onOpenShareModal={() => setIsShareModalOpen(true)}
            onOpenBenchmark={() => setActiveTab("benchmark")}
            onRefresh={fetchStatus}
          />
        )}

        {/* Mode 2: ⚡ ワーカーPC (gui_worker.py と同一構成) */}
        {activeTab === "worker" && (
          <GuiWorkerView
            onOpenShareModal={() => setIsShareModalOpen(true)}
          />
        )}

        {/* Mode 3: 📊 処理時間グラフ分析 */}
        {activeTab === "benchmark" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-100">
                📊 処理時間グラフ分析 (plot_benchmark)
              </h2>
              <button
                onClick={() => setActiveTab("server")}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-xs font-semibold cursor-pointer"
              >
                ← 親サーバー画面に戻る
              </button>
            </div>
            <BenchmarkChart />
          </div>
        )}

        {/* Mode 4: 🧮 φ⁻¹(n) 単体検算 */}
        {activeTab === "endo" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-100">
                🧮 φ⁻¹(n) 単体計算 (Endo Method)
              </h2>
              <button
                onClick={() => setActiveTab("server")}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-xs font-semibold cursor-pointer"
              >
                ← 親サーバー画面に戻る
              </button>
            </div>
            <EndoExplorer />
          </div>
        )}

        {/* Mode 5: 📖 配布用コード & LAN展開手順 */}
        {activeTab === "code" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-100">
                📖 配布用コード &amp; LAN展開手順
              </h2>
              <button
                onClick={() => setActiveTab("server")}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-md text-xs font-semibold cursor-pointer"
              >
                ← 親サーバー画面に戻る
              </button>
            </div>
            <CodeInspector />
          </div>
        )}
      </main>

      {/* Share / Invite other devices Modal */}
      <ShareDeviceModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        onOpenWebWorkerDirectly={() => {
          setIsShareModalOpen(false);
          setActiveTab("worker");
        }}
      />
    </div>
  );
}
