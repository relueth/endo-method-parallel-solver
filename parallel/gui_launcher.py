#!/usr/bin/env python3
"""
gui_launcher.py - LAN分散計算システム 統合ランチャー
Windows / Mac / Linux 対応
ダブルクリックするだけで親サーバーまたはワーカーのGUIをワンクリック起動できます。
"""

import sys
import os
import subprocess
from pathlib import Path

# sympy の自動確認 & インストール
try:
    import sympy
except ImportError:
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "sympy"])
        import sympy
    except Exception:
        pass

import tkinter as tk
from tkinter import ttk, messagebox

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

# Windows 高DPI対応
try:
    import ctypes
    ctypes.windll.shcore.SetProcessDpiAwareness(1)
except Exception:
    pass


class LauncherApp:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("LAN分散計算システム (Endo Method φ⁻¹(n))")
        self.root.geometry("520x420")
        self.root.resizable(False, False)

        # スタイル
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except Exception:
            pass

        # メインフレーム
        frame = ttk.Frame(root, padding=24)
        frame.pack(fill=tk.BOTH, expand=True)

        # タイトル
        lbl_title = tk.Label(
            frame, text="LAN 分散計算システム",
            font=("Segoe UI", 16, "bold"), fg="#0f172a"
        )
        lbl_title.pack(pady=(0, 2))

        lbl_sub = tk.Label(
            frame, text="オイラー関数 φ(x)=n 逆像分散ソルバー (Endo Method)",
            font=("Segoe UI", 9), fg="#64748b"
        )
        lbl_sub.pack(pady=(0, 20))

        lbl_prompt = tk.Label(
            frame, text="このPCの役割を選択して起動してください:",
            font=("Segoe UI", 10, "bold"), fg="#334155"
        )
        lbl_prompt.pack(anchor=tk.W, pady=(0, 10))

        # 1. 親サーバー起動ボタンカード
        card_server = tk.Frame(frame, bg="#f0fdf4", bd=1, relief="solid", padx=12, pady=12)
        card_server.pack(fill=tk.X, pady=(0, 12))

        btn_server = tk.Button(
            card_server, text="🖥️  親サーバーとして起動 (管理PC)",
            font=("Segoe UI", 12, "bold"), bg="#16a34a", fg="white",
            activebackground="#15803d", activeforeground="white",
            padx=16, pady=8, cursor="hand2", relief="raised",
            command=self.launch_server
        )
        btn_server.pack(fill=tk.X)

        lbl_desc_s = tk.Label(
            card_server, text="タスクの配分、進捗バー、接続ワーカー一覧、結果保存を管理します (LAN内で1台のみ起動)",
            font=("Segoe UI", 8), bg="#f0fdf4", fg="#166534", wraplength=450, justify=tk.LEFT
        )
        lbl_desc_s.pack(anchor=tk.W, pady=(6, 0))

        # 2. ワーカー起動ボタンカード
        card_worker = tk.Frame(frame, bg="#f0f9ff", bd=1, relief="solid", padx=12, pady=12)
        card_worker.pack(fill=tk.X, pady=(0, 15))

        btn_worker = tk.Button(
            card_worker, text="💻  ワーカーPCとして起動 (計算用PC)",
            font=("Segoe UI", 12, "bold"), bg="#0284c7", fg="white",
            activebackground="#0369a1", activeforeground="white",
            padx=16, pady=8, cursor="hand2", relief="raised",
            command=self.launch_worker
        )
        btn_worker.pack(fill=tk.X)

        lbl_desc_w = tk.Label(
            card_worker, text="親サーバーのIPに接続し、Endo_method で φ⁻¹(n) の数値計算を自動実行します (各PCで起動)",
            font=("Segoe UI", 8), bg="#f0f9ff", fg="#0369a1", wraplength=450, justify=tk.LEFT
        )
        lbl_desc_w.pack(anchor=tk.W, pady=(6, 0))

        # フッター
        lbl_footer = tk.Label(
            frame, text="※ .bat を使わずに Python 単体で直接動作します",
            font=("Segoe UI", 8), fg="#94a3b8"
        )
        lbl_footer.pack(side=tk.BOTTOM)

    def launch_server(self):
        try:
            self.root.destroy()
            from gui_server import main as server_main
            server_main()
        except Exception as e:
            messagebox.showerror("起動エラー", f"親サーバーGUIの起動に失敗しました:\n{e}")

    def launch_worker(self):
        try:
            self.root.destroy()
            from gui_worker import main as worker_main
            worker_main()
        except Exception as e:
            messagebox.showerror("起動エラー", f"ワーカーGUIの起動に失敗しました:\n{e}")


def main():
    root = tk.Tk()
    app = LauncherApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
