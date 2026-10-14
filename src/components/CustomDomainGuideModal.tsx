import React, { useState, useEffect } from "react";
import {
  Globe,
  X,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Server,
  Terminal,
  HelpCircle,
  QrCode,
  Laptop,
  Smartphone,
  Sparkles,
} from "lucide-react";

interface CustomDomainGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CustomDomainGuideModal({ isOpen, onClose }: CustomDomainGuideModalProps) {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [myDomainInput, setMyDomainInput] = useState<string>("");

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopy = (key: string, text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    }
  };

  // 生成されたカスタムURL
  let cleanDomain = myDomainInput.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const fullCustomUrl = cleanDomain ? `https://${cleanDomain}` : "";
  const workerJoinUrl = cleanDomain ? `https://${cleanDomain}/?tab=web-worker` : "";
  const qrCodeUrl = workerJoinUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&color=6366f1&bgcolor=0f172a&data=${encodeURIComponent(
        workerJoinUrl
      )}`
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/85 backdrop-blur-md animate-fade-in text-slate-100">
      <div className="relative w-full max-w-4xl max-h-[92vh] bg-slate-900 border border-indigo-500/40 rounded-2xl shadow-2xl shadow-indigo-950/60 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/20 border border-indigo-500/40 text-indigo-400">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-100">
                  Cloudflare Tunnel 独自ドメイン固定設定ガイド
                </h3>
                <span className="text-[11px] font-semibold text-indigo-300 bg-indigo-950/80 border border-indigo-700/60 px-2 py-0.5 rounded-full">
                  無料＆SSL全自動
                </span>
              </div>
              <p className="text-xs text-slate-400">
                毎回URLが変わる一時URLを卒業し、自分が決めた固定ドメインで安定運用する全手順
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Navigation Bar */}
        <div className="grid grid-cols-4 border-b border-slate-800 bg-slate-950/40 shrink-0 text-xs font-semibold">
          {[
            { step: 1, title: "1. ドメイン取得", subtitle: "数百円〜 / 登録" },
            { step: 2, stepName: "2. Zero Trust作成", subtitle: "Tunnels画面" },
            { step: 3, stepName: "3. ルーティング設定", subtitle: "localhost:3000" },
            { step: 4, stepName: "4. トークン起動", subtitle: "バッチ実行・完了" },
          ].map((item) => (
            <button
              key={item.step}
              onClick={() => setActiveStep(item.step)}
              className={`p-3 text-left border-b-2 transition-all cursor-pointer flex flex-col justify-center ${
                activeStep === item.step
                  ? "border-indigo-400 bg-indigo-950/30 text-indigo-200"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/20"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    activeStep === item.step
                      ? "bg-indigo-500 text-white"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {item.step}
                </span>
                <span className="font-bold truncate">{item.stepName || item.title}</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-0.5 pl-6 hidden sm:block">
                {item.subtitle}
              </span>
            </button>
          ))}
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs sm:text-sm">
          {/* STEP 1 */}
          {activeStep === 1 && (
            <div className="space-y-5 animate-fade-in">
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                <h4 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  STEP 1: 独自ドメインを準備する（まだ持っていない場合）
                </h4>
                <p className="text-slate-300 leading-relaxed text-xs sm:text-sm">
                  Cloudflare Tunnelで固定URLにするには、<strong>世界に1つだけの独自ドメイン</strong>（例: <code>example.com</code>, <code>mycluster.xyz</code> 等）が必要です。
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-indigo-950/30 border border-indigo-700/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-300 uppercase tracking-wide">
                      一番おすすめ（最も簡単・最安）
                    </span>
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-mono">
                      原価販売
                    </span>
                  </div>
                  <h5 className="text-sm font-bold text-white">Cloudflare Registrar で直接取得</h5>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Cloudflareはドメイン手数料を一切上乗せしない原価販売を行っているため、年間約1,000円〜1,500円前後と業界最安クラスです。取得した瞬間にCloudflareのDNSが自動連携するため、ネームサーバーの変更作業が不要で最も楽です。
                  </p>
                  <a
                    href="https://www.cloudflare.com/products/registrar/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors"
                  >
                    <span>Cloudflare Registrar を開く</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                      国内サービスを使う場合
                    </span>
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                      1円〜初年度割引あり
                    </span>
                  </div>
                  <h5 className="text-sm font-bold text-white">お名前.com / ムームードメイン等</h5>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    国内レジストラで <code>.xyz</code> や <code>.top</code> などの格安ドメイン（初年度数十円〜数百円）を取得し、Cloudflareの無料アカウントにドメインを追加してネームサーバーを指定の2つ（例: <code>anna.ns.cloudflare.com</code>）に変更するだけで使えます。
                  </p>
                  <div className="text-[11px] text-slate-400 bg-slate-900 p-2 rounded border border-slate-800">
                    💡 CloudflareのDNS管理機能（無料プラン）に追加すれば、どこの会社で買ったドメインでもTunnelが使えます。
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setActiveStep(2)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>次へ: STEP 2 (Zero TrustでTunnel作成)</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {activeStep === 2 && (
            <div className="space-y-5 animate-fade-in">
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                <h4 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  STEP 2: Cloudflare Zero Trust 管理画面で Tunnel を新規作成
                </h4>
                <p className="text-slate-300 leading-relaxed text-xs sm:text-sm">
                  Cloudflareの無料枠に含まれる「Zero Trust（Cloudflare One）」機能を使います。
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3.5 bg-slate-950/60 rounded-xl border border-slate-800">
                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center shrink-0 text-xs">
                    1
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-slate-200">
                      Cloudflare Zero Trust ダッシュボードを開く
                    </p>
                    <p className="text-xs text-slate-400">
                      下記リンクからログインします（初回のみチーム名登録画面が出ますが、無料プランのまま任意の英字名で作成できます）。
                    </p>
                    <a
                      href="https://one.dash.cloudflare.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:underline pt-1 font-semibold"
                    >
                      <span>https://one.dash.cloudflare.com/ (Zero Trustダッシュボード)</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3.5 bg-slate-950/60 rounded-xl border border-slate-800">
                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center shrink-0 text-xs">
                    2
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-slate-200">
                      左メニューから [Networks] → [Tunnels] を選択
                    </p>
                    <p className="text-xs text-slate-400">
                      青いボタン <strong>「Add a tunnel」</strong> または <strong>「Create a tunnel」</strong> をクリックします。
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3.5 bg-slate-950/60 rounded-xl border border-slate-800">
                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center shrink-0 text-xs">
                    3
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-slate-200">
                      Connector 形式で「Cloudflared」を選び、名前を入力
                    </p>
                    <p className="text-xs text-slate-400">
                      トンネル名にわかりやすい英字名（例: <code className="text-indigo-300 bg-slate-900 px-1 rounded">euler-cluster</code>）を入力し、<strong>「Save tunnel」</strong> を押します。
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  onClick={() => setActiveStep(1)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  戻る
                </button>
                <button
                  onClick={() => setActiveStep(3)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>次へ: STEP 3 (ルーティング設定)</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {activeStep === 3 && (
            <div className="space-y-5 animate-fade-in">
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                <h4 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                  <Server className="w-4 h-4 text-indigo-400" />
                  STEP 3: 独自ドメインをポート 3000 (親サーバー) に紐付ける
                </h4>
                <p className="text-slate-300 leading-relaxed text-xs sm:text-sm">
                  トンネル作成画面の続き、またはトンネル一覧の「Public Hostname」タブで設定します。
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950 border border-indigo-500/30 space-y-4">
                <div className="border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-indigo-300 uppercase tracking-wider">
                    画面の入力欄に以下のように入力してください:
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-1">
                    <span className="text-slate-400 font-semibold block">Subdomain (サブドメイン):</span>
                    <code className="text-indigo-300 font-mono text-sm font-bold">cluster</code>
                    <p className="text-[11px] text-slate-400 mt-1">
                      （お好きな文字でOKです。例: cluster, calc, euler など）
                    </p>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-1">
                    <span className="text-slate-400 font-semibold block">Domain (登録済みドメイン):</span>
                    <span className="text-indigo-300 font-mono text-sm font-bold">取得したドメインを選択</span>
                    <p className="text-[11px] text-slate-400 mt-1">
                      （プルダウンからSTEP 1で用意したドメインを選択します）
                    </p>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-1">
                    <span className="text-slate-400 font-semibold block">Type (プロトコル):</span>
                    <code className="text-emerald-400 font-mono text-sm font-bold">HTTP</code>
                    <p className="text-[11px] text-slate-400 mt-1">
                      （Cloudflareがエッジで自動SSL暗号化するため内部はHTTPでOKです）
                    </p>
                  </div>

                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-1">
                    <span className="text-slate-400 font-semibold block">URL (転送先アドレス):</span>
                    <code className="text-emerald-400 font-mono text-sm font-bold">localhost:3000</code>
                    <p className="text-[11px] text-slate-400 mt-1">
                      （親サーバーの待受ポート番号 3000 を指定します）
                    </p>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>WebSocketの追加設定は一切不要！</span>
                  </div>
                  <p className="text-[11px] text-slate-300 pl-5">
                    Cloudflare TunnelはWebSocket通信（<code>/ws/worker</code>）を初期状態で100%自動通過させます。特別な設定をしなくても計算ワーカーとの高速双方向通信が即座に動作します。
                  </p>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  onClick={() => setActiveStep(2)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  戻る
                </button>
                <button
                  onClick={() => setActiveStep(4)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>次へ: STEP 4 (トークン取得とバッチ起動)</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4 */}
          {activeStep === 4 && (
            <div className="space-y-5 animate-fade-in">
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                <h4 className="text-sm font-bold text-indigo-300 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-indigo-400" />
                  STEP 4: トークンをコピーして新設バッチを実行するだけ！
                </h4>
                <p className="text-slate-300 leading-relaxed text-xs sm:text-sm">
                  面倒な設定ファイル作成は不要です。Cloudflare管理画面に表示されたトークンを貼り付ければ完了です。
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <p className="font-bold text-slate-200 flex items-center gap-1.5">
                    <span>1. トークンのコピー</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    画面に表示されている「Install and run a connector」の Windows コマンドの中から、<code>--token</code> の後ろにある長い文字列（<code>ey...</code>）のみをコピーします。
                  </p>
                  <div className="p-2.5 bg-slate-900 rounded font-mono text-[11px] text-slate-400 border border-slate-800 truncate">
                    cloudflared.exe service install <span className="text-indigo-400 font-bold">eyJhIjoi...（この長い英数字のみをコピー）</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-indigo-500/40 space-y-3">
                  <p className="font-bold text-indigo-300 flex items-center gap-1.5">
                    <span>2. 新設バッチファイルの実行（ワンクリック起動）</span>
                  </p>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    本プロジェクト内に以下の専用バッチファイルを新設しました：
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-slate-900 rounded-lg border border-indigo-500/30">
                      <div className="font-bold text-indigo-300 mb-1 flex items-center gap-1">
                        <Terminal className="w-3.5 h-3.5" />
                        <code>start-custom-tunnel.bat</code>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        トンネルのみを起動。初回のみトークンの貼り付けを求められ、<code>tunnel_token.txt</code> に安全に自動保存されます。
                      </p>
                    </div>

                    <div className="p-3 bg-slate-900 rounded-lg border border-cyan-500/30">
                      <div className="font-bold text-cyan-300 mb-1 flex items-center gap-1">
                        <Server className="w-3.5 h-3.5" />
                        <code>start-server-and-custom-tunnel.bat</code>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        親サーバー（localhost:3000）と固定ドメインTunnelを同時に一括起動します。日常運用時はこちらをダブルクリックするだけでOK！
                      </p>
                    </div>
                  </div>
                </div>

                {/* 独自ドメインのテスター & QR生成ツール */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-950/40 to-slate-950 border border-indigo-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-100 flex items-center gap-1.5">
                      <QrCode className="w-4 h-4 text-indigo-400" />
                      設定した独自ドメインの接続テスト・QR生成
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    設定したドメインを入力すると、ワーカーPCやスマホから接続するためのURLやQRコードを即時生成します。
                  </p>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-2.5 text-xs text-slate-500 font-mono select-none">
                        https://
                      </span>
                      <input
                        type="text"
                        value={myDomainInput}
                        onChange={(e) => setMyDomainInput(e.target.value)}
                        placeholder="cluster.yourdomain.com"
                        className="w-full pl-16 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-indigo-300 focus:outline-hidden focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {cleanDomain && (
                    <div className="p-3 bg-slate-950 rounded-lg border border-indigo-500/30 space-y-2 mt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-indigo-300">
                          ワーカー接続用URL (Python / ブラウザ共通):
                        </span>
                        <button
                          onClick={() => handleCopy("domainUrl", workerJoinUrl)}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          {copiedKey === "domainUrl" ? (
                            <>
                              <Check className="w-3 h-3" />
                              コピー完了
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              URLコピー
                            </>
                          )}
                        </button>
                      </div>
                      <code className="text-xs font-mono text-cyan-300 block select-all break-all">
                        {workerJoinUrl}
                      </code>

                      {/* Pythonワーカー用コマンド */}
                      <div className="pt-2 border-t border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-400">
                            PythonワーカーPC起動コマンド例:
                          </span>
                          <button
                            onClick={() =>
                              handleCopy(
                                "pyCmd",
                                `python parallel/worker.py --server ${fullCustomUrl}`
                              )
                            }
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
                          >
                            {copiedKey === "pyCmd" ? "コピー済" : "コマンドコピー"}
                          </button>
                        </div>
                        <code className="text-[11px] font-mono text-slate-300 bg-slate-900 p-1.5 rounded block select-all">
                          python parallel/worker.py --server {fullCustomUrl}
                        </code>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  onClick={() => setActiveStep(3)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  戻る
                </button>
                <button
                  onClick={onClose}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  <span>設定ガイドを閉じる</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>
              独自ドメイン設定が完了すれば、何度再起動しても同じURLのままワーカーが自動復帰します。
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white font-semibold transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
