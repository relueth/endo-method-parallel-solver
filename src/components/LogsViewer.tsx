import React, { useState, useEffect, useRef } from "react";
import { Terminal, RefreshCw, Copy, Check } from "lucide-react";

export const LogsViewer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"server" | "worker">("server");
  const [serverLog, setServerLog] = useState<string>("");
  const [workerLog, setWorkerLog] = useState<string>("");
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const logRef = useRef<HTMLPreElement>(null);

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/cluster/logs");
      if (res.ok) {
        const data = await res.json();
        setServerLog(data.server_log || "");
        setWorkerLog(data.worker_log || "");
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 2500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (autoScroll && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [serverLog, workerLog, activeTab]);

  const currentContent = activeTab === "server" ? serverLog : workerLog;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-100">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-cyan-600" />
          <h2 className="text-sm font-bold text-slate-900 tracking-wide uppercase">
            クラスタ動作ログ (仕様書 第14項・第20項)
          </h2>
        </div>

        <div className="flex items-center space-x-2">
          {/* Tab Buttons */}
          <div className="flex bg-slate-100 p-1 rounded-lg text-xs font-semibold">
            <button
              onClick={() => setActiveTab("server")}
              className={`px-3 py-1 rounded transition-colors ${
                activeTab === "server"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              server.log (親サーバー)
            </button>
            <button
              onClick={() => setActiveTab("worker")}
              className={`px-3 py-1 rounded transition-colors ${
                activeTab === "worker"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              worker.log (ワーカーPC)
            </button>
          </div>

          <button
            onClick={fetchLogs}
            title="今すぐ更新"
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={handleCopy}
            title="ログをコピー"
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Terminal View */}
      <pre
        ref={logRef}
        className="bg-slate-950 text-slate-200 p-4 rounded-lg font-mono text-[11px] leading-relaxed overflow-x-auto max-h-72 whitespace-pre-wrap border border-slate-800"
      >
        {currentContent || "(ログデータ待機中...)"}
      </pre>

      <div className="flex items-center justify-between mt-2.5 text-[11px] text-slate-500">
        <span>
          {activeTab === "server" ? "親サーバーの接続・タスク割当・Heartbeat監視ログ" : "各ワーカーの受信・Endo_method計算・DONE通知ログ"}
        </span>
        <label className="flex items-center space-x-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded text-cyan-600 focus:ring-0"
          />
          <span>自動最下部スクロール</span>
        </label>
      </div>
    </section>
  );
};
