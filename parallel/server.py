#!/usr/bin/env python3
"""
server.py - LAN分散計算システム 親サーバー
LAN Distributed Computing System - Parent Server

仕様書準拠:
- 1台の親サーバーで最大22台(設定可能)のワーカーPCを管理
- TCPソケット (デフォルト 0.0.0.0:5000)
- 1行ごとのJSONメッセージ送受信
- 動的タスク割り当て (PENDING -> RUNNING -> COMPLETED)
- 5秒heartbeat受信 & 30秒タイムアウト監視
- ワーカー異常終了時のタスク再割り当て (RUNNING -> PENDING)
- SQLite (data/tasks.db) による状態永続化とサーバー再起動時リカバリ
- data/results/ へのタスク別詳細結果JSON保存
- logs/server.log へのログ出力と仕様書通りのステータス表示
"""

import argparse
import json
import logging
import os
import socket
import sqlite3
import sys
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, Any

# パス設定
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
RESULTS_DIR = DATA_DIR / "results"
LOGS_DIR = BASE_DIR / "logs"
CONFIG_FILE = BASE_DIR / "config.json"

DATA_DIR.mkdir(exist_ok=True)
RESULTS_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)

# ログ設定
logger = logging.getLogger("ParallelServer")
logger.setLevel(logging.INFO)

# コンソールハンドラとファイルハンドラ
log_format = logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
file_handler = logging.FileHandler(LOGS_DIR / "server.log", encoding="utf-8")
file_handler.setFormatter(log_format)
stream_handler = logging.StreamHandler(sys.stdout)
stream_handler.setFormatter(log_format)

logger.addHandler(file_handler)
logger.addHandler(stream_handler)


class TaskManager:
    """SQLite を使用したタスク永続化およびインメモリ管理"""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self.lock = threading.Lock()
        self.init_db()

    def get_connection(self):
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self):
        with self.lock:
            conn = self.get_connection()
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS tasks (
                    task_id INTEGER PRIMARY KEY,
                    start INTEGER NOT NULL,
                    end INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    worker_id TEXT,
                    assigned_at REAL,
                    completed_at REAL,
                    duration REAL,
                    total_solutions INTEGER DEFAULT 0,
                    result_summary TEXT
                )
            """)
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
            """)

            # 仕様書 第17項: サーバー起動時に RUNNING だったタスクを PENDING に戻す
            cursor.execute("""
                UPDATE tasks
                SET status = 'PENDING', worker_id = NULL, assigned_at = NULL
                WHERE status = 'RUNNING'
            """)
            recovered = cursor.rowcount
            conn.commit()
            conn.close()

            if recovered > 0:
                logger.info(f"【再起動リカバリ】未完了(RUNNING)だったタスク {recovered} 件を PENDING に戻しました。")

    def count_tasks(self) -> int:
        with self.lock:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM tasks")
            count = cur.fetchone()[0]
            conn.close()
            return count

    def generate_tasks_if_empty(self, start_range: int, end_range: int, chunk_size: int):
        with self.lock:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) FROM tasks")
            if cur.fetchone()[0] == 0:
                logger.info(f"新規タスク生成開始: 範囲 [{start_range} - {end_range}], チャンクサイズ {chunk_size}")
                task_id = 1
                curr = start_range
                items = []
                while curr <= end_range:
                    c_end = min(curr + chunk_size - 1, end_range)
                    items.append((task_id, curr, c_end, "PENDING"))
                    task_id += 1
                    curr = c_end + 1

                cur.executemany(
                    "INSERT INTO tasks (task_id, start, end, status) VALUES (?, ?, ?, ?)",
                    items
                )
                conn.commit()
                logger.info(f"新規タスク {len(items)} 件を登録しました (task_id: 1 〜 {len(items)})。")
            conn.close()

    def get_max_range(self) -> tuple:
        """現在のタスクの最大 task_id と最大 end を取得"""
        with self.lock:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("SELECT MAX(task_id), MAX(end) FROM tasks")
            row = cur.fetchone()
            conn.close()
            max_id = row[0] if (row and row[0] is not None) else 0
            max_end = row[1] if (row and row[1] is not None) else 0
            return (max_id, max_end)

    def append_tasks(self, start_range: int, end_range: int, chunk_size: int) -> int:
        """既存タスクを消さずに、続きのタスクを追加登録する"""
        with self.lock:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("SELECT MAX(task_id), MAX(end) FROM tasks")
            row = cur.fetchone()
            max_id = row[0] if (row and row[0] is not None) else 0
            max_end = row[1] if (row and row[1] is not None) else 0

            # 開始値が指定されていないか既存end以下の場合は自動で続きから
            if start_range <= max_end:
                start_range = max_end + 1

            if start_range > end_range:
                conn.close()
                return 0

            logger.info(f"続きのタスク追加開始: 範囲 [{start_range} - {end_range}], チャンク {chunk_size} (開始task_id: {max_id + 1})")
            task_id = max_id + 1
            curr = start_range
            items = []
            while curr <= end_range:
                c_end = min(curr + chunk_size - 1, end_range)
                items.append((task_id, curr, c_end, "PENDING"))
                task_id += 1
                curr = c_end + 1

            cur.executemany(
                "INSERT INTO tasks (task_id, start, end, status) VALUES (?, ?, ?, ?)",
                items
            )
            conn.commit()
            conn.close()
            logger.info(f"続きのタスク {len(items)} 件を追加登録しました (task_id: {max_id + 1} 〜 {task_id - 1})。")
            return len(items)

    def reset_and_generate_tasks(self, start_range: int, end_range: int, chunk_size: int) -> int:
        with self.lock:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("DELETE FROM tasks")
            logger.info(f"タスクリセット: 範囲 [{start_range} - {end_range}], チャンクサイズ {chunk_size}")
            task_id = 1
            curr = start_range
            items = []
            while curr <= end_range:
                c_end = min(curr + chunk_size - 1, end_range)
                items.append((task_id, curr, c_end, "PENDING"))
                task_id += 1
                curr = c_end + 1
            cur.executemany(
                "INSERT INTO tasks (task_id, start, end, status) VALUES (?, ?, ?, ?)",
                items
            )
            conn.commit()
            conn.close()
            logger.info(f"新規タスク {len(items)} 件を登録しました。")
            return len(items)

    def revert_all_to_pending(self) -> int:
        with self.lock:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("UPDATE tasks SET status = 'PENDING', worker_id = NULL, assigned_at = NULL, completed_at = NULL, duration = NULL, total_solutions = 0, result_summary = NULL")
            count = cur.rowcount
            conn.commit()
            conn.close()
            logger.info(f"全タスク {count} 件を PENDING にリセットしました。")
            return count

    def get_pending_task(self, worker_id: str) -> Optional[Dict[str, Any]]:
        """PENDINGのタスクを1つ取得し、RUNNINGに変更してワーカーに割り当てる"""
        with self.lock:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("""
                SELECT task_id, start, end FROM tasks
                WHERE status = 'PENDING'
                ORDER BY task_id ASC
                LIMIT 1
            """)
            row = cur.fetchone()
            if not row:
                conn.close()
                return None

            task_id = row["task_id"]
            now = time.time()
            cur.execute("""
                UPDATE tasks
                SET status = 'RUNNING', worker_id = ?, assigned_at = ?
                WHERE task_id = ?
            """, (worker_id, now, task_id))
            conn.commit()
            conn.close()

            return {
                "task_id": task_id,
                "start": row["start"],
                "end": row["end"]
            }

    def complete_task(self, task_id: int, worker_id: str, result: Dict[str, Any]) -> bool:
        """タスクを完了状態にし、結果を記録する"""
        with self.lock:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("SELECT assigned_at, status FROM tasks WHERE task_id = ?", (task_id,))
            row = cur.fetchone()
            if not row:
                conn.close()
                logger.warning(f"存在しない task_id {task_id} の完了通知を受信しました。")
                return False

            assigned_at = row["assigned_at"]
            now = time.time()
            duration = (now - assigned_at) if assigned_at else 0.0

            total_solutions = result.get("total_solutions", 0)
            summary_str = json.dumps({
                "worker_id": worker_id,
                "total_solutions": total_solutions,
                "processed_count": result.get("count", 0),
                "duration_sec": result.get("duration_sec", duration)
            }, ensure_ascii=False)

            cur.execute("""
                UPDATE tasks
                SET status = 'COMPLETED', completed_at = ?, duration = ?, total_solutions = ?, result_summary = ?
                WHERE task_id = ?
            """, (now, duration, total_solutions, summary_str, task_id))
            conn.commit()
            conn.close()

            # 結果詳細ファイル保存
            result_file = RESULTS_DIR / f"task_{task_id}.json"
            try:
                with open(result_file, "w", encoding="utf-8") as f:
                    json.dump({
                        "task_id": task_id,
                        "worker_id": worker_id,
                        "completed_at": datetime.fromtimestamp(now).isoformat(),
                        "duration": duration,
                        "result": result
                    }, f, indent=2, ensure_ascii=False)
            except Exception as e:
                logger.error(f"結果ファイル保存失敗 (task_id {task_id}): {e}")

            return True

    def revert_worker_task(self, worker_id: str) -> Optional[int]:
        """指定ワーカーが処理中(RUNNING)のタスクを PENDING に戻す (異常終了時)"""
        with self.lock:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("""
                SELECT task_id FROM tasks
                WHERE worker_id = ? AND status = 'RUNNING'
            """, (worker_id,))
            row = cur.fetchone()
            if row:
                task_id = row["task_id"]
                cur.execute("""
                    UPDATE tasks
                    SET status = 'PENDING', worker_id = NULL, assigned_at = NULL
                    WHERE task_id = ?
                """, (task_id,))
                conn.commit()
                conn.close()
                return task_id
            conn.close()
            return None

    def get_stats(self) -> Dict[str, int]:
        with self.lock:
            conn = self.get_connection()
            cur = conn.cursor()
            cur.execute("""
                SELECT status, COUNT(*) as count FROM tasks GROUP BY status
            """)
            counts = {"PENDING": 0, "RUNNING": 0, "COMPLETED": 0}
            for row in cur.fetchall():
                st = row["status"]
                if st in counts:
                    counts[st] = row["count"]

            cur.execute("SELECT SUM(total_solutions) FROM tasks WHERE status = 'COMPLETED'")
            sum_res = cur.fetchone()[0]
            conn.close()
            counts["TOTAL_SOLUTIONS"] = sum_res if sum_res else 0
            return counts


class DistributedServer:
    def __init__(self, config_path: Path):
        self.config = self.load_config(config_path)
        server_cfg = self.config.get("server", {})
        self.host = server_cfg.get("host", "0.0.0.0")
        self.port = int(server_cfg.get("port", 5000))
        self.heartbeat_timeout = float(server_cfg.get("heartbeat_timeout", 30))
        self.status_interval = float(server_cfg.get("status_interval", 5))

        tasks_cfg = self.config.get("tasks", {})
        self.range_start = int(tasks_cfg.get("range_start", 1))
        self.range_end = int(tasks_cfg.get("range_end", 10000))
        self.chunk_size = int(tasks_cfg.get("chunk_size", 100))

        self.db_path = DATA_DIR / "tasks.db"
        self.task_mgr = TaskManager(self.db_path)
        self.task_mgr.generate_tasks_if_empty(self.range_start, self.range_end, self.chunk_size)

        # ワーカー管理辞書: worker_id -> info
        # {"worker_id": str, "address": str, "status": str, "task_id": Optional[int], "task_range": str, "last_heartbeat": float, "conn": socket}
        self.workers: Dict[str, Dict[str, Any]] = {}
        self.workers_lock = threading.Lock()

        self.running = False
        self.server_socket: Optional[socket.socket] = None
        self.start_time = time.time()

    def load_config(self, path: Path) -> dict:
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"設定ファイル読み込みエラー: {e}")
        return {}

    def start(self):
        self.running = True
        self.start_time = time.time()

        # ソケットバインド
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server_socket.bind((self.host, self.port))
        self.server_socket.listen(32)
        logger.info(f"=== LAN 分散計算 親サーバー 起動 ===")
        logger.info(f"TCP リスニング: {self.host}:{self.port}")
        logger.info(f"最大想定ワーカー: 22台 (Heartbeatタイムアウト: {self.heartbeat_timeout}秒)")

        # バックグラウンド監視スレッド開始
        threading.Thread(target=self._heartbeat_monitor_loop, daemon=True).start()
        threading.Thread(target=self._status_display_loop, daemon=True).start()

        # ワーカー接続待機ループ
        try:
            while self.running:
                try:
                    client_sock, client_addr = self.server_socket.accept()
                    t = threading.Thread(
                        target=self._handle_client,
                        args=(client_sock, client_addr),
                        daemon=True
                    )
                    t.start()
                except socket.timeout:
                    continue
                except OSError:
                    break
        except KeyboardInterrupt:
            logger.info("サーバー終了シグナルを受信しました。")
        finally:
            self.stop()

    def stop(self):
        self.running = False
        if self.server_socket:
            try:
                self.server_socket.close()
            except Exception:
                pass
        logger.info("サーバーを停止しました。")

    def _handle_client(self, client_sock: socket.socket, client_addr: tuple):
        """1つのワーカー接続を処理するスレッド"""
        worker_ip = client_addr[0]
        worker_id: Optional[str] = None
        sock_file = client_sock.makefile("r", encoding="utf-8")

        try:
            while self.running:
                line = sock_file.readline()
                if not line:
                    break  # 接続切断

                line = line.strip()
                if not line:
                    continue

                try:
                    msg = json.loads(line)
                except json.JSONDecodeError:
                    logger.warning(f"不正なJSONメッセージを受信 ({worker_ip}): {line}")
                    continue

                msg_type = msg.get("type")

                # 12.1 REGISTER
                if msg_type == "register":
                    worker_id = msg.get("worker_id", f"PC_{worker_ip}")
                    with self.workers_lock:
                        self.workers[worker_id] = {
                            "worker_id": worker_id,
                            "address": worker_ip,
                            "status": "CONNECTED",
                            "task_id": None,
                            "task_range": "-",
                            "last_heartbeat": time.time(),
                            "conn": client_sock,
                            "completed_count": self.workers.get(worker_id, {}).get("completed_count", 0)
                        }
                    logger.info(f"[REGISTER] ワーカー登録: {worker_id} ({worker_ip})")

                    # 直ちにタスク割り当てを試みる
                    self._assign_next_task(client_sock, worker_id)

                # 12.4 HEARTBEAT
                elif msg_type == "heartbeat":
                    if worker_id:
                        with self.workers_lock:
                            if worker_id in self.workers:
                                self.workers[worker_id]["last_heartbeat"] = time.time()
                        # 12.5 HEARTBEAT_ACK 返信
                        self._send_json(client_sock, {"type": "heartbeat_ack"})

                # 12.3 DONE
                elif msg_type == "done":
                    task_id = msg.get("task_id")
                    result = msg.get("result", {})
                    if task_id is not None and worker_id:
                        # タスク完了記録
                        self.task_mgr.complete_task(task_id, worker_id, result)
                        with self.workers_lock:
                            if worker_id in self.workers:
                                self.workers[worker_id]["status"] = "CONNECTED"
                                self.workers[worker_id]["task_id"] = None
                                self.workers[worker_id]["task_range"] = "-"
                                self.workers[worker_id]["completed_count"] = self.workers[worker_id].get("completed_count", 0) + 1

                        logger.info(f"[DONE] ワーカー {worker_id} が task_id {task_id} を完了 (解の総数: {result.get('total_solutions', 0)})")

                        # 次のタスクを自動割り当て
                        self._assign_next_task(client_sock, worker_id)

                # その他 (タスク要求など)
                elif msg_type == "get_task":
                    if worker_id:
                        self._assign_next_task(client_sock, worker_id)

        except (ConnectionResetError, BrokenPipeError, socket.error) as e:
            logger.warning(f"ワーカー {worker_id or worker_ip} との通信が切断されました: {e}")
        finally:
            try:
                sock_file.close()
                client_sock.close()
            except Exception:
                pass

            if worker_id:
                self._handle_worker_disconnect(worker_id)

    def _assign_next_task(self, client_sock: socket.socket, worker_id: str):
        """PENDINGタスクがあれば割り当て、なければ WAIT を送信"""
        task = self.task_mgr.get_pending_task(worker_id)
        if task:
            task_id = task["task_id"]
            start_val = task["start"]
            end_val = task["end"]
            task_range_str = f"{start_val} - {end_val}"

            with self.workers_lock:
                if worker_id in self.workers:
                    self.workers[worker_id]["status"] = "RUNNING"
                    self.workers[worker_id]["task_id"] = task_id
                    self.workers[worker_id]["task_range"] = task_range_str

            # 12.2 TASK メッセージ送信
            task_msg = {
                "type": "task",
                "task": {
                    "task_id": task_id,
                    "start": start_val,
                    "end": end_val
                }
            }
            self._send_json(client_sock, task_msg)
            logger.info(f"[TASK] ワーカー {worker_id} に task_id {task_id} ({task_range_str}) を割り当てました。")
        else:
            with self.workers_lock:
                if worker_id in self.workers:
                    self.workers[worker_id]["status"] = "WAITING"
                    self.workers[worker_id]["task_id"] = None
                    self.workers[worker_id]["task_range"] = "待機中"
            # 12.6 WAIT メッセージ送信
            self._send_json(client_sock, {"type": "wait"})

    def _send_json(self, sock: socket.socket, data: dict):
        try:
            line = json.dumps(data, ensure_ascii=False) + "\n"
            sock.sendall(line.encode("utf-8"))
        except Exception as e:
            logger.debug(f"JSON送信エラー: {e}")

    def _handle_worker_disconnect(self, worker_id: str):
        """ワーカー切断時の処理 (タスク再割り当て)"""
        with self.workers_lock:
            if worker_id in self.workers:
                self.workers[worker_id]["status"] = "DISCONNECTED"

        # 仕様書 第10項: 異常終了したワーカーが RUNNING で保持していたタスクを PENDING に戻す
        reverted_task_id = self.task_mgr.revert_worker_task(worker_id)
        if reverted_task_id:
            logger.warning(
                f"【タスク再割り当て】ワーカー {worker_id} 離脱に伴い、処理中だった task_id {reverted_task_id} を PENDING に復帰させました。"
            )

    def _heartbeat_monitor_loop(self):
        """第9項: 30秒間 heartbeat が届かないワーカーを異常終了として検出"""
        while self.running:
            time.sleep(2)
            now = time.time()
            timed_out_workers = []

            with self.workers_lock:
                for w_id, w_info in self.workers.items():
                    if w_info["status"] in ("CONNECTED", "RUNNING", "WAITING"):
                        elapsed = now - w_info["last_heartbeat"]
                        if elapsed > self.heartbeat_timeout:
                            timed_out_workers.append(w_id)

            for w_id in timed_out_workers:
                logger.warning(f"【タイムアウト検出】ワーカー {w_id} の heartbeat が {self.heartbeat_timeout}秒以上途絶えました。異常終了と判定します。")
                self._handle_worker_disconnect(w_id)

    def _status_display_loop(self):
        """第14項: 仕様書通りの SERVER STATUS を定期表示し、cluster_status.json を出力"""
        status_file = DATA_DIR / "cluster_status.json"

        while self.running:
            time.sleep(self.status_interval)
            stats = self.task_mgr.get_stats()
            pending = stats.get("PENDING", 0)
            running = stats.get("RUNNING", 0)
            completed = stats.get("COMPLETED", 0)
            total_solutions = stats.get("TOTAL_SOLUTIONS", 0)

            with self.workers_lock:
                worker_list = sorted(list(self.workers.values()), key=lambda x: x["worker_id"])
                active_workers = [w for w in worker_list if w["status"] != "DISCONNECTED"]

            # 仕様書 第14項 通りのフォーマット表示
            lines = []
            lines.append("========== SERVER STATUS ==========")
            lines.append(f"Pending   : {pending}")
            lines.append(f"Running   : {running}")
            lines.append(f"Completed : {completed}")
            lines.append(f"Workers   : {len(active_workers)}")
            lines.append("")
            if active_workers:
                for w in active_workers:
                    w_id = w["worker_id"]
                    t_range = w.get("task_range", "-")
                    w_status = w.get("status", "")
                    lines.append(f"{w_id:8s} : {t_range} [{w_status}]")
            else:
                lines.append("(接続中のワーカーはありません)")
            lines.append("===================================")

            status_text = "\n".join(lines)
            logger.info("\n" + status_text)

            # Webダッシュボードおよび外部連携用ステータスJSON更新
            status_payload = {
                "updated_at": datetime.now().isoformat(),
                "uptime_seconds": round(time.time() - self.start_time, 1),
                "tasks": {
                    "pending": pending,
                    "running": running,
                    "completed": completed,
                    "total": pending + running + completed,
                    "completion_rate": round((completed / max(1, pending + running + completed)) * 100, 2),
                    "total_solutions": total_solutions
                },
                "workers_count": len(active_workers),
                "workers": [
                    {
                        "worker_id": w["worker_id"],
                        "address": w["address"],
                        "status": w["status"],
                        "task_id": w["task_id"],
                        "task_range": w.get("task_range", "-"),
                        "last_heartbeat_ago": round(time.time() - w["last_heartbeat"], 1),
                        "completed_count": w.get("completed_count", 0)
                    }
                    for w in worker_list
                ]
            }

            try:
                with open(status_file, "w", encoding="utf-8") as f:
                    json.dump(status_payload, f, indent=2, ensure_ascii=False)
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(description="LAN 分散計算システム 親サーバー")
    parser.add_argument("--host", default="0.0.0.0", help="バインドIP (デフォルト: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=5000, help="TCPポート (デフォルト: 5000)")
    parser.add_argument("--config", default=str(CONFIG_FILE), help="設定ファイルパス")
    args = parser.parse_args()

    cfg_path = Path(args.config)
    server = DistributedServer(cfg_path)
    if args.host:
        server.host = args.host
    if args.port:
        server.port = args.port

    server.start()


if __name__ == "__main__":
    main()
