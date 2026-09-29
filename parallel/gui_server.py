#!/usr/bin/env python3
"""
gui_server.py - LAN分散計算システム 親サーバー GUI アプリケーション
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
from datetime import datetime

import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext

# 同一ディレクトリの server.py からクラスと関数をインポート
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from server import DistributedServer, TaskManager, DATA_DIR, RESULTS_DIR, BACKUP_DIR, LOGS_DIR, CONFIG_FILE

# Windows 高DPI対応
try:
    import ctypes
    ctypes.windll.shcore.SetProcessDpiAwareness(1)
except Exception:
    pass


def get_local_ip_addresses():
    """LAN内のローカルIPv4アドレス候補を取得"""
    ips = []
    try:
        # UDPソケットでダミー接続してデフォルトインターフェースのIPを取得
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80))
        primary_ip = s.getsockname()[0]
        s.close()
        ips.append(primary_ip)
    except Exception:
        pass

    try:
        host_name = socket.gethostname()
        for ip in socket.gethostbyname_ex(host_name)[2]:
            if not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except Exception:
        pass

    if not ips:
        ips.append("127.0.0.1")
    return ips


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


class ServerGUI:
    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("LAN分散計算システム - 親サーバー (Endo Method φ⁻¹(n))")
        self.root.geometry("980x750")
        self.root.minsize(850, 650)

        # スタイル設定
        self.style = ttk.Style()
        try:
            self.style.theme_use("clam")
        except Exception:
            pass

        self.server: DistributedServer = None
        self.server_thread = None
        self.is_running = False

        self.local_ips = get_local_ip_addresses()
        self.primary_ip = self.local_ips[0] if self.local_ips else "127.0.0.1"

        # 設定読み込み
        self.config = self.load_config()

        self._create_widgets()
        self._setup_logging()

        # 定期監視タイマー開始 (1秒ごと)
        self.root.after(1000, self._update_ui_loop)

        # 終了時処理
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

    def load_config(self):
        default = {
            "server": {"host": "0.0.0.0", "port": 5000, "heartbeat_timeout": 30},
            "tasks": {"range_start": 1, "range_end": 10000, "chunk_size": 100}
        }
        if CONFIG_FILE.exists():
            try:
                with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    default.update(data)
            except Exception:
                pass
        return default

    def _create_widgets(self):
        # メインコンテナ
        main_frame = ttk.Frame(self.root, padding=12)
        main_frame.pack(fill=tk.BOTH, expand=True)

        # 1. 最上部ヘッダー（IP表示 & サーバー起動/停止ボタン）
        top_frame = ttk.LabelFrame(main_frame, text=" サーバー状態 & 接続先IP案内 ", padding=10)
        top_frame.pack(fill=tk.X, pady=(0, 10))

        # 状態バッジ
        self.status_badge = tk.Label(
            top_frame, text="● 停止中", font=("Segoe UI", 12, "bold"),
            bg="#f1f5f9", fg="#64748b", padx=12, pady=4, relief="groove"
        )
        self.status_badge.pack(side=tk.LEFT, padx=(0, 15))

        # IPアドレス案内
        ip_box = ttk.Frame(top_frame)
        ip_box.pack(side=tk.LEFT, fill=tk.X, expand=True)

        ip_label_title = ttk.Label(ip_box, text="ワーカーPCに入力する親サーバーのIPv4アドレス:", font=("Segoe UI", 9))
        ip_label_title.pack(anchor=tk.W)

        ip_display_frame = ttk.Frame(ip_box)
        ip_display_frame.pack(anchor=tk.W, pady=2)

        self.ip_text_var = tk.StringVar(value=f"{self.primary_ip} : 5000")
        ip_label = tk.Label(
            ip_display_frame, textvariable=self.ip_text_var,
            font=("Consolas", 14, "bold"), fg="#0369a1", bg="#e0f2fe", padx=8, pady=2, relief="solid", bd=1
        )
        ip_label.pack(side=tk.LEFT, padx=(0, 8))

        copy_btn = ttk.Button(ip_display_frame, text="IPをコピー", command=self._copy_ip)
        copy_btn.pack(side=tk.LEFT)

        # 起動 / 停止 ボタン
        self.btn_toggle_server = tk.Button(
            top_frame, text="▶ サーバー起動", font=("Segoe UI", 11, "bold"),
            bg="#10b981", fg="white", activebackground="#059669", activeforeground="white",
            padx=16, pady=6, cursor="hand2", relief="raised", command=self._toggle_server
        )
        self.btn_toggle_server.pack(side=tk.RIGHT, padx=5)

        # 2. タスク管理設定 & 進捗概要フレーム
        mid_frame = ttk.Frame(main_frame)
        mid_frame.pack(fill=tk.X, pady=(0, 10))

        # 左側: タスク設定
        task_cfg_frame = ttk.LabelFrame(mid_frame, text=" タスク範囲設定 & 続きの追加 ", padding=10)
        task_cfg_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(0, 5))

        # 現在の登録範囲サマリーラベル
        self.lbl_current_range = tk.Label(
            task_cfg_frame, text="現在登録されている範囲: [ 1 〜 5000 ]",
            font=("Segoe UI", 9, "bold"), fg="#0284c7"
        )
        self.lbl_current_range.pack(anchor=tk.W, pady=(0, 4))

        grid_frame = ttk.Frame(task_cfg_frame)
        grid_frame.pack(fill=tk.X)

        ttk.Label(grid_frame, text="開始 n:").grid(row=0, column=0, sticky=tk.W, padx=2, pady=3)
        self.entry_start = ttk.Entry(grid_frame, width=9)
        self.entry_start.insert(0, str(self.config.get("tasks", {}).get("range_start", 1)))
        self.entry_start.grid(row=0, column=1, padx=2, pady=3)

        ttk.Label(grid_frame, text="終了 n:").grid(row=0, column=2, sticky=tk.W, padx=4, pady=3)
        self.entry_end = ttk.Entry(grid_frame, width=10)
        self.entry_end.insert(0, str(self.config.get("tasks", {}).get("range_end", 10000)))
        self.entry_end.grid(row=0, column=3, padx=2, pady=3)

        ttk.Label(grid_frame, text="分割:").grid(row=0, column=4, sticky=tk.W, padx=4, pady=3)
        self.entry_chunk = ttk.Entry(grid_frame, width=6)
        self.entry_chunk.insert(0, str(self.config.get("tasks", {}).get("chunk_size", 100)))
        self.entry_chunk.grid(row=0, column=5, padx=2, pady=3)

        btn_auto_fill = ttk.Button(grid_frame, text="⏩ 続きの範囲を自動入力", command=self._auto_fill_next_range)
        btn_auto_fill.grid(row=0, column=6, padx=(6, 0), pady=3)

        btn_box = ttk.Frame(task_cfg_frame)
        btn_box.pack(fill=tk.X, pady=(8, 0))

        # 続きのタスク追加ボタン (一番目立たせる)
        self.btn_append_tasks = tk.Button(
            btn_box, text="➕ 続きのタスクを追加", font=("Segoe UI", 10, "bold"),
            bg="#0284c7", fg="white", activebackground="#0369a1", activeforeground="white",
            padx=10, pady=4, cursor="hand2", relief="raised", command=self._append_next_tasks
        )
        self.btn_append_tasks.pack(side=tk.LEFT, padx=(0, 6))

        self.btn_regen_tasks = ttk.Button(btn_box, text="⚡ 最初からやり直す (全リセット)", command=self._regenerate_tasks)
        self.btn_regen_tasks.pack(side=tk.LEFT, padx=(0, 6))

        self.btn_revert_tasks = ttk.Button(btn_box, text="↺ 全て再計算", command=self._revert_all_tasks)
        self.btn_revert_tasks.pack(side=tk.LEFT)

        # 右側: 統計進捗カード
        stats_frame = ttk.LabelFrame(mid_frame, text=" 計算進捗サマリー ", padding=10)
        stats_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=(5, 0))

        # 進捗バー
        pbar_box = ttk.Frame(stats_frame)
        pbar_box.pack(fill=tk.X, pady=(0, 6))

        self.progress_var = tk.DoubleVar(value=0.0)
        self.progressbar = ttk.Progressbar(pbar_box, variable=self.progress_var, maximum=100.0)
        self.progressbar.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 8))

        self.lbl_progress_percent = ttk.Label(pbar_box, text="0.0 %", font=("Segoe UI", 10, "bold"), width=7)
        self.lbl_progress_percent.pack(side=tk.RIGHT)

        # 数字バッジ
        badge_box = ttk.Frame(stats_frame)
        badge_box.pack(fill=tk.X)

        self.lbl_stat_completed = ttk.Label(badge_box, text="完了: 0", foreground="#059669", font=("Segoe UI", 9, "bold"))
        self.lbl_stat_completed.pack(side=tk.LEFT, padx=(0, 10))

        self.lbl_stat_running = ttk.Label(badge_box, text="実行中: 0", foreground="#0284c7", font=("Segoe UI", 9))
        self.lbl_stat_running.pack(side=tk.LEFT, padx=(0, 10))

        self.lbl_stat_pending = ttk.Label(badge_box, text="未処理: 0", foreground="#d97706", font=("Segoe UI", 9))
        self.lbl_stat_pending.pack(side=tk.LEFT, padx=(0, 10))

        self.lbl_stat_solutions = ttk.Label(badge_box, text="発見解数: 0", foreground="#4338ca", font=("Segoe UI", 9, "bold"))
        self.lbl_stat_solutions.pack(side=tk.RIGHT)

        # 3. 接続中ワーカー一覧 (Treeview & 操作コントロール)
        worker_frame = ttk.LabelFrame(main_frame, text=" 接続中のワーカーPC (最大22台) & 計算開始指示 ", padding=8)
        worker_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 10))

        # ワーカー操作コントロールバー
        w_ctl_bar = ttk.Frame(worker_frame)
        w_ctl_bar.pack(fill=tk.X, pady=(0, 6))

        # 1. 一括操作ボタン
        self.btn_start_all_workers = tk.Button(
            w_ctl_bar, text="▶ 全ワーカー一括開始", font=("Segoe UI", 10, "bold"),
            bg="#16a34a", fg="white", activebackground="#15803d", activeforeground="white",
            padx=12, pady=4, cursor="hand2", relief="raised", command=self._start_all_workers_cmd
        )
        self.btn_start_all_workers.pack(side=tk.LEFT, padx=(0, 6))

        self.btn_pause_all_workers = tk.Button(
            w_ctl_bar, text="⏸ 全ワーカー一時停止", font=("Segoe UI", 9),
            bg="#f1f5f9", fg="#334155", activebackground="#e2e8f0",
            padx=10, pady=4, cursor="hand2", relief="groove", command=self._pause_all_workers_cmd
        )
        self.btn_pause_all_workers.pack(side=tk.LEFT, padx=(0, 14))

        # 2. 個別指定操作系
        sep = ttk.Separator(w_ctl_bar, orient=tk.VERTICAL)
        sep.pack(side=tk.LEFT, fill=tk.Y, padx=6)

        ttk.Label(w_ctl_bar, text="指定ワーカー:").pack(side=tk.LEFT, padx=(4, 4))
        self.cbo_worker_target = ttk.Combobox(w_ctl_bar, width=10, state="readonly")
        self.cbo_worker_target.pack(side=tk.LEFT, padx=(0, 6))

        self.btn_start_selected_worker = tk.Button(
            w_ctl_bar, text="▶ 指定ワーカーを開始", font=("Segoe UI", 10, "bold"),
            bg="#0284c7", fg="white", activebackground="#0369a1", activeforeground="white",
            padx=10, pady=4, cursor="hand2", relief="raised", command=self._start_selected_worker_cmd
        )
        self.btn_start_selected_worker.pack(side=tk.LEFT, padx=(0, 6))

        self.btn_pause_selected_worker = tk.Button(
            w_ctl_bar, text="⏸ 指定ワーカーを一時停止", font=("Segoe UI", 9),
            bg="#f1f5f9", fg="#334155", activebackground="#e2e8f0",
            padx=8, pady=4, cursor="hand2", relief="groove", command=self._pause_selected_worker_cmd
        )
        self.btn_pause_selected_worker.pack(side=tk.LEFT)

        # テーブルコンテナ
        tree_container = ttk.Frame(worker_frame)
        tree_container.pack(fill=tk.BOTH, expand=True)

        columns = ("worker_id", "status", "ip", "task_range", "last_hb", "completed")
        self.tree_workers = ttk.Treeview(tree_container, columns=columns, show="headings", height=5)

        self.tree_workers.heading("worker_id", text="ワーカーID")
        self.tree_workers.heading("status", text="状態")
        self.tree_workers.heading("ip", text="IPアドレス")
        self.tree_workers.heading("task_range", text="現在担当の計算範囲")
        self.tree_workers.heading("last_hb", text="最終生存確認")
        self.tree_workers.heading("completed", text="完了タスク数")

        self.tree_workers.column("worker_id", width=90, anchor=tk.CENTER)
        self.tree_workers.column("status", width=130, anchor=tk.CENTER)
        self.tree_workers.column("ip", width=120, anchor=tk.CENTER)
        self.tree_workers.column("task_range", width=180, anchor=tk.CENTER)
        self.tree_workers.column("last_hb", width=100, anchor=tk.CENTER)
        self.tree_workers.column("completed", width=90, anchor=tk.CENTER)

        tree_scroll = ttk.Scrollbar(tree_container, orient=tk.VERTICAL, command=self.tree_workers.yview)
        self.tree_workers.configure(yscrollcommand=tree_scroll.set)

        self.tree_workers.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        tree_scroll.pack(side=tk.RIGHT, fill=tk.Y)

        self.tree_workers.bind("<<TreeviewSelect>>", self._on_tree_select)
        self.tree_workers.bind("<Button-3>", self._show_context_menu)

        self.context_menu = tk.Menu(self.root, tearoff=0)
        self.context_menu.add_command(label="▶ このワーカーの計算を開始", command=self._start_selected_worker_cmd)
        self.context_menu.add_command(label="⏸ このワーカーを一時停止", command=self._pause_selected_worker_cmd)
        self.context_menu.add_separator()
        self.context_menu.add_command(label="▶ 全ワーカーを一括開始", command=self._start_all_workers_cmd)
        self.context_menu.add_command(label="⏸ 全ワーカーを一括一時停止", command=self._pause_all_workers_cmd)

        # 4. リアルタイムログエリア
        log_frame = ttk.LabelFrame(main_frame, text=" サーバーリアルタイム動作ログ ", padding=6)
        log_frame.pack(fill=tk.BOTH, expand=True)

        self.log_text = scrolledtext.ScrolledText(
            log_frame, wrap=tk.WORD, font=("Consolas", 9),
            bg="#0f172a", fg="#f8fafc", state='disabled', height=8
        )
        self.log_text.pack(fill=tk.BOTH, expand=True)

        log_btn_bar = ttk.Frame(log_frame)
        log_btn_bar.pack(fill=tk.X, pady=(4, 0))

        btn_clear_log = ttk.Button(log_btn_bar, text="ログ消去", command=self._clear_log)
        btn_clear_log.pack(side=tk.LEFT)

        btn_backup = ttk.Button(log_btn_bar, text="💾 tasks.dbをバックアップ", command=self._backup_database)
        btn_backup.pack(side=tk.LEFT, padx=(8, 0))

        btn_open_backup = ttk.Button(log_btn_bar, text="📂 バックアップ先を開く", command=self._open_backups_dir)
        btn_open_backup.pack(side=tk.LEFT, padx=(4, 0))

        btn_open_results = ttk.Button(log_btn_bar, text="📁 結果保存フォルダを開く", command=self._open_results_dir)
        btn_open_results.pack(side=tk.RIGHT)

        btn_plot_graph = ttk.Button(log_btn_bar, text="📊 処理時間グラフ作成", command=self._plot_benchmark)
        btn_plot_graph.pack(side=tk.RIGHT, padx=(0, 6))

    def _setup_logging(self):
        """Python logging を ScrolledText に接続"""
        text_handler = TextHandler(self.log_text, self.root)
        text_handler.setFormatter(logging.Formatter("[%(asctime)s] %(message)s", datefmt="%H:%M:%S"))
        logger = logging.getLogger("ParallelServer")
        logger.addHandler(text_handler)

    def _copy_ip(self):
        self.root.clipboard_clear()
        self.root.clipboard_append(self.primary_ip)
        messagebox.showinfo("コピー完了", f"親サーバーのIPアドレス [{self.primary_ip}] をクリップボードにコピーしました。\nワーカーPCに入力してください。")

    def _toggle_server(self):
        if not self.is_running:
            # サーバー開始
            try:
                self.server = DistributedServer(CONFIG_FILE)
                self.server_thread = threading.Thread(target=self.server.start, daemon=True)
                self.server_thread.start()
                self.is_running = True

                self.status_badge.config(
                    text=f"● 稼働中 (ポート 5000)", bg="#dcfce7", fg="#15803d"
                )
                self.btn_toggle_server.config(
                    text="⏹ サーバー停止", bg="#ef4444", activebackground="#dc2626"
                )
            except Exception as e:
                messagebox.showerror("起動エラー", f"サーバー起動に失敗しました:\n{e}")
        else:
            # サーバー停止
            if messagebox.askyesno("確認", "親サーバーを停止しますか？\n接続中のワーカーとの通信が切断されます。"):
                if self.server:
                    self.server.stop()
                self.is_running = False
                self.status_badge.config(
                    text="● 停止中", bg="#f1f5f9", fg="#64748b"
                )
                self.btn_toggle_server.config(
                    text="▶ サーバー起動", bg="#10b981", activebackground="#059669"
                )

    def _auto_fill_next_range(self):
        """現在の最大endを取得し、続きの範囲（例: 5001〜10000）を自動入力"""
        try:
            task_mgr = self.server.task_mgr if (self.server and self.server.task_mgr) else TaskManager(DATA_DIR / "tasks.db")
            _, max_end = task_mgr.get_max_range()
            next_start = max_end + 1 if max_end > 0 else 1
            span = 5000
            try:
                cur_s = int(self.entry_start.get().strip())
                cur_e = int(self.entry_end.get().strip())
                if cur_e > cur_s:
                    span = cur_e - cur_s + 1
            except Exception:
                pass
            next_end = next_start + span - 1

            self.entry_start.delete(0, tk.END)
            self.entry_start.insert(0, str(next_start))
            self.entry_end.delete(0, tk.END)
            self.entry_end.insert(0, str(next_end))
        except Exception:
            pass

    def _append_next_tasks(self):
        """既存タスクを消さずに、続きのタスクを追加登録する"""
        try:
            start_n = int(self.entry_start.get().strip())
            end_n = int(self.entry_end.get().strip())
            chunk = int(self.entry_chunk.get().strip())
            if chunk <= 0:
                raise ValueError("分割単位は1以上にしてください。")
        except ValueError as e:
            messagebox.showerror("入力エラー", f"数値が正しくありません:\n{e}")
            return

        task_mgr = self.server.task_mgr if (self.server and self.server.task_mgr) else TaskManager(DATA_DIR / "tasks.db")
        _, max_end = task_mgr.get_max_range()

        # 開始値が既存end以下の場合は自動でmax_end+1に補正
        if start_n <= max_end:
            start_n = max_end + 1
            self.entry_start.delete(0, tk.END)
            self.entry_start.insert(0, str(start_n))

        if end_n < start_n:
            messagebox.showerror("範囲エラー", f"終了値 ({end_n}) は開始値 ({start_n}) 以上にしてください。")
            return

        cnt = task_mgr.append_tasks(start_n, end_n, chunk)
        if cnt > 0:
            messagebox.showinfo(
                "続きのタスク追加完了",
                f"新しく {cnt} 件のタスク (n={start_n} 〜 {end_n}) を追加登録しました！\n"
                f"待機中（WAIT）のワーカーが自動検知して計算を再開します。"
            )
            # 次回用に入力欄を自動更新
            self._auto_fill_next_range()
        else:
            messagebox.showwarning("警告", "追加できるタスクがありませんでした。")

    def _regenerate_tasks(self):
        try:
            start_n = int(self.entry_start.get().strip())
            end_n = int(self.entry_end.get().strip())
            chunk = int(self.entry_chunk.get().strip())
            if start_n <= 0 or end_n < start_n or chunk <= 0:
                raise ValueError("正当な数値を入力してください。")
        except ValueError as e:
            messagebox.showerror("入力エラー", f"数値が正しくありません:\n{e}")
            return

        confirm = messagebox.askyesno(
            "タスク全リセットの確認",
            f"計算範囲 [{start_n} 〜 {end_n}] (分割単位: {chunk}) で最初からやり直しますか？\n"
            f"※ 以前の tasks.db の進行状況はすべて消去されます。\n\n"
            f"続きを計算したい場合は「キャンセル」を押し、【➕ 続きのタスクを追加】を使ってください。"
        )
        if not confirm:
            return

        # 一時的な TaskManager でリセット
        task_mgr = self.server.task_mgr if (self.server and self.server.task_mgr) else TaskManager(DATA_DIR / "tasks.db")
        created = task_mgr.reset_and_generate_tasks(start_n, end_n, chunk)
        messagebox.showinfo("タスク初期化完了", f"新しく {created} 件のタスクを生成しました！\nワーカーが接続次第、自動的に割り振られます。")

    def _revert_all_tasks(self):
        confirm = messagebox.askyesno("確認", "すべてのタスクを未完了(PENDING)に戻して最初から計算し直しますか？")
        if confirm:
            task_mgr = self.server.task_mgr if (self.server and self.server.task_mgr) else TaskManager(DATA_DIR / "tasks.db")
            cnt = task_mgr.revert_all_to_pending()
            messagebox.showinfo("リセット完了", f"{cnt} 件のタスクを PENDING にリセットしました。")

    def _update_ui_loop(self):
        """1秒ごとに実行されるUIリフレッシュ"""
        try:
            db_path = DATA_DIR / "tasks.db"
            if db_path.exists():
                task_mgr = self.server.task_mgr if (self.server and self.server.task_mgr) else TaskManager(db_path)
                stats = task_mgr.get_stats()
                pending = stats.get("PENDING", 0)
                running = stats.get("RUNNING", 0)
                completed = stats.get("COMPLETED", 0)
                total = pending + running + completed
                solutions = stats.get("TOTAL_SOLUTIONS", 0)

                _, max_end = task_mgr.get_max_range()
                if max_end > 0:
                    self.lbl_current_range.config(text=f"現在登録中の全体範囲: [ 1 〜 {max_end:,} ] (計 {total} タスク)")
                else:
                    self.lbl_current_range.config(text="現在登録されているタスクはありません")

                self.lbl_stat_completed.config(text=f"完了: {completed} / {total}")
                self.lbl_stat_running.config(text=f"実行中: {running}")
                self.lbl_stat_pending.config(text=f"未処理: {pending}")
                self.lbl_stat_solutions.config(text=f"発見解数: {solutions:,}")

                if total > 0:
                    pct = round((completed / total) * 100, 1)
                    self.progress_var.set(pct)
                    self.lbl_progress_percent.config(text=f"{pct:.1f} %")
                else:
                    self.progress_var.set(0)
                    self.lbl_progress_percent.config(text="0.0 %")

            # ワーカーテーブル更新
            if self.server:
                now = time.time()
                workers_data = []
                active_ids = []
                with self.server.workers_lock:
                    for w_id, w_info in self.server.workers.items():
                        diff = round(now - w_info.get("last_heartbeat", now), 1)
                        raw_status = w_info.get("status", "CONNECTED")
                        if raw_status != "DISCONNECTED":
                            active_ids.append(w_id)

                        # ユーザーフレンドリーな状態テキスト
                        if raw_status == "STANDBY":
                            display_status = "待機中 (指示待ち)"
                        elif raw_status == "RUNNING":
                            display_status = "計算実行中"
                        elif raw_status == "WAITING":
                            display_status = "待機中 (タスク待ち)"
                        elif raw_status == "CONNECTED":
                            display_status = "接続完了"
                        else:
                            display_status = "切断"

                        task_id = w_info.get("task_id")
                        trange = f"task_{task_id} ({w_info.get('task_range', '')})" if task_id else w_info.get('task_range', '待機中')
                        workers_data.append((
                            w_id,
                            display_status,
                            w_info.get("address", ""),
                            trange,
                            f"{diff}秒前",
                            w_info.get("completed_count", 0)
                        ))

                # Combobox の選択肢をアクティブなワーカーで同期
                active_sorted = sorted(active_ids)
                if list(self.cbo_worker_target["values"]) != active_sorted:
                    current_sel = self.cbo_worker_target.get()
                    self.cbo_worker_target["values"] = active_sorted
                    if current_sel in active_sorted:
                        self.cbo_worker_target.set(current_sel)
                    elif active_sorted:
                        self.cbo_worker_target.set(active_sorted[0])
                    else:
                        self.cbo_worker_target.set("")

                # 選択中のアイテムIDを記憶
                selected_ids = [self.tree_workers.item(i)["values"][0] for i in self.tree_workers.selection() if self.tree_workers.item(i).get("values")]

                # Treeview を一度クリアして再描画
                for item in self.tree_workers.get_children():
                    self.tree_workers.delete(item)

                for row in sorted(workers_data, key=lambda x: x[0]):
                    item_id = self.tree_workers.insert("", tk.END, values=row)
                    if selected_ids and row[0] in selected_ids:
                        self.tree_workers.selection_set(item_id)

        except Exception:
            pass

        self.root.after(1000, self._update_ui_loop)

    def _on_tree_select(self, event):
        selected = self.tree_workers.selection()
        if selected:
            item = self.tree_workers.item(selected[0])
            vals = item.get("values", [])
            if vals:
                self.cbo_worker_target.set(vals[0])

    def _show_context_menu(self, event):
        item = self.tree_workers.identify_row(event.y)
        if item:
            self.tree_workers.selection_set(item)
            vals = self.tree_workers.item(item).get("values", [])
            if vals:
                w_id = vals[0]
                self.cbo_worker_target.set(w_id)
                self.context_menu.entryconfigure(0, label=f"▶ [{w_id}] の計算を開始")
                self.context_menu.entryconfigure(1, label=f"⏸ [{w_id}] を一時停止")
        try:
            self.context_menu.tk_popup(event.x_root, event.y_root)
        finally:
            self.context_menu.grab_release()

    def _start_all_workers_cmd(self):
        if not self.server or not self.is_running:
            messagebox.showwarning("案内", "親サーバーが起動していません。")
            return
        n = self.server.start_all_workers()
        if n == 0:
            messagebox.showinfo("案内", "接続中の待機ワーカーがいません。\nワーカーPCが接続されるのをお待ちください。")

    def _pause_all_workers_cmd(self):
        if not self.server or not self.is_running:
            return
        self.server.pause_all_workers()

    def _start_selected_worker_cmd(self):
        if not self.server or not self.is_running:
            messagebox.showwarning("案内", "親サーバーが起動していません。")
            return
        target = self.cbo_worker_target.get().strip()
        if not target:
            messagebox.showinfo("選択", "対象のワーカーを一覧またはテーブルから選択してください。")
            return
        ok = self.server.start_worker(target)
        if not ok:
            messagebox.showwarning("警告", f"ワーカー {target} を開始できませんでした（未接続または切断中）。")

    def _pause_selected_worker_cmd(self):
        if not self.server or not self.is_running:
            return
        target = self.cbo_worker_target.get().strip()
        if target:
            self.server.pause_worker(target)

    def _clear_log(self):
        self.log_text.configure(state='normal')
        self.log_text.delete('1.0', tk.END)
        self.log_text.configure(state='disabled')

    def _backup_database(self):
        """tasks.db を安全にバックアップ保存する"""
        try:
            db_path = DATA_DIR / "tasks.db"
            if not db_path.exists():
                messagebox.showwarning("警告", "tasks.db がまだ作成されていません。")
                return

            task_mgr = self.server.task_mgr if (self.server and self.server.task_mgr) else TaskManager(db_path)
            backup_path = task_mgr.backup_database()
            messagebox.showinfo(
                "バックアップ完了",
                f"tasks.db のバックアップを保存しました！\n\nファイル名:\n{backup_path.name}\n\n保存先:\n{backup_path.parent}"
            )
        except Exception as e:
            messagebox.showerror("バックアップ失敗", f"バックアップ中にエラーが発生しました:\n{e}")

    def _open_backups_dir(self):
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        if sys.platform == "win32":
            os.startfile(str(BACKUP_DIR))
        elif sys.platform == "darwin":
            os.system(f'open "{BACKUP_DIR}"')
        else:
            os.system(f'xdg-open "{BACKUP_DIR}"')

    def _plot_benchmark(self):
        """results/ フォルダのデータから処理時間グラフを作成"""
        try:
            plot_script = BASE_DIR / "plot_benchmark.py"
            if not plot_script.exists():
                messagebox.showerror("エラー", "plot_benchmark.py が見つかりません。")
                return

            import subprocess
            subprocess.Popen([sys.executable, str(plot_script)], cwd=str(BASE_DIR))
        except Exception as e:
            messagebox.showerror("グラフ生成失敗", f"グラフ起動中にエラーが発生しました:\n{e}")

    def _open_results_dir(self):
        RESULTS_DIR.mkdir(exist_ok=True)
        if sys.platform == "win32":
            os.startfile(str(RESULTS_DIR))
        elif sys.platform == "darwin":
            os.system(f'open "{RESULTS_DIR}"')
        else:
            os.system(f'xdg-open "{RESULTS_DIR}"')

    def _on_close(self):
        if self.is_running:
            if messagebox.askyesno("終了確認", "親サーバーが稼働中です。終了しますか？"):
                if self.server:
                    self.server.stop()
                self.root.destroy()
        else:
            self.root.destroy()


def main():
    root = tk.Tk()
    app = ServerGUI(root)
    root.mainloop()


if __name__ == "__main__":
    main()
