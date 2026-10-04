import React, { useState, useEffect } from "react";
import {
  Code2,
  Copy,
  Check,
  Globe,
  Terminal,
  Server,
  Zap,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  Laptop,
  FolderOpen,
  ArrowRight,
} from "lucide-react";

export const CodeInspector: React.FC = () => {
  const [activeSection, setActiveSection] = useState<"tunnel" | "lan_python">("tunnel");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const batchCode = `@echo off
chcp 65001 > nul
title [親サーバー & Cloudflare Tunnel] 分散計算システム起動ランチャー
color 0b

echo =====================================================================
echo    φ(x)=n オイラー関数逆像求解 分散計算システム
echo    Windows 親サーバー ＆ Cloudflare Tunnel 世界公開ランチャー
echo =====================================================================
echo.

:: 1. Node.js のチェック
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [エラー] Node.js が見つかりません。
    echo 以下のコマンドでインストールするか、https://nodejs.org/ から導入してください:
    echo    winget install OpenJS.NodeJS.LTS
    echo.
    pause
    exit /b 1
)

:: 2. 依存ライブラリのインストール確認
if not exist node_modules (
    echo [1/3] 初回起動のため、ライブラリをインストールしています (npm install)...
    call npm install
    if %errorlevel% neq 0 (
        echo [エラー] npm install に失敗しました。
        pause
        exit /b 1
    )
)

:: 3. Cloudflare cloudflared のチェック
where cloudflared >nul 2>nul
if %errorlevel% neq 0 (
    echo [2/3] Cloudflare Tunnel (cloudflared) をインストールしています...
    winget install --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements
)

echo [3/3] 親サーバー (localhost:3000) を別ウィンドウで起動します...
start "Node.js 親サーバー (:3000)" cmd /k "npm run dev"

echo.
echo サーバーの立ち上がりを待機しています (約5秒)...
timeout /t 5 > nul

echo.
echo =====================================================================
echo    Cloudflare Tunnel を開始し、世界中からアクセス可能なURLを発行します
echo =====================================================================
echo.
echo ※ 画面に「https://xxxx.trycloudflare.com」というURLが表示されます。
echo    そのURLをスマホのブラウザで開くか、QRコード化して読み取ってください。
echo.

cloudflared tunnel --url http://localhost:3000
pause`;

  return (
    <section className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-xl text-slate-100 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <Server className="w-5 h-5 text-cyan-400" />
            <h2 className="text-base font-bold text-slate-100 tracking-wide uppercase">
              配布用コード &amp; Windows世界公開マニュアル
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            ご自身のWindows PCを親サーバーにして、Cloudflare Tunnel経由で世界中から安全にアクセスできるようにする設定手順
          </p>
        </div>

        {/* Section Switcher Tabs */}
        <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setActiveSection("tunnel")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
              activeSection === "tunnel"
                ? "bg-cyan-500 text-slate-950 font-bold shadow-xs"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Windows世界公開 (Cloudflare)
          </button>
          <button
            onClick={() => setActiveSection("lan_python")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
              activeSection === "lan_python"
                ? "bg-cyan-500 text-slate-950 font-bold shadow-xs"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            物理LAN内 PCクラスタ (Python GUI)
          </button>
        </div>
      </div>

      {/* SECTION 1: Cloudflare Tunnel Guide */}
      {activeSection === "tunnel" && (
        <div className="space-y-6">
          {/* Key Advantages Alert */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-800/60 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-cyan-200">ポート開放一切不要</h4>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  ルーターの穴あけが不要なため、自宅のIPアドレスが晒されずサイバー攻撃を受けません。
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 flex items-start gap-3">
              <Zap className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-emerald-200">アカウント登録不要（即時）</h4>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Quick Tunnel 機能により、コマンド1行でランダムなHTTPSドメインが即座に割り当てられます。
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-800/60 flex items-start gap-3">
              <Globe className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-indigo-200">WebSocket / Web Worker完全対応</h4>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  ブラウザワーカーの常時双方向通信（/ws/worker）もそのまま安定して中継されます。
                </p>
              </div>
            </div>
          </div>

          {/* Step by Step Walkthrough */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              Windows PC でのセットアップ手順（最短3ステップ）
            </h3>

            {/* Step 1 */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-300 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center text-[11px]">
                    1
                  </span>
                  必要なツールをインストール (PowerShell / コマンドプロンプト)
                </span>
                <button
                  onClick={() =>
                    handleCopy(
                      "winget install OpenJS.NodeJS.LTS Cloudflare.cloudflared Python.Python.3.11",
                      "step1"
                    )
                  }
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-cyan-300 transition-colors"
                >
                  {copiedKey === "step1" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedKey === "step1" ? "コピー済" : "コマンドをコピー"}
                </button>
              </div>
              <p className="text-xs text-slate-400">
                Windows 10/11 の PowerShell または コマンドプロンプトを開き、下記を貼り付けて実行します：
              </p>
              <pre className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-300 overflow-x-auto select-all">
                winget install OpenJS.NodeJS.LTS Cloudflare.cloudflared Python.Python.3.11
              </pre>
              <p className="text-[11px] text-slate-500">
                ※ 既にNode.jsやPythonが入っている場合はスキップできます。
              </p>
            </div>

            {/* Step 2 */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-300 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center text-[11px]">
                    2
                  </span>
                  プロジェクトの起動 (親サーバー)
                </span>
                <button
                  onClick={() => handleCopy("npm install --legacy-peer-deps; npm run dev", "step2")}
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-cyan-300 transition-colors"
                >
                  {copiedKey === "step2" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedKey === "step2" ? "コピー済" : "コマンドをコピー"}
                </button>
              </div>
              <p className="text-xs text-slate-400">
                本アプリのフォルダ内でターミナルを開き、サーバーを立ち上げます（ポート3000）：
              </p>
              <pre className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-300 overflow-x-auto select-all">
                npm install --legacy-peer-deps; npm run dev
              </pre>
            </div>

            {/* Step 3 */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-300 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center text-[11px]">
                    3
                  </span>
                  Cloudflare Tunnel を起動して世界公開URLを発行
                </span>
                <button
                  onClick={() =>
                    handleCopy("cloudflared tunnel --url http://localhost:3000", "step3")
                  }
                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-cyan-300 transition-colors"
                >
                  {copiedKey === "step3" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {copiedKey === "step3" ? "コピー済" : "コマンドをコピー"}
                </button>
              </div>
              <p className="text-xs text-slate-400">
                別のターミナルウィンドウを開き、以下の1行を実行します：
              </p>
              <pre className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-amber-400 overflow-x-auto select-all">
                cloudflared tunnel --url http://localhost:3000
              </pre>
              <div className="p-3 bg-slate-900/80 rounded-lg border border-slate-800 text-xs text-slate-300 space-y-1">
                <p className="font-semibold text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  実行すると画面に以下のようなURLが表示されます：
                </p>
                <p className="font-mono text-cyan-300 text-[11px] bg-slate-950 p-1.5 rounded">
                  +--------------------------------------------------------------------------------------------+
                  <br />
                  | Your quick Tunnel has been created! Visit it at:
                  <br />
                  | https://random-subdomain-1234.trycloudflare.com
                  <br />
                  +--------------------------------------------------------------------------------------------+
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  このURLをスマホや外出先のPCで開けば、世界中どこからでも親サーバーに接続して分散計算に参加できます！
                </p>
              </div>
            </div>
          </div>

          {/* Option: Double-Click Batch File */}
          <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-700/60 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-indigo-400" />
                <h4 className="text-xs font-bold text-indigo-200">
                  ★ 最も簡単：ダブルクリック自動起動バッチファイル
                </h4>
              </div>
              <button
                onClick={() => handleCopy(batchCode, "batch")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors shrink-0 cursor-pointer shadow-xs"
              >
                {copiedKey === "batch" ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                {copiedKey === "batch" ? "バッチ内容をコピー済" : "start-cluster.bat をコピー"}
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              プロジェクト直下に <code className="text-cyan-300 font-mono font-bold">start-cluster.bat</code> という名前で保存してダブルクリックするだけで、Node.js親サーバーとCloudflare Tunnelを自動で一括起動します。
            </p>
            <pre className="p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-300 max-h-48 overflow-y-auto leading-relaxed">
              {batchCode}
            </pre>
          </div>
        </div>
      )}

      {/* SECTION 2: LAN Python GUI cluster */}
      {activeSection === "lan_python" && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Laptop className="w-4 h-4 text-cyan-400" />
              物理LAN内PC（学校・研究室・オフィスのPCクラスタ）での運用
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              ブラウザ版だけでなく、WindowsのネイティブPython GUI（Tkinter）を使ったPC22台クラスタ構成もそのまま動かせます。Smart App Control等でbatが弾かれる環境でも直接ダブルクリック起動できます。
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-2">
              <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                <span className="font-bold text-cyan-300 block mb-1">
                  1. gui_launcher.py (統合ランチャー)
                </span>
                <p className="text-slate-400 text-[11px]">
                  エクスプローラーからダブルクリックで起動。「親サーバー」「ワーカー」を選択するだけで自動起動します。
                </p>
              </div>

              <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                <span className="font-bold text-emerald-300 block mb-1">
                  2. gui_server.py (親サーバーGUI)
                </span>
                <p className="text-slate-400 text-[11px]">
                  PCのIPアドレスを自動検出して画面上部に大写し。タスク再生成やワーカー接続台数をリアルタイム表示。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
