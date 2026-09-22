#!/usr/bin/env python3
"""
ensure_deps.py - 必要なPythonパッケージ (sympy, matplotlib 等) の自動検出・自動インストールモジュール
"""

import sys
import subprocess
import importlib

# 分散計算システムに必要な外部ライブラリ群
REQUIRED_PACKAGES = {
    "sympy": "sympy",
    "matplotlib": "matplotlib",
}

def install_package(pip_name: str) -> bool:
    """pip を使ってパッケージを自動インストールする"""
    print(f"[依存関係] ライブラリ '{pip_name}' が見つかりません。自動インストールを実行しています...", flush=True)
    try:
        cmd = [sys.executable, "-m", "pip", "install", pip_name]
        res = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        print(f"[依存関係] '{pip_name}' のインストールが完了しました！", flush=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"[依存関係エラー] '{pip_name}' のインストールに失敗しました: {e.stderr}", file=sys.stderr, flush=True)
        return False
    except Exception as e:
        print(f"[依存関係エラー] 予期せぬエラーが発生しました: {e}", file=sys.stderr, flush=True)
        return False

def ensure_package(import_name: str, pip_name: str = None) -> bool:
    """指定されたライブラリがインポート可能か確認し、無ければ自動インストールして再ロードする"""
    if pip_name is None:
        pip_name = import_name

    try:
        importlib.import_module(import_name)
        return True
    except ImportError:
        ok = install_package(pip_name)
        if ok:
            try:
                importlib.invalidate_caches()
                importlib.import_module(import_name)
                return True
            except ImportError:
                return False
        return False

def ensure_all_dependencies():
    """sympy, matplotlib などシステム全体の依存関係をチェックし一括確保する"""
    for import_name, pip_name in REQUIRED_PACKAGES.items():
        ensure_package(import_name, pip_name)

if __name__ == "__main__":
    ensure_all_dependencies()
