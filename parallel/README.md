# LAN分散計算システム (Endo's Method φ⁻¹(n) 並列求解)

LAN内に接続された複数台のPC（親サーバー1台、ワーカーPC最大22台）を使用し、オイラーのトーシェント関数の方程式 $\phi(x) = n$ の解（逆像 $\phi^{-1}(n)$）を並列分散計算するシステムです。

---

## 1. ディレクトリ構成

```text
parallel/
├── server.py        # 親サーバー (タスク管理, ワーカー管理, 結果管理, heartbeat監視)
├── worker.py        # ワーカープログラム (通信, heartbeat, Endo_method計算)
├── Endo_method.py   # φ^(-1)(n) を高速算出する数値計算コア (importして利用)
├── config.json      # ポート, heartbeat間隔, タスク範囲設定
├── data/
│   ├── tasks.db     # SQLiteによる状態永続化 (タスク管理DB)
│   └── results/     # タスク完了ごとの詳細JSON結果
└── logs/
    ├── server.log   # サーバーログ
    └── worker.log   # ワーカーログ
```

---

## 2. 実行要件

- Python 3.8以上
- `sympy` パッケージ (`pip install sympy`)

---

## 3. LAN環境での起動手順

### 3.1 親サーバーPC (1台)

親サーバーのIPアドレスを確認します（例: `192.168.1.100`）。

```bash
cd parallel

# サーバー起動 (ポート5000で全インターフェース待機)
python3 server.py --host 0.0.0.0 --port 5000
```

起動すると、`data/tasks.db` にタスクが自動登録され、ワーカーからの接続を待機します。
5秒ごとにコンソールおよび `logs/server.log` に以下のようなステータス画面が出力されます。

```text
========== SERVER STATUS ==========
Pending   : 100
Running   : 3
Completed : 12
Workers   : 3

PC01     : 1301 - 1400 [RUNNING]
PC02     : 1401 - 1500 [RUNNING]
PC03     : 1501 - 1600 [RUNNING]
===================================
```

### 3.2 ワーカーPC (最大22台: PC01 〜 PC22)

各ワーカーPCで、親サーバーのIPアドレスを指定して起動します。

```bash
cd parallel

# 例: PC01 で起動する場合
python3 worker.py --id PC01 --server 192.168.1.100 --port 5000

# 例: PC02 で起動する場合
python3 worker.py --id PC02 --server 192.168.1.100 --port 5000

# 例: PC22 で起動する場合
python3 worker.py --id PC22 --server 192.168.1.100 --port 5000
```

---

## 4. 主な機能と仕様書への準拠

1. **動的タスク割り当て (第5項, 第7項)**:
   - ワーカーの処理速度（CPU性能）の差を自動吸収。計算が早く終わったPCに即座に次の未処理タスクを割り当てます。
2. **Heartbeat & 障害検出 (第8項, 第9項)**:
   - ワーカーは5秒ごとに `{"type": "heartbeat"}` を送信。
   - サーバー側で30秒間受信が途絶えた場合、ワーカーを異常終了と判断。
3. **自動タスク再割り当て (第10項)**:
   - 異常終了したワーカーが処理中だったタスクは自動的に `PENDING` に巻き戻され、正常な別ワーカーへ再配分されます。計算範囲の欠損を防ぎます。
4. **SQLiteによる状態永続化 & 再起動耐性 (第16項, 第17項)**:
   - `data/tasks.db` に全タスクの進捗が記録されます。
   - サーバーが途中で停止・再起動しても、完了済みタスクは保持され、中断されたタスクは自動的に `PENDING` に戻って再配布されます。
5. **計算プログラムの分離 (第19項)**:
   - 通信制御と数値計算 `calculate(start, end)` が完全に分離されており、`Endo_method.phi_inverse(n)` を安全に呼び出します。
