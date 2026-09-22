#!/usr/bin/env python3
"""
plot_benchmark.py - results/ フォルダ内の計算結果から処理時間グラフを作成するスクリプト

使い方:
  python plot_benchmark.py
  (結果は画面表示されるとともに、data/benchmark_graph.png に自動保存されます)
"""

import os
import sys
import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
RESULTS_DIR = DATA_DIR / "results"
OUTPUT_IMG = DATA_DIR / "benchmark_graph.png"

def load_results():
    if not RESULTS_DIR.exists():
        print(f"エラー: 結果フォルダ {RESULTS_DIR} が存在しません。")
        return []

    points = []
    for p in RESULTS_DIR.glob("task_*.json"):
        try:
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
                tid = data.get("task_id", 0)
                res = data.get("result", {})
                start = res.get("start", 0)
                end = res.get("end", 0)
                duration = data.get("duration", res.get("duration_sec", 0.0))
                solutions = res.get("total_solutions", 0)
                worker_id = data.get("worker_id", "-")

                if end > 0 and duration >= 0:
                    points.append({
                        "task_id": tid,
                        "start": start,
                        "end": end,
                        "duration": duration,
                        "solutions": solutions,
                        "worker_id": worker_id
                    })
        except Exception as e:
            continue

    # 横軸（分割上限 end）で昇順ソート
    points.sort(key=lambda x: x["end"])
    return points

def plot_graph(points):
    if not points:
        print("results/ フォルダに有効なタスク完了結果が見つかりませんでした。")
        return

    # matplotlib が未インストールの場合は自動インストール
    try:
        import matplotlib
    except ImportError:
        try:
            from ensure_deps import ensure_package
            print("[グラフ生成] matplotlib が見つかりません。自動インストール中...")
            ensure_package("matplotlib", "matplotlib")
            import matplotlib
        except Exception:
            import subprocess
            subprocess.run([sys.executable, "-m", "pip", "install", "matplotlib"], check=False)
            try:
                import matplotlib
            except ImportError:
                matplotlib = None

    if matplotlib is not None:
        try:
            # GUI環境がない場合のフォールバック
            try:
                import matplotlib.pyplot as plt
            except Exception:
                matplotlib.use('Agg')
                import matplotlib.pyplot as plt

            # 日本語フォント設定（文字化け回避）
            plt.rcParams['font.sans-serif'] = ['Meiryo', 'Yu Gothic', 'Hiragino Maru Gothic Pro', 'Takao', 'IPAexGothic', 'DejaVu Sans']
            plt.rcParams['axes.unicode_minus'] = False
        except Exception as e:
            print(f"matplotlib 初期化警告: {e}")
            matplotlib = None

    if matplotlib is None:
        print("\n--- CUIテキスト形式での簡易サマリー ---")
        print(f"{'Task':<8} {'Range':<20} {'End (横軸)':<12} {'Duration (縦軸:秒)':<18} {'Solutions'}")
        print("-" * 70)
        for p in points[:30]:
            print(f"#{p['task_id']:<7} {p['start']}〜{p['end']:<15} {p['end']:<12} {p['duration']:<18.4f} {p['solutions']}")
        if len(points) > 30:
            print(f"... 他 {len(points) - 30} 件")
        return

    x_vals = [p["end"] for p in points]
    y_vals = [p["duration"] for p in points]

    fig, ax1 = plt.subplots(figsize=(10, 6))

    # 1. 処理時間の折れ線・散布図グラフ
    line1 = ax1.plot(x_vals, y_vals, marker='o', markersize=4, color='#2563eb', linewidth=1.8, label='所要時間 (秒)')
    ax1.set_xlabel('分割範囲の上限 n (100, 200, 300, ...)', fontsize=11, fontweight='bold')
    ax1.set_ylabel('処理にかかった時間 (秒)', color='#1e3a8a', fontsize=11, fontweight='bold')
    ax1.tick_params(axis='y', labelcolor='#1e3a8a')
    ax1.grid(True, linestyle='--', alpha=0.5)

    # 平均線
    avg_duration = sum(y_vals) / len(y_vals)
    ax1.axhline(avg_duration, color='#f59e0b', linestyle=':', label=f'平均所要時間: {avg_duration:.3f}秒')

    # タイトル
    plt.title(f'オイラー関数逆像計算 並列処理ベンチマーク (完了: {len(points)}タスク)', fontsize=13, fontweight='bold', pad=12)

    # 凡例
    ax1.legend(loc='upper left')

    plt.tight_layout()

    # 画像として保存
    try:
        OUTPUT_IMG.parent.mkdir(parents=True, exist_ok=True)
        plt.savefig(OUTPUT_IMG, dpi=200)
        print(f"グラフ画像を保存しました: {OUTPUT_IMG}")
    except Exception as e:
        print(f"画像保存エラー: {e}")

    # ウィンドウ表示（GUIが可能な場合）
    try:
        plt.show()
    except Exception:
        pass

if __name__ == "__main__":
    data = load_results()
    print(f"読み込み完了: {len(data)} 件のタスク結果")
    plot_graph(data)
