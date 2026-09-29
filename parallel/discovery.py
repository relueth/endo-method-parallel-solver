#!/usr/bin/env python3
"""
discovery.py - LAN内 親サーバー自動検出モジュール (UDPブロードキャスト)
親サーバーのIPアドレスをLAN内で自動探索・自動通知します。
"""

import json
import logging
import socket
import threading
import time
from typing import Optional, Dict, Any, List

DISCOVERY_PORT = 5001
SERVICE_NAME = "endo_parallel_server"

logger = logging.getLogger("ParallelDiscovery")


def get_local_ip_addresses() -> List[str]:
    """LAN内のローカルIPv4アドレス候補を取得"""
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.3)
        s.connect(("8.8.8.8", 80))
        primary = s.getsockname()[0]
        s.close()
        ips.append(primary)
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


class ServerDiscoveryService:
    """親サーバー側で動作するUDP探索応答 & 定期ビーコン送信サービス"""

    def __init__(self, tcp_port: int = 5000, discovery_port: int = DISCOVERY_PORT):
        self.tcp_port = tcp_port
        self.discovery_port = discovery_port
        self.running = False
        self.sock: Optional[socket.socket] = None
        self.local_ips = get_local_ip_addresses()
        self.primary_ip = self.local_ips[0] if self.local_ips else "127.0.0.1"
        self._thread: Optional[threading.Thread] = None

    def start(self):
        """バックグラウンドで探索受信スレッドを開始"""
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        """サービス停止"""
        self.running = False
        if self.sock:
            try:
                self.sock.close()
            except Exception:
                pass
            self.sock = None

    def _run(self):
        try:
            self.sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
            except Exception:
                pass

            # 全インターフェースで探索ポートをバインド
            self.sock.bind(("", self.discovery_port))
            self.sock.settimeout(1.0)
        except Exception as e:
            logger.debug(f"Discovery サービス起動失敗 (ポート競合等): {e}")
            self.running = False
            return

        last_beacon_time = 0.0

        while self.running:
            now = time.time()

            # 1.5秒ごとに自発的ビーコンをLANにブロードキャスト
            if now - last_beacon_time >= 1.5:
                self._send_beacon()
                last_beacon_time = now

            # ワーカーからのプローブ要求を受信・即時返信
            try:
                data, addr = self.sock.recvfrom(2048)
                if not data:
                    continue

                try:
                    msg = json.loads(data.decode("utf-8", errors="ignore"))
                except Exception:
                    continue

                if msg.get("service") == SERVICE_NAME and msg.get("type") in ("discover", "probe"):
                    # 即座にサーバー情報を返信
                    reply = {
                        "type": "beacon",
                        "service": SERVICE_NAME,
                        "server_ip": self.primary_ip,
                        "server_port": self.tcp_port
                    }
                    rep_bytes = json.dumps(reply).encode("utf-8")
                    self.sock.sendto(rep_bytes, addr)
            except socket.timeout:
                continue
            except Exception as e:
                if self.running:
                    logger.debug(f"Discovery 受信ループエラー: {e}")
                break

    def _send_beacon(self):
        """LANブロードキャストアドレスにビーコンを送信"""
        if not self.sock:
            return

        beacon_data = {
            "type": "beacon",
            "service": SERVICE_NAME,
            "server_ip": self.primary_ip,
            "server_port": self.tcp_port
        }
        raw = json.dumps(beacon_data).encode("utf-8")

        targets = ["<broadcast>", "255.255.255.255", "127.0.0.1"]
        for target in targets:
            try:
                self.sock.sendto(raw, (target, self.discovery_port))
            except Exception:
                pass


def discover_server(timeout: float = 2.0, discovery_port: int = DISCOVERY_PORT) -> Optional[Dict[str, Any]]:
    """
    LAN内の親サーバーを自動探索する (ワーカー側呼び出し用)。
    発見時は {"server_ip": "192.168.x.x", "server_port": 5000} を返す。
    見つからなかった場合は None を返す。
    """
    sock = None
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        except Exception:
            pass
        sock.settimeout(0.3)

        probe = {
            "type": "discover",
            "service": SERVICE_NAME
        }
        raw_probe = json.dumps(probe).encode("utf-8")

        # プローブ送信 (ブロードキャスト & ローカル)
        targets = ["<broadcast>", "255.255.255.255", "127.0.0.1"]
        for t in targets:
            try:
                sock.sendto(raw_probe, (t, discovery_port))
            except Exception:
                pass

        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                data, addr = sock.recvfrom(2048)
                if not data:
                    continue
                msg = json.loads(data.decode("utf-8", errors="ignore"))
                if msg.get("service") == SERVICE_NAME and msg.get("type") == "beacon":
                    found_ip = msg.get("server_ip")
                    # もしサーバーが通知したIPが127.0.0.1以外でなくローカル検出なら送信元IPも考慮
                    if not found_ip or found_ip == "127.0.0.1":
                        if not addr[0].startswith("127."):
                            found_ip = addr[0]
                    if not found_ip:
                        found_ip = addr[0]

                    return {
                        "server_ip": found_ip,
                        "server_port": int(msg.get("server_port", 5000))
                    }
            except socket.timeout:
                # タイムアウトごとに再プローブ
                for t in targets:
                    try:
                        sock.sendto(raw_probe, (t, discovery_port))
                    except Exception:
                        pass
                continue
            except Exception:
                break

    except Exception as e:
        logger.debug(f"サーバー探索失敗: {e}")
    finally:
        if sock:
            try:
                sock.close()
            except Exception:
                pass

    return None


if __name__ == "__main__":
    print("=== LAN 親サーバー探索テスト ===")
    print("1. サーバーDiscoveryServiceをテスト起動...")
    srv = ServerDiscoveryService(tcp_port=5000)
    srv.start()
    time.sleep(0.5)

    print("2. discover_server() で探索を実行...")
    res = discover_server(timeout=1.5)
    print(f"探索結果: {res}")

    srv.stop()
    print("完了")
