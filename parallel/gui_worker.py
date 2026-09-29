#!/usr/bin/env python3
"""
gui_worker.py - LAN分散計算システム ワーカーPC GUI アプリケーション
Windows / Mac / Linux 対応 (標準 tkinter)
"""

import sys
import os
import json
import socket
import threading
import time
import logging
from pathlib import Path
import subprocess

# sympy の自動確認 & インストール
try:
    import sympy
except ImportError:
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "sympy"])
        import sympy
    except Exception as e:
        import tkinter as tk
        from tkinter import messagebox
        _r = tk.Tk()
        _r.withdraw()
        messagebox.showerror("依存パッケージエラー", f"sympy ライブラリの自動インストールに失敗しました:\n{e}\n\npip install sympy を実行してください。")
        sys.exit(1)

import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext

# 同一ディレクトリの worker.py からクラスと関数をインポート
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from worker import WorkerClient, calculate, LOGS_DIR, CONFIG_FILE
from discovery import get_local_ip_addresses

# Windows 高DPI対応
try:
    import ctypes
    ctypes.windll.shcore.SetProcessDpiAwareness(1)
except Exception:
    pass


class TextHandler(logging.Handler):
    """Logging ハンドラを Tkinter ScrolledText に安全に転送"""
    def __init__(self, text_widget, root):
        super().__init__()
        self.text_widget = text_widget
        self.root = root

    def emit(self, record):
        msg = self.format(record)
        def append():
            try:
                self.text_widget.configure(state='normal')
                self.text_widget.insert(tk.END, msg + '\n')
                self.text_widget.see(tk.END)
                self.text_widget.configure(state='disabled')
            except Exception:
                pass
        self.root.after(0, append)


class WorkerGUI:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("LAN分散計算システム - ワーカーPC (Endo Method φ⁻¹(n))")
        self.root.geometry("780x620")
        self.root.minsize(700, 500)

        self.style = ttk.Style()
        try:
            self.style.theme_use("clam")
        except Exception:
            pass

        self.worker: WorkerClient = None
        self.worker_thread = None
        self.is_connected = False

        self.total_completed_tasks = 0
        self.total_solutions_found = 0

        self.cfg_file = BASE_DIR / "worker_settings.json"
        self.settings = self.load_settings()

        self._create_widgets()
        self._setup_logging()

        self.root.after(500, self._update_stats_loop)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def load_settings(self):
        local_ips = get_local_ip_addresses()
        detected_ip = local_ips[0] if local_ips else "127.0.0.1"

        default = {
            "worker_id": "AUTO",
            "server_ip": detected_ip,
            "server_port": 5000
        }
        if self.cfg_file.exists():
            try:
                with open(self.cfg_file, "r", encoding="utf-8") as f:
                    saved = json.load(f)
                    # 以前の古いダミー固定IP "192.168.1.100" やAUTO・空文字が残っていた場合は本機IPを自動入力
                    if saved.get("server_ip") in ("192.168.1.100", "AUTO", "", None):
                        saved["server_ip"] = detected_ip
                    default.update(saved)
            except Exception:
                pass
        # 以前のバージョンでPC01が保存されていた場合もAUTOを推奨
        if default.get("worker_id") == "PC01":
            default["worker_id"] = "AUTO"
        return default

    def save_settings(self):
        try:
            w_id = self.entry_worker_id.get().strip()
            if not w_id:
                w_id = "AUTO"
            with open(self.cfg_file, "w", encoding="utf-8") as f:
                json.dump({
                    "worker_id": w_id,
                    "server_ip": self.entry_server_ip.get().strip(),
                    "server_port": int(self.entry_server_port.get().strip())
                }, f, indent=2)
        except Exception:
            pass

    def _create_widgets(self):
        main_frame = ttk.Frame(self.root, padding=12)
        main_frame.pack(fill=tk.BOTH, expand=True)

        # 1. 接続設定フレーム
        conn_frame = ttk.LabelFrame(main_frame, text=" 接続設定 ", padding=10)
        conn_frame.pack(fill=tk.X, pady=(0, 10))

        grid = ttk.Frame(conn_frame)
        grid.pack(fill=tk.X)

        # 1行目: ワーカーID (AUTO自動採番案内)
        ttk.Label(grid, text="ワーカーID:").grid(row=0, column=0, sticky=tk.W, padx=4, pady=4)
        self.entry_worker_id = ttk.Entry(grid, width=12, font=("Segoe UI", 10, "bold"))
        self.entry_worker_id.insert(0, self.settings.get("worker_id", "AUTO"))
        self.entry_worker_id.grid(row=0, column=1, padx=4, pady=4)

        lbl_hint = ttk.Label(
            grid, text="※AUTOまたは空欄で接続順に自動採番 (PC01, PC02...)",
            font=("Segoe UI", 9), foreground="#0369a1"
        )
        lbl_hint.grid(row=0, column=2, columnspan=4, sticky=tk.W, padx=(8, 4), pady=4)

        # 2行目: 親サーバーIP & ポート (起動時に本機IPを自動入力・手動で直接書き換えも可能)
        ttk.Label(grid, text="親サーバーIP:").grid(row=1, column=0, sticky=tk.W, padx=4, pady=4)
        self.entry_server_ip = ttk.Entry(grid, width=16, font=("Consolas", 10))
        self.entry_server_ip.insert(0, self.settings.get("server_ip", "127.0.0.1"))
        self.entry_server_ip.grid(row=1, column=1, padx=4, pady=4)

        ttk.Label(grid, text="ポート:").grid(row=1, column=2, sticky=tk.W, padx=(12, 4), pady=4)
        self.entry_server_port = ttk.Entry(grid, width=8, font=("Consolas", 10))
        self.entry_server_port.insert(0, str(self.settings.get("server_port", 5000)))
        self.entry_server_port.grid(row=1, column=3, padx=4, pady=4)

        lbl_ip_note = ttk.Label(
            grid, text="※IP自動入力済み (手動での書き換え・変更も可能)",
            font=("Segoe UI", 9), foreground="#64748b"
        )
        lbl_ip_note.grid(row=1, column=4, sticky=tk.W, padx=(8, 4), pady=4)

        # 接続ボタン
        self.btn_connect = tk.Button(
            conn_frame, text="▶ サーバーへ接続 (待機開始)", font=("Segoe UI", 11, "bold"),
            bg="#0284c7", fg="white", activebackground="#0369a1", activeforeground="white",
            padx=16, pady=6, cursor="hand2", relief="raised", command=self._toggle_connection
        )
        self.btn_connect.pack(anchor=tk.E, pady=(8, 0))

        # 2. ワーカー状態 & 稼働状況サマリー
        status_frame = ttk.LabelFrame(main_frame, text=" ワーカー稼働状況 ", padding=10)
        status_frame.pack(fill=tk.X, pady=(0, 10))

        stat_grid = ttk.Frame(status_frame)
        stat_grid.pack(fill=tk.X)

        # 状態バッジ
        self.lbl_status_badge = tk.Label(
            stat_grid, text="● 未接続 (DISCONNECTED)", font=("Segoe UI", 11, "bold"),
            bg="#f1f5f9", fg="#64748b", padx=12, pady=4, relief="groove"
        )
        self.lbl_status_badge.grid(row=0, column=0, columnspan=2, sticky=tk.W, pady=(0, 8))

        # 担当タスク表示
        ttk.Label(stat_grid, text="現在担当のタスク:").grid(row=1, column=0, sticky=tk.W, padx=2, pady=3)
        self.lbl_current_task = ttk.Label(
            stat_grid, text="なし (未接続)", font=("Segoe UI", 10, "bold"), foreground="#0369a1"
        )
        self.lbl_current_task.grid(row=1, column=1, sticky=tk.W, padx=4, pady=3)

        # 完了タスク数
        ttk.Label(stat_grid, text="このPCの完了タスク:").grid(row=2, column=0, sticky=tk.W, padx=2, pady=3)
        self.lbl_completed_count = ttk.Label(
            stat_grid, text="0 件", font=("Segoe UI", 10, "bold"), foreground="#15803d"
        )
        self.lbl_completed_count.grid(row=2, column=1, sticky=tk.W, padx=4, pady=3)

        # 見つかった解の数
        ttk.Label(stat_grid, text="計算した解の総数:").grid(row=1, column=2, sticky=tk.W, padx=(20, 2), pady=3)
        self.lbl_solutions_count = ttk.Label(
            stat_grid, text="0 個 (φ⁻¹(n))", font=("Segoe UI", 10, "bold"), foreground="#4338ca"
        )
        self.lbl_solutions_count.grid(row=1, column=3, sticky=tk.W, padx=4, pady=3)

        # 直前の所要時間
        ttk.Label(stat_grid, text="直前の計算時間:").grid(row=2, column=2, sticky=tk.W, padx=(20, 2), pady=3)
        self.lbl_last_duration = ttk.Label(
            stat_grid, text="- 秒", font=("Segoe UI", 10)
        )
        self.lbl_last_duration.grid(row=2, column=3, sticky=tk.W, padx=4, pady=3)

        # 3. リアルタイムログ
        log_frame = ttk.LabelFrame(main_frame, text=" ワーカー通信 & 計算ログ ", padding=6)
        log_frame.pack(fill=tk.BOTH, expand=True)

        self.log_text = scrolledtext.ScrolledText(
            log_frame, wrap=tk.WORD, font=("Consolas", 9),
            bg="#0f172a", fg="#f8fafc", state='disabled', height=10
        )
        self.log_text.pack(fill=tk.BOTH, expand=True)

        btn_clear = ttk.Button(log_frame, text="ログ消去", command=self._clear_log)
        btn_clear.pack(anchor=tk.W, pady=(4, 0))

    def _setup_logging(self):
        text_handler = TextHandler(self.log_text, self.root)
        text_handler.setFormatter(logging.Formatter("[%(asctime)s] %(message)s", datefmt="%H:%M:%S"))
        logger = logging.getLogger("ParallelWorker")
        logger.addHandler(text_handler)

    def _on_worker_registered(self, assigned_id: str):
        """親サーバーから確定されたワーカーID (PC01, PC02...) を画面に即座に反映"""
        def update_ui():
            try:
                self.entry_worker_id.config(state="normal")
                self.entry_worker_id.delete(0, tk.END)
                self.entry_worker_id.insert(0, assigned_id)
                self.entry_worker_id.config(state="disabled")
                self.root.title(f"LAN分散計算システム - ワーカーPC [{assigned_id}] (Endo Method φ⁻¹(n))")
                self.lbl_status_badge.config(
                    text=f"● 接続中 - {assigned_id} (CONNECTED)",
                    bg="#dcfce7", fg="#15803d"
                )
            except Exception:
                pass
        self.root.after(0, update_ui)

    def _toggle_connection(self):
        if not self.is_connected:
            # 入力バリデーション
            w_id = self.entry_worker_id.get().strip()
            if not w_id:
                w_id = "AUTO"
            s_ip = self.entry_server_ip.get().strip()
            try:
                s_port = int(self.entry_server_port.get().strip())
                if not s_ip:
                    raise ValueError("親サーバーのIPアドレスを入力してください")
            except Exception as e:
                messagebox.showerror("入力エラー", f"設定値を確認してください:\n{e}")
                return

            self.save_settings()

            # ワーカーインスタンス作成 (サーバー自動採番コールバックを連携)
            self.worker = WorkerClient(w_id, s_ip, s_port, on_registered=self._on_worker_registered)
            self.worker_thread = threading.Thread(target=self.worker.start, daemon=True)
            self.worker_thread.start()
            self.is_connected = True

            self.btn_connect.config(
                text="⏹ 切断・停止", bg="#ef4444", activebackground="#dc2626"
            )
            self.entry_worker_id.config(state="disabled")
            self.entry_server_ip.config(state="disabled")
            self.entry_server_port.config(state="disabled")

        else:
            if self.worker:
                self.worker.stop()
            self.is_connected = False

            self.btn_connect.config(
                text="▶ サーバーへ接続 (待機開始)", bg="#0284c7", activebackground="#0369a1"
            )
            self.lbl_status_badge.config(
                text="● 未接続 (DISCONNECTED)", bg="#f1f5f9", fg="#64748b"
            )
            self.lbl_current_task.config(text="なし (停止中)")
            self.root.title("LAN分散計算システム - ワーカーPC (Endo Method φ⁻¹(n))")
            self.entry_worker_id.config(state="normal")
            self.entry_server_ip.config(state="normal")
            self.entry_server_port.config(state="normal")

    def _update_stats_loop(self):
        """ワーカーの状態を定期的にUIに反映"""
        if self.is_connected and self.worker:
            st = self.worker.state
            wid = getattr(self.worker, "worker_id", "PC")
            if st == "RUNNING":
                self.lbl_status_badge.config(text=f"● 計算実行中 [{wid}] (RUNNING)", bg="#dbeafe", fg="#1d4ed8")
            elif st == "STANDBY":
                self.lbl_status_badge.config(text=f"● 接続中・開始指示待ち [{wid}] (STANDBY)", bg="#fef3c7", fg="#b45309")
            elif st == "WAITING":
                self.lbl_status_badge.config(text=f"● タスク割当待ち [{wid}] (WAITING)", bg="#f1f5f9", fg="#475569")
            elif st == "CONNECTED":
                self.lbl_status_badge.config(text=f"● 接続中 [{wid}] (CONNECTED)", bg="#dcfce7", fg="#15803d")
            else:
                self.lbl_status_badge.config(text="● 未接続 / 再接続待機中 (DISCONNECTED)", bg="#fee2e2", fg="#b91c1c")

            if self.worker.current_task:
                tid = self.worker.current_task.get("task_id", "-")
                s = self.worker.current_task.get("start", "-")
                e = self.worker.current_task.get("end", "-")
                self.lbl_current_task.config(text=f"task_{tid} [{s} 〜 {e}]")
            else:
                if st == "STANDBY":
                    self.lbl_current_task.config(text="なし (親サーバーからの開始指示待ち)")
                else:
                    self.lbl_current_task.config(text="待機中 (割り当て待ち)")

            self.lbl_completed_count.config(text=f"{self.worker.completed_tasks_count} 件")
            self.lbl_solutions_count.config(text=f"{self.worker.total_solutions_count:,} 個 (φ⁻¹(n))")
            if self.worker.last_duration > 0:
                self.lbl_last_duration.config(text=f"{self.worker.last_duration:.4f} 秒")

        self.root.after(500, self._update_stats_loop)

    def _clear_log(self):
        self.log_text.configure(state='normal')
        self.log_text.delete('1.0', tk.END)
        self.log_text.configure(state='disabled')

    def _on_close(self):
        if self.is_connected and self.worker:
            self.worker.stop()
        self.root.destroy()


def main():
    root = tk.Tk()
    app = WorkerGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
