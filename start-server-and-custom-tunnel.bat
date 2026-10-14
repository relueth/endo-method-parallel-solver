@echo off
chcp 65001 > nul
title [親サーバー & 独自ドメインTunnel] 分散計算システム一括起動
color 0b

echo =====================================================================
echo    φ(x)=n オイラー関数逆像求解 分散計算システム
echo    親サーバー (:3000) ＆ 固定独自ドメイン Tunnel 一括起動
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
    echo [1/3] 初回起動のため、ライブラリをインストールしています (npm install --legacy-peer-deps)...
    call npm install --legacy-peer-deps
    if %errorlevel% neq 0 (
        echo [エラー] npm install に失敗しました。
        pause
        exit /b 1
    )
)

:: 3. cloudflared のチェック
where cloudflared >nul 2>nul
if %errorlevel% neq 0 (
    echo [2/3] Cloudflare Tunnel (cloudflared) をインストールしています...
    winget install --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements
    echo.
)

:: 4. トークンファイルの事前確認
set TOKEN_FILE=tunnel_token.txt
if not exist %TOKEN_FILE% (
    echo [事前設定] 固定ドメイン用のトンネルトークンを設定します。
    call start-custom-tunnel.bat
    exit /b 0
)

:: 5. 複数端末・スマホ同時接続高速化のための静的アセット確認
if not exist "dist\index.html" (
    echo [2.5/3] 複数端末・スマホが同時にアクセスしても詰まらないよう、本番アセットを事前ビルドしています (約2秒)...
    call npm run build
)

echo [3/3] 親サーバー (ポート 3000) を別ウィンドウで起動します...
start "Node.js 親サーバー (:3000)" cmd /k "npm run dev"

echo.
echo サーバーの立ち上がりを待機しています (約5秒)...
timeout /t 5 > nul

echo.
echo =====================================================================
echo    固定独自ドメインへのトンネルを起動します
echo =====================================================================
echo.

call start-custom-tunnel.bat

pause
