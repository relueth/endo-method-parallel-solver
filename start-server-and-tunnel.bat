@echo off
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

:: 2. Python のチェック
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [警告] Python が見つかりません。
    echo バックエンドで Endo_method.py を実行するために Python が推奨されます:
    echo    winget install Python.Python.3.11
    echo.
)

:: 3. 依存ライブラリのインストール確認
if not exist node_modules (
    echo [1/3] 初回起動のため、ライブラリをインストールしています (npm install --legacy-peer-deps)...
    call npm install --legacy-peer-deps
    if %errorlevel% neq 0 (
        echo [エラー] npm install に失敗しました。
        pause
        exit /b 1
    )
)

:: 4. Cloudflare cloudflared のチェック
where cloudflared >nul 2>nul
if %errorlevel% neq 0 (
    echo [2/3] Cloudflare Tunnel (cloudflared) をインストールしています...
    winget install --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements
    echo.
    echo ※ インストールが完了しました。もしパスが通っていない場合は
    echo    コマンドプロンプトを一度閉じて再度本バッチを実行してください。
    echo.
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

pause
