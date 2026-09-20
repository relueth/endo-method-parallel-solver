import React, { useState, useEffect } from "react";
import { Code2, Copy, Check, FileText, Terminal } from "lucide-react";

export const CodeInspector: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<string>("Endo_method.py");
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const files = [
    { name: "gui_launcher.py", label: "gui_launcher.py (★ダブルクリック起動ランチャー)" },
    { name: "gui_server.py", label: "gui_server.py (親サーバー GUI画面)" },
    { name: "gui_worker.py", label: "gui_worker.py (ワーカーPC GUI画面)" },
    { name: "gui_launcher.pyw", label: "gui_launcher.pyw (黒い画面なしWin起動)" },
    { name: "Endo_method.py", label: "Endo_method.py (計算コア)" },
    { name: "server.py", label: "server.py (親サーバーCUI)" },
    { name: "worker.py", label: "worker.py (ワーカーPC CUI)" },
    { name: "config.json", label: "config.json (設定)" },
    { name: "README.md", label: "README.md (マニュアル)" },
  ];

  const fetchFile = async (file: string) => {
    setLoading(true);
    setSelectedFile(file);
    try {
      const res = await fetch(`/api/files/view?file=${file}`);
      if (res.ok) {
        const data = await res.json();
        setContent(data.content);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFile(selectedFile);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center space-x-2">
            <Code2 className="w-4 h-4 text-cyan-600" />
            <h2 className="text-sm font-bold text-slate-900 tracking-wide uppercase">
              配布用ソースコード (parallel/ ディレクトリ)
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            実環境のLAN内各PC (親サーバー1台 + ワーカー22台) にそのまま配置して動作する完成コード
          </p>
        </div>

        {/* Copy code button */}
        <button
          onClick={handleCopy}
          className="inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
              コピーしました
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
              ファイル内容をコピー
            </>
          )}
        </button>
      </div>

      {/* File Tabs */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {files.map((f) => (
          <button
            key={f.name}
            onClick={() => fetchFile(f.name)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
              selectedFile === f.name
                ? "bg-slate-900 text-white shadow-xs"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Code Container */}
      <div className="relative">
        <pre className="bg-slate-900 text-slate-100 p-4 rounded-lg font-mono text-xs leading-relaxed max-h-80 overflow-y-auto overflow-x-auto border border-slate-800">
          {loading ? "読み込み中..." : content}
        </pre>
      </div>

      {/* Quick Run Commands Box */}
      <div className="mt-4 p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-3">
        <div>
          <div className="flex items-center space-x-1.5 font-semibold text-slate-800 mb-2">
            <Terminal className="w-3.5 h-3.5 text-cyan-600" />
            <span className="text-cyan-800 font-bold">✨ bat不要！Python ファイルを直接ダブルクリックするだけでGUI起動</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono text-[11px]">
            <div className="p-2.5 bg-indigo-50/80 rounded-lg border border-indigo-200 col-span-1 md:col-span-2">
              <span className="text-indigo-950 block text-[11px] font-sans font-bold mb-1">
                ★ 一番おすすめ: 統合ランチャー (エクスプローラーからダブルクリックするだけ)
              </span>
              <div className="flex items-center space-x-2">
                <code className="text-indigo-700 font-bold bg-white px-2 py-1 rounded border border-indigo-300 inline-block text-xs">gui_launcher.py</code>
                <span className="text-slate-500 font-sans text-[11px]">または (黒い画面を出さない)</span>
                <code className="text-indigo-700 font-bold bg-white px-2 py-1 rounded border border-indigo-300 inline-block text-xs">gui_launcher.pyw</code>
              </div>
              <p className="text-[11px] text-indigo-900 font-sans mt-1.5 leading-relaxed">
                Smart App Controlで .bat がブロックされる環境でも、Pythonファイルならダブルクリックでそのまま起動します。起動後に「親サーバー」か「ワーカー」か選ぶだけでGUI画面が開きます。
              </p>
            </div>
            <div className="p-2.5 bg-emerald-50/70 rounded-lg border border-emerald-200">
              <span className="text-emerald-900 block text-[11px] font-sans font-bold mb-1">
                親サーバー GUI 直接起動 (タスク生成・進捗バー・ワーカー監視)
              </span>
              <code className="text-emerald-700 font-bold bg-white px-2 py-0.5 rounded border border-emerald-300 inline-block">gui_server.py</code>
              <span className="text-slate-500 text-[10px] font-sans ml-1">/ <code className="text-slate-700">gui_server.pyw</code></span>
              <p className="text-[10px] text-emerald-800 font-sans mt-1">
                このPCのIPv4アドレスを自動検知して大きく表示。タスク範囲設定や再生成、ワーカーの状況をマウスで操作できます。
              </p>
            </div>
            <div className="p-2.5 bg-cyan-50/70 rounded-lg border border-cyan-200">
              <span className="text-cyan-900 block text-[11px] font-sans font-bold mb-1">
                ワーカーPC GUI 直接起動 (ワンクリック接続・リアルタイム計算)
              </span>
              <code className="text-cyan-700 font-bold bg-white px-2 py-0.5 rounded border border-cyan-300 inline-block">gui_worker.py</code>
              <span className="text-slate-500 text-[10px] font-sans ml-1">/ <code className="text-slate-700">gui_worker.pyw</code></span>
              <p className="text-[10px] text-cyan-800 font-sans mt-1">
                PC名と親PCのIPを入力して「接続して計算開始」ボタンを押すだけ。リアルタイムで計算した解の数や進捗が表示されます。
              </p>
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center space-x-1.5 font-semibold text-slate-700 mb-1.5 text-[11px]">
            <span>コマンドプロンプト / PowerShell / Mac / Linux 手動実行 (CUI):</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono text-[11px]">
            <div className="p-2 bg-white rounded border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-sans">
                親サーバー (CUI)
              </span>
              <code className="text-slate-800">python server.py --host 0.0.0.0 --port 5000</code>
            </div>
            <div className="p-2 bg-white rounded border border-slate-200">
              <span className="text-slate-400 block text-[10px] uppercase font-sans">
                各ワーカー (CUI)
              </span>
              <code className="text-slate-800">python worker.py --id PC01 --server 192.168.1.100</code>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
