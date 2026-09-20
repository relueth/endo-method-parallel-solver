#!/usr/bin/env pythonw
"""
gui_worker.pyw - Windows向け ワーカーPC GUI (黒い画面なしで起動)
"""
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from gui_worker import main

if __name__ == "__main__":
    main()
