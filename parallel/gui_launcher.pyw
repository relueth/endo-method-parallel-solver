#!/usr/bin/env pythonw
"""
gui_launcher.pyw - Windows向けGUI統合ランチャー
黒いコマンド画面を出さずにGUIのみを直接起動します。
"""
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from gui_launcher import main

if __name__ == "__main__":
    main()
