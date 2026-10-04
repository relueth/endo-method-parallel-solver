@echo off
chcp 65001 > nul
title Cloudflare Tunnel (ポート3000を世界へ公開)
color 0a

echo =====================================================================
echo    Cloudflare Quick Tunnel 起動
echo    ポート 3000 (親サーバー) をインターネットに無料公開します
echo =====================================================================
echo.

where cloudflared >nul 2>nul
if %errorlevel% neq 0 (
    echo cloudflared をインストールしています (winget)...
    winget install --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements
)

echo トンネルを起動中...
echo 下記に表示される「https://*.trycloudflare.com」が世界中からアクセスできるURLです:
echo.

cloudflared tunnel --url http://localhost:3000

pause
