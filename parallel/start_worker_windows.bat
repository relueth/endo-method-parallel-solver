@echo off
chcp 65001 > nul
title LAN 分散計算システム - ワーカーPC

echo ===================================================
echo   LAN 分散計算 ワーカーPC (Endo Method phi^-1(n))
echo ===================================================
echo.

:: Python の存在確認
python --version > nul 2>&1
if errorlevel 1 (
    echo [エラー] Python が見つかりません。
    echo Python をインストールし、「Add python.exe to PATH」を有効にしてください。
    pause
    exit /b 1
)

:: sympy の確認
python -c "import sympy" > nul 2>&1
if errorlevel 1 (
    echo [初期設定] sympy ライブラリをインストールしています...
    pip install sympy
)

echo.
set /p WORKER_ID="このワーカーのIDを入力してください (例: PC01, PC02): "
if "%WORKER_ID%"=="" set WORKER_ID=PC01

set /p SERVER_IP="親サーバーのIPv4アドレスを入力してください (例: 192.168.1.100): "
if "%SERVER_IP%"=="" (
    echo [エラー] 親サーバーのIPアドレスを入力してください。
    pause
    exit /b 1
)

echo.
echo ===================================================
echo  ワーカー %WORKER_ID% を起動し、サーバー %SERVER_IP%:5000 に接続します
echo  終了する場合は Ctrl + C を押してください。
echo ===================================================
echo.

python worker.py --id %WORKER_ID% --server %SERVER_IP% --port 5000
pause
