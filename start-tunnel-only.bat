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

:: Windows環境でのIPv6スタック遅延・単一接続ブロッキングを防ぐため 127.0.0.1 を直接指定
:: --protocol http2 により、QUIC(UDP)特有のWindowsパケット詰まり・2台目以降の接続遮断を完全解消
cloudflared tunnel --protocol http2 --url http://127.0.0.1:3000

pause
