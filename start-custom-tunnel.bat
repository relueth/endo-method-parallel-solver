@echo off
chcp 65001 > nul
title [Cloudflare Named Tunnel] 固定独自ドメイン公開
color 0a

echo =====================================================================
echo    Cloudflare Named Tunnel (固定独自ドメイン公開ランチャー)
echo    ポート 3000 (親サーバー) を固定ドメインでインターネットへ常時公開します
echo =====================================================================
echo.

:: 1. cloudflared の存在確認と自動導入
where cloudflared >nul 2>nul
if %errorlevel% neq 0 (
    echo [準備] cloudflared が見つからないためインストールしています (winget)...
    winget install --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements
    echo インストールが完了しました。
    echo.
)

:: 2. トークンファイルのチェック
set TOKEN_FILE=tunnel_token.txt

if not exist %TOKEN_FILE% (
    echo [初回設定] Cloudflare Zero Trust のトンネルトークンが未設定です。
    echo.
    echo 【トークンの取得方法】
    echo 1. Cloudflare One (https://one.dash.cloudflare.com/) にアクセス
    echo 2. [Networks] ^> [Tunnels] ^> [Create a tunnel] をクリック
    echo 3. トンネル名 (例: cluster-tunnel) を入力して [Cloudflared] を選択
    echo 4. 「Install and run a connector」画面の Windows コマンド内にある
    echo    長いトークン文字列 (ey... で始まる英数字) のみをコピー
    echo.
    echo -----------------------------------------------------------------
    set /p USER_TOKEN="ここにトンネルトークンを貼り付けて Enter を押してください: "
    echo -----------------------------------------------------------------
    echo.
    if "%USER_TOKEN%"=="" (
        echo [エラー] トークンが入力されませんでした。処理を中断します。
        pause
        exit /b 1
    )
    echo %USER_TOKEN%> %TOKEN_FILE%
    echo トークンを %TOKEN_FILE% に保存しました。次回以降は自動で読み込まれます。
    echo (トークンを変更したいときは %TOKEN_FILE% を削除または編集してください)
    echo.
)

:: トークン読み込み
set /p CLOUDFLARE_TOKEN=<%TOKEN_FILE%

if "%CLOUDFLARE_TOKEN%"=="" (
    echo [エラー] %TOKEN_FILE% が空です。ファイルを削除して再度実行してください。
    pause
    exit /b 1
)

echo トークンを確認しました。
echo 固定ドメインへの接続トンネルを確立しています...
echo (終了するときは このウィンドウを閉じるか Ctrl + C を押してください)
echo.

:: --protocol http2 で多重化と高耐久接続を保証
cloudflared tunnel --protocol http2 run --token %CLOUDFLARE_TOKEN%

pause
