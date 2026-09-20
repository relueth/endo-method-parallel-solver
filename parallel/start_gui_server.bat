@echo off
chcp 65001 > nul
title LAN 分散計算システム - 親サーバー GUI

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

echo 親サーバー GUI を起動しています...
python gui_server.py
if errorlevel 1 (
    echo.
    echo [エラー] GUI 起動中に問題が発生しました。
    pause
)
