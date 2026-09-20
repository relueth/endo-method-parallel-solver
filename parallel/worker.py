#!/usr/bin/env python3
"""
worker.py - LAN分散計算システム ワーカープログラム
LAN Distributed Computing System - Worker Client

仕様書準拠:
- サーバー通信、heartbeat、タスク管理、数値計算 calculate() の完全分離 (第19項)
- オイラー関数 φ(x) = n の解を求める Endo_method を import して計算 (第19項 & ユーザー指定)
- 5秒ごとの heartbeat 送信 (第8項)
- ネットワーク切断時の自動再接続ループ (第18項)
- ワーカー状態遷移: DISCONNECTED -> CONNECTED -> RUNNING -> WAITING (第13項)
- logs/worker.log へのログ記録 (第20項)
"""

import argparse
import json
import logging
import socket
import sys
import threading
import time
from pathlib import Path
from typing import Dict, Any, Optional

# Endo_method の import (第19項 & ユーザー要求)
from Endo_method import phi_inverse, phi_inverse_count

BASE_DIR = Path(__file__).resolve().parent
LOGS_DIR = BASE_DIR / "logs"
CONFIG_FILE = BASE_DIR / "config.json"
LOGS_DIR.mkdir(exist_ok=True)

# ログ設定
logger = logging.getLogger("ParallelWorker")
logger.setLevel(logging.INFO)

log_format = logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
file_handler = logging.FileHandler(LOGS_DIR / "worker.log", encoding="utf-8")
file_handler.setFormatter(log_format)
stream_handler = logging.StreamHandler(sys.stdout)
stream_handler.setFormatter(log_format)

logger.addHandler(file_handler)
logger.addHandler(stream_handler)


# ==========================================
# 数値計算プログラム (第19項 分離原則)
# ==========================================
def calculate(start: int, end: int) -> Dict[str, Any]:
    """
    数値計算処理: オイラー関数の方程式 φ(x) = n の解の個数および解集合を求める。
    Endo_method.phi_inverse(n) を利用して [start, end] の全 n について解を求める。

    返り値の形式:
    {
        "start": start,
        "end": end,
        "count": 処理したnの個数,
        "total_solutions": 全解の総数 (∑ |φ^(-1)(n)|),
        "solvable_count": 解が存在したnの個数,
        "sample_solutions": {n: [x1, x2, ...]},
        "counts": {n: 個数},
        "duration_sec": 所要秒数
    }
    """
    t_start = time.time()
    total_solutions = 0
    solvable_count = 0
    sample_solutions = {}
    counts = {}

    total_n = end - start + 1

    for i, n in enumerate(range(start, end + 1)):
        # Endo_method を使用して φ^(-1)(n) を計算
        solutions_set = phi_inverse(n)
        sol_count = len(solutions_set)

        total_solutions += sol_count
        if sol_count > 0:
            solvable_count += 1

        counts[str(n)] = sol_count

        # 代表サンプル（最初の5件または解が豊富な件）
        if len(sample_solutions) < 5 or (sol_count > 0 and len(sample_solutions) < 15):
            sample_solutions[str(n)] = sorted(list(solutions_set))

    t_duration = time.time() - t_start

    return {
        "start": start,
        "end": end,
        "count": total_n,
        "total_solutions": total_solutions,
        "solvable_count": solvable_count,
        "sample_solutions": sample_solutions,
        "counts_summary": {
            "processed": total_n,
            "solvable": solvable_count,
            "max_solutions_in_range": max(counts.values()) if counts else 0
        },
        "duration_sec": round(t_duration, 4)
    }


# ==========================================
# ワーカークライアントクラス
# ==========================================
class WorkerClient:
    def __init__(self, worker_id: str, server_ip: str, server_port: int, heartbeat_interval: float = 5.0, reconnect_delay: float = 3.0):
        self.worker_id = worker_id
        self.server_ip = server_ip
        self.server_port = server_port
        self.heartbeat_interval = heartbeat_interval
        self.reconnect_delay = reconnect_delay

        # ワーカー状態: DISCONNECTED, CONNECTED, RUNNING, WAITING (第13項)
        self.state = "DISCONNECTED"
        self.current_task_id: Optional[int] = None
        self.current_task: Optional[Dict[str, Any]] = None
        self.completed_tasks_count: int = 0
        self.total_solutions_count: int = 0
        self.last_duration: float = 0.0
        self.sock: Optional[socket.socket] = None
        self.sock_lock = threading.Lock()
        self.running = False

    def start(self):
        """メイン実行ループ (第18項 自動再接続)"""
        self.running = True
        logger.info(f"=== ワーカー起動: {self.worker_id} ===")
        logger.info(f"ターゲット親サーバー: {self.server_ip}:{self.server_port}")

        while self.running:
            try:
                self._connect_and_process()
            except KeyboardInterrupt:
                logger.info("ワーカー終了シグナルを受信しました。")
                break
            except Exception as e:
                self.state = "DISCONNECTED"
                logger.warning(f"接続エラー: {e}。{self.reconnect_delay}秒後に再接続を試みます...")
                time.sleep(self.reconnect_delay)

        self.stop()

    def stop(self):
        self.running = False
        self.state = "DISCONNECTED"
        with self.sock_lock:
            if self.sock:
                try:
                    self.sock.close()
                except Exception:
                    pass
                self.sock = None
        logger.info(f"ワーカー {self.worker_id} を停止しました。")

    def _connect_and_process(self):
        """サーバーに接続し、REGISTER送信、heartbeat開始、タスク処理を行う"""
        logger.info(f"サーバー {self.server_ip}:{self.server_port} へ接続中...")
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((self.server_ip, self.server_port))

        with self.sock_lock:
            self.sock = sock

        self.state = "CONNECTED"
        logger.info(f"サーバーに接続成功。ワーカー状態: CONNECTED")

        # 第12.1項 REGISTER メッセージ送信
        reg_msg = {
            "type": "register",
            "worker_id": self.worker_id
        }
        self._send_json(reg_msg)
        logger.info(f"[REGISTER] 登録メッセージ送信: {self.worker_id}")

        # 第8項 Heartbeat 送信スレッド開始
        hb_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        hb_thread.start()

        # 受信・タスク処理ループ
        sock_file = sock.makefile("r", encoding="utf-8")
        while self.running and self.state != "DISCONNECTED":
            line = sock_file.readline()
            if not line:
                logger.warning("サーバー側から接続が切断されました。")
                break

            line = line.strip()
            if not line:
                continue

            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                logger.warning(f"不正なJSON受信: {line}")
                continue

            self._handle_server_message(msg)

        self.state = "DISCONNECTED"

    def _handle_server_message(self, msg: dict):
        msg_type = msg.get("type")

        # 第12.2項 TASK
        if msg_type == "task":
            task_info = msg.get("task", {})
            task_id = task_info.get("task_id")
            start_val = task_info.get("start")
            end_val = task_info.get("end")

            self.state = "RUNNING"
            self.current_task_id = task_id
            self.current_task = task_info
            logger.info(f"[TASK受信] task_id: {task_id}, 範囲: [{start_val} - {end_val}]。Endo_method で計算開始...")

            # 数値計算 calculate() 実行 (第19項 分離モジュール)
            result = calculate(start_val, end_val)
            self.completed_tasks_count += 1
            self.total_solutions_count += result.get("total_solutions", 0)
            self.last_duration = result.get("duration_sec", 0.0)
            logger.info(f"[計算完了] task_id: {task_id} 所要時間: {result['duration_sec']}秒, 解の総数: {result['total_solutions']}")

            # 第12.3項 DONE メッセージ送信
            done_msg = {
                "type": "done",
                "task_id": task_id,
                "result": result
            }
            self._send_json(done_msg)
            logger.info(f"[DONE送信] task_id: {task_id} の結果を送信完了。")
            self.current_task_id = None
            self.current_task = None
            self.state = "CONNECTED"

        # 第12.5項 HEARTBEAT_ACK
        elif msg_type == "heartbeat_ack":
            # サーバーからのハートビート正常受領
            pass

        # 第12.6項 WAIT
        elif msg_type == "wait":
            self.state = "WAITING"
            logger.info("[WAIT受信] 現在割り当て可能なタスクがありません。待機中...")
            time.sleep(2)
            # 次のタスク確認用リクエスト
            self._send_json({"type": "get_task"})

    def _heartbeat_loop(self):
        """第8項: 推奨5秒間隔でサーバーへ heartbeat を送信"""
        while self.running and self.state != "DISCONNECTED":
            time.sleep(self.heartbeat_interval)
            if self.state != "DISCONNECTED":
                hb_msg = {"type": "heartbeat"}
                success = self._send_json(hb_msg)
                if not success:
                    break

    def _send_json(self, data: dict) -> bool:
        with self.sock_lock:
            if not self.sock:
                return False
            try:
                line = json.dumps(data, ensure_ascii=False) + "\n"
                self.sock.sendall(line.encode("utf-8"))
                return True
            except Exception as e:
                logger.debug(f"JSON送信失敗: {e}")
                return False


def main():
    parser = argparse.ArgumentParser(description="LAN 分散計算システム ワーカーPC")
    parser.add_argument("--id", "--worker_id", dest="worker_id", default="PC01", help="ワーカーID (例: PC01 〜 PC22)")
    parser.add_argument("--server", dest="server_ip", default="127.0.0.1", help="親サーバーIPアドレス")
    parser.add_argument("--port", type=int, default=5000, help="親サーバーTCPポート")
    parser.add_argument("--config", default=str(CONFIG_FILE), help="設定ファイルパス")
    args = parser.parse_args()

    # config.json があればデフォルト値を読み込み
    heartbeat_interval = 5.0
    reconnect_delay = 3.0
    cfg_path = Path(args.config)
    if cfg_path.exists():
        try:
            with open(cfg_path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
                w_cfg = cfg.get("worker", {})
                heartbeat_interval = float(w_cfg.get("heartbeat_interval", 5.0))
                reconnect_delay = float(w_cfg.get("reconnect_delay", 3.0))
                if args.server_ip == "127.0.0.1" and "server_ip" in w_cfg:
                    args.server_ip = w_cfg["server_ip"]
                if args.port == 5000 and "server_port" in w_cfg:
                    args.port = int(w_cfg["server_port"])
        except Exception:
            pass

    client = WorkerClient(
        worker_id=args.worker_id,
        server_ip=args.server_ip,
        server_port=args.port,
        heartbeat_interval=heartbeat_interval,
        reconnect_delay=reconnect_delay
    )
    client.start()


if __name__ == "__main__":
    main()
