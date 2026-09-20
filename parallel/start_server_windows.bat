@echo off
chcp 65001 > nul
title LAN 分散計算システム - 親サーバー

echo ===================================================
echo   LAN 分散計算 親サーバー (Endo Method phi^-1(n))
echo ===================================================
echo.

:: Python の存在確認
python --version > nul 2>&1
if errorlevel 1 (
    echo [エラー] Python が見つかりません。
    echo Python をインストールし、インストール時に「Add python.exe to PATH」にチェックを入れてください。
    pause
    exit /b 1
)

:: sympy のインストール確認
python -c "import sympy" > nul 2>&1
if errorlevel 1 (
    echo [初期設定] sympy ライブラリをインストールしています...
    pip install sympy
    if errorlevel 1 (
        echo [エラー] sympy のインストールに失敗しました。インターネット接続を確認してください。
        pause
        exit /b 1
    )
)

:: IP アドレスの表示
echo ---------------------------------------------------
echo [親サーバーPCの IP アドレス確認]
ipconfig | findstr /i "IPv4"
echo ---------------------------------------------------
echo ※ 上記の IPv4 アドレス（例: 192.168.x.x）をメモして、
echo    各ワーカーPCの起動時に入力してください。
echo.
echo ポート 5000 でサーバーを起動します...
echo 終了する場合は Ctrl + C を押してください。
echo ===================================================
echo.

python server.py --host 0.0.0.0 --port 5000
pause
