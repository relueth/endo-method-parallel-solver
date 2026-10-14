# Cloudflare Tunnel 独自ドメイン運用・設定ガイド連携計画

Cloudflare TunnelでランダムなURL (`*.trycloudflare.com`) ではなく、自分が決めた固定の独自ドメイン（例: `cluster.yourdomain.com`）で親サーバーを公開し、ワーカーPCから安定接続できるようにする導入手順・自動起動スクリプト・アプリ内ガイドの設計計画です。

---

## ユーザー確認事項・確定方針

> [!IMPORTANT]
> 事前ヒアリングで確定した方針および推奨設定です。ご確認の上、問題なければ「Proceed」を押して実装へ進んでください。

- **確定方針 1（ドメイン状況）**: ドメインをまだお持ちでないため、一番安価かつ設定が自動連携できる「Cloudflare Registrar（年数百円〜）」または「お名前.com / ムームードメイン等」で取得しCloudflareに追加する最もスムーズなステップをガイド化します。
- **確定方針 2（設定方式）**: 難解なCLI設定ファイル（config.ymlや認証JSON）の作成を避け、最もトラブルが少なく簡単な**Cloudflare Zero Trust ダッシュボードでのトークン発行方式**を採用します。
- **確定方針 3（アプリ連携）**: 一度トークンを入力すれば次回からワンクリックで固定ドメイン公開ができる専用起動スクリプト（`start-custom-tunnel.bat`）の作成と、GUI管理画面内に「独自ドメイン接続ガイド」モーダル/タブを追加します。

---

## 1. 概要とコンセプト

- **目的**: 
  - Quick Tunnel（無料一時URL）では起動ごとにURLが変わり、ワーカーPC側の接続先変更や再設定が必要だった課題を解消します。
  - 常に同じドメイン（例: `https://cluster.example.com`）で親サーバーとWebSocket待受を稼働させ、複数台の計算ワーカーが常時自動再接続できるようにします。
- **対象ユーザー**:
  - 複数PCで並列計算を行う管理者。サーバー構築経験が浅くてもGUI手順に従うだけで固定ドメイン公開を完了できる親切な設計とします。
- **提供価値**:
  - ドメイン購入からCloudflare登録、トンネルトークン取得、バッチ起動までの全工程がワンストップで可視化されます。

---

## 2. ユーザー体験と画面・スクリプト設計

### A. スクリプト構成（Windowsバッチ）
1. **`start-custom-tunnel.bat`**:
   - `cloudflared` が未インストールの場合は自動インストール（winget）。
   - `tunnel_token.txt` が存在すればそのトークンを使って即座に常駐起動:
     ```bat
     cloudflared tunnel run --token <YOUR_TOKEN>
     ```
   - トークンが初回未設定の場合は、プロンプトでトークン入力を求め、`tunnel_token.txt` に保存して次回以降自動起動。
2. **`start-server-and-custom-tunnel.bat`**:
   - 親サーバー（`npm run dev` または `server.ts`）と上記Named Tunnelを1発で両方起動する統合バッチ。

### B. Web GUI上の「独自ドメイン設定ガイド」
- **画面配置**:
  - クラスタ管理画面（GUI Server View）のヘッダー接続情報エリアに「独自ドメインで公開する (Cloudflare Tunnel)」ボタンを配置。
- **4ステップ・インタラクティブガイド**:
  1. **STEP 1: ドメインの準備（約500円〜）**:
     - Cloudflare Registrar（手数料なし原価販売・最も推奨）または任意レジストラでドメインを取得し、Cloudflareに無料プランでネームサーバーを登録する流れ。
  2. **STEP 2: Zero TrustでTunnelを作成**:
     - Cloudflare One（Zero Trust管理画面） > Networks > Tunnels > 「Add a tunnel」を選択。
     - Connectorとして `Cloudflared` を選択。
  3. **STEP 3: ルーティング（Public Hostname）の登録**:
     - サブドメイン（例: `cluster`）と取得ドメイン（例: `example.com`）を選択。
     - 転送先サービス: `HTTP`、URL: `localhost:3000` を指定（ワンクリックで完了）。
     - **重要設定（WebSocket有効化）**: CloudflareのデフォルトでWebSocketは自動通過するため追加設定不要である点も明記。
  4. **STEP 4: トークンのコピーと起動**:
     - 画面に表示される `cloudflared.exe service install <TOKEN>` のトークン文字列をコピーして、アプリ内または `start-custom-tunnel.bat` に貼り付けるだけ。

---

## 3. 主要な設計判断とトレードオフ

- **判断 1: クラウド管理型トンネル（Zero Trust Dashboard） vs ローカルCLI型（config.yml）**:
  - *採用*: Zero Trust Dashboard管理方式。
  - *理由*: CLI方式だと `cloudflared tunnel login` によるブラウザ認証、`cert.pem` の配置、UUIDの特定、YAMLインデントエラーなどトラブルが多発します。Dashboard方式ならWeb画面でポチポチ選んで発行されたトークンを渡すだけでDNSレコードも自動生成されます。
- **判断 2: トークンのローカル保持**:
  - *採用*: プロジェクト直下の `tunnel_token.txt`（`.gitignore` で保護）に保存。
  - *理由*: 毎回長いトークンを貼り付ける手間をゼロにし、日常的にバッチのダブルクリックだけで起動できるようにします。

---

## 4. 技術アーキテクチャ & データフロー

```
┌─────────────────────────────────────────────────────────────┐
│                      Cloudflare Edge                        │
│   https://cluster.yourdomain.com  (固定独自ドメイン・SSL自動)  │
└──────────────┬──────────────────────────────▲───────────────┘
               │ HTTPS / WSS リバースプロキシ   │ (アウトバウンドのみ)
               ▼                              │
┌─────────────────────────────┐               │
│      リモート計算PC群         │               │
│   (Worker 1, 2, ... N)      │               │
│  ※ 接続先URLを固定ドメインに設定 │               │
└─────────────────────────────┘               │
                                              │
┌──[ 自宅 / 親PC ]────────────────────────────┼───────────────┐
│                                             │               │
│   ┌─────────────────────────────────────────┴──────────┐   │
│   │ cloudflared (Named Tunnel with Token)             │   │
│   │ start-custom-tunnel.bat                            │   │
│   └─────────────────────┬──────────────────────────────┘   │
│                         │ http://localhost:3000 (内部転送)   │
│                         ▼                                  │
│   ┌────────────────────────────────────────────────────┐   │
│   │ 親サーバー (Node.js Express + Vite: 3000ポート)     │   │
│   │ - HTTP / API / GUI                                 │   │
│   │ - WebSocket (/ws/worker)                           │   │
│   │ - SQLite (WAL mode, 即時レスポンス)                 │   │
│   └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 変更・追加対象ファイル
- `start-custom-tunnel.bat`: 新規作成（トークン管理・Named Tunnel専用起動スクリプト）
- `start-server-and-custom-tunnel.bat`: 新規作成（親サーバーとNamed Tunnelの同時起動）
- `.gitignore`: `tunnel_token.txt` を追跡除外に追加（セキュリティ保護）
- `src/components/CustomDomainGuideModal.tsx`: 新規作成（分かりやすい図解入り設定ガイドモーダル）
- `src/components/GuiServerView.tsx`: ガイドモーダルを開くボタンおよびカスタムドメイン表示欄の連携
