import React, { useState, useEffect } from "react";
import {
  Smartphone,
  Laptop,
  QrCode,
  Copy,
  Check,
  X,
  ExternalLink,
  Wifi,
  Globe,
  Info,
  Layers,
  Zap,
  Server,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";

interface ShareDeviceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenWebWorkerDirectly?: () => void;
}

export function ShareDeviceModal({ isOpen, onClose }: ShareDeviceModalProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"cloud" | "tunnel" | "local">("cloud");
  const [customTunnelUrl, setCustomTunnelUrl] = useState<string>("");

  // 現在のURL（window.location.origin）またはShared App URL
  const currentOrigin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://ais-pre-ei4epm6xbi22jpscbcrjut-303216531044.asia-northeast1.run.app";

  // タブに応じた共有URLの決定
  let effectiveShareUrl = `${currentOrigin}/?tab=web-worker`;
  if (activeTab === "tunnel" && customTunnelUrl.trim()) {
    let cleanUrl = customTunnelUrl.trim();
    if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
      cleanUrl = `https://${cleanUrl}`;
    }
    // 末尾のスラッシュを削除してパラメータ付与
    cleanUrl = cleanUrl.replace(/\/+$/, "");
    effectiveShareUrl = `${cleanUrl}/?tab=web-worker`;
  }

  // QRコード生成API (api.qrserver.com)
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=10&color=06b6d4&bgcolor=0f172a&data=${encodeURIComponent(
    effectiveShareUrl
  )}`;

  const handleCopy = (text: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-cyan-500/30 rounded-2xl shadow-2xl shadow-cyan-950/50 overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                別端末からアクセスして計算に参加する
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  マルチデバイス対応
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                スマートフォン、タブレット、別のノートPCを即座に計算ノードとして参加させられます
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

        {/* Tab switch */}
        <div className="flex flex-wrap border-b border-slate-800 bg-slate-950/50 px-6 pt-2 gap-1">
          <button
            onClick={() => setActiveTab("cloud")}
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === "cloud"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Globe className="w-4 h-4" />
            ① クラウド版URL (今すぐ世界中から)
          </button>

          <button
            onClick={() => setActiveTab("tunnel")}
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === "tunnel"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Server className="w-4 h-4" />
            ② 自前PCのCloudflare Tunnel
          </button>

          <button
            onClick={() => setActiveTab("local")}
            className={`flex items-center gap-1.5 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === "local"
                ? "border-cyan-400 text-cyan-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Wifi className="w-4 h-4" />
            ③ 同一Wi-Fi / LAN接続
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[75vh] overflow-y-auto space-y-6">
          {/* TAB 1: Cloud Default */}
          {activeTab === "cloud" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                {/* QR Code Container */}
                <div className="flex flex-col items-center justify-center p-4 bg-slate-950 rounded-xl border border-slate-800 text-center">
                  <div className="relative group p-2 bg-slate-900 rounded-lg border border-cyan-500/30">
                    <img
                      src={qrCodeUrl}
                      alt="別端末参加用QRコード"
                      className="w-48 h-48 rounded"
                      loading="lazy"
                    />
                  </div>
                  <span className="mt-3 text-xs font-medium text-cyan-300 flex items-center gap-1.5">
                    <QrCode className="w-4 h-4" />
                    スマホのカメラでスキャン
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5">
                    iPhoneのカメラやAndroidのGoogleレンズで読み取るだけ
                  </span>
                </div>

                {/* Instructions & Link Copy */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      アクセス用URL (クリックでコピー)
                    </h4>
                    <div className="flex items-center gap-2 p-2 bg-slate-950 rounded-lg border border-slate-800">
                      <input
                        type="text"
                        readOnly
                        value={effectiveShareUrl}
                        className="bg-transparent text-xs font-mono text-cyan-400 w-full outline-none select-all truncate"
                      />
                      <button
                        onClick={() => handleCopy(effectiveShareUrl)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors shrink-0 cursor-pointer"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            コピー済
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            URLコピー
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/60 text-xs space-y-2">
                    <p className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-cyan-400" />
                      別端末での操作手順（インストール一切不要）
                    </p>
                    <ol className="list-decimal list-inside space-y-1.5 text-slate-300 pl-1">
                      <li>スマホや別PCのブラウザで上記URLを開く</li>
                      <li>「Web Worker Node (ブラウザ計算参加)」画面が自動で開きます</li>
                      <li>
                        右上の水色ボタン <strong className="text-cyan-300">「▶ クラスタに参加」</strong> をタップ
                      </li>
                      <li>自動でPythonエンジンが起動し、親サーバーからタスクを受信して計算が始まります</li>
                    </ol>
                  </div>

                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center gap-2">
                    <Layers className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>
                      <strong>複数台接続可能:</strong> 何台接続しても親サーバー（SQLite）が自動でタスクを重複なく均等配分します。
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Cloudflare Tunnel Custom */}
          {activeTab === "tunnel" && (
            <div className="space-y-6">
              <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-800/60 text-xs space-y-2">
                <div className="flex items-center gap-2 text-cyan-300 font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  自前Windows PCで Cloudflare Tunnel を起動した場合
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Windows PCで <code className="bg-slate-900 px-1 py-0.5 rounded text-cyan-300">cloudflared tunnel --url http://localhost:3000</code> を実行した際に発行されたURL（例: <code className="text-amber-300">https://xxxx.trycloudflare.com</code>）をここに入力すると、スマホで読み取れるQRコードが自動生成されます。
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 block">
                  発行された Cloudflare Tunnel のURLを入力:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="https://random-subdomain.trycloudflare.com"
                    value={customTunnelUrl}
                    onChange={(e) => setCustomTunnelUrl(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 focus:border-cyan-400 px-3 py-2 rounded-lg text-xs font-mono text-cyan-300 outline-none"
                  />
                  {customTunnelUrl && (
                    <button
                      onClick={() => setCustomTunnelUrl("")}
                      className="px-2 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg"
                    >
                      クリア
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center pt-2">
                {/* QR Code Container */}
                <div className="flex flex-col items-center justify-center p-4 bg-slate-950 rounded-xl border border-slate-800 text-center">
                  <div className="relative group p-2 bg-slate-900 rounded-lg border border-cyan-500/30">
                    <img
                      src={qrCodeUrl}
                      alt="トンネル参加用QRコード"
                      className="w-44 h-44 rounded"
                      loading="lazy"
                    />
                  </div>
                  <span className="mt-2 text-xs font-medium text-cyan-300 flex items-center gap-1.5">
                    <QrCode className="w-4 h-4" />
                    スマホのカメラでスキャン
                  </span>
                </div>

                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 mb-1.5">
                      スマホ・別PC用アクセスURL
                    </h4>
                    <div className="flex items-center gap-2 p-2 bg-slate-950 rounded-lg border border-slate-800">
                      <input
                        type="text"
                        readOnly
                        value={effectiveShareUrl}
                        className="bg-transparent text-xs font-mono text-cyan-400 w-full outline-none select-all truncate"
                      />
                      <button
                        onClick={() => handleCopy(effectiveShareUrl)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors shrink-0 cursor-pointer"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            コピー済
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            コピー
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 text-[11px] text-slate-400 space-y-1">
                    <p className="font-semibold text-slate-200">
                      💡 ルーター設定不要で世界中から直接接続
                    </p>
                    <p>
                      スマホの4G/5G回線や外出先のカフェWi-Fiからでも、自宅のWindows PCで動いている親サーバーに直接WebSocket接続され、タスクを消化できます。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Local LAN */}
          {activeTab === "local" && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-cyan-400" />
                  自前PCで親サーバーを動かしている場合の手順（同一Wi-Fi）
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  同じWi-Fi（家庭内LAN・研究室LAN）に繋がっているスマホや別PCからアクセスする場合の手順です。
                </p>

                <div className="space-y-3 pt-2 text-xs">
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <p className="font-semibold text-slate-300 mb-1">
                      ステップ 1: 親PCのローカルIPアドレスを確認する
                    </p>
                    <p className="text-slate-400 mb-2">
                      Windowsのコマンドプロンプトで以下を実行します：
                    </p>
                    <div className="p-2 bg-slate-950 rounded font-mono text-[11px] text-cyan-300">
                      ipconfig<br />
                      <span className="text-slate-500">→ 「IPv4 アドレス」を確認（例: 192.168.1.15）</span>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <p className="font-semibold text-slate-300 mb-1">
                      ステップ 2: 別端末（スマホ等）のブラウザに入力する
                    </p>
                    <p className="text-slate-400 mb-2">
                      同じWi-Fiに接続したスマホのブラウザのアドレスバーに以下を入力します：
                    </p>
                    <div className="p-2.5 bg-slate-950 rounded font-mono text-xs text-amber-400 border border-slate-800">
                      http://192.168.1.15:3000
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            QRコードをスマホでスキャンするだけでブラウザワーカーとして参加できます
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
