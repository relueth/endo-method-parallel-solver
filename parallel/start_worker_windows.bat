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
set /p WORKER_ID="ワーカーIDを入力 [Enterでサーバー自動割当 (PC01, PC02...)]: "
if "%WORKER_ID%"=="" set WORKER_ID=AUTO

set /p SERVER_IP="親サーバーIP [Enterで自動入力 / または直接入力]: "
if "%SERVER_IP%"=="" set SERVER_IP=AUTO

echo.
echo ===================================================
if "%SERVER_IP%"=="AUTO" (
    echo  親サーバー: 本機IPを自動入力 (ポート5000)
) else (
    echo  親サーバー: %SERVER_IP%:5000
)
if "%WORKER_ID%"=="AUTO" (
    echo  ワーカーID: サーバー接続順に自動割当 (PC01, PC02...)
) else (
    echo  ワーカーID: %WORKER_ID%
)
echo  終了する場合は Ctrl + C を押してください。
echo ===================================================
echo.

python worker.py --id %WORKER_ID% --server %SERVER_IP% --port 5000
pause
