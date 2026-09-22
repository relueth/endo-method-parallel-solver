import express from "express";
import path from "path";
import fs from "fs";
import { spawn, execSync, ChildProcess } from "child_process";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json());

const BASE_DIR = process.cwd();
const PARALLEL_DIR = path.join(BASE_DIR, "parallel");
const DATA_DIR = path.join(PARALLEL_DIR, "data");
const LOGS_DIR = path.join(PARALLEL_DIR, "logs");
const RESULTS_DIR = path.join(DATA_DIR, "results");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");

// 追跡中の子プロセス管理
let serverProcess: ChildProcess | null = null;
const workerProcesses: Map<string, ChildProcess> = new Map();

// ディレクトリ確保
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

// Python実行ヘルパー
function runPythonCode(code: string): string {
  try {
    const res = execSync(`python3 -c "${code.replace(/"/g, '\\"')}"`, {
      cwd: PARALLEL_DIR,
      encoding: "utf-8",
      timeout: 10000,
    });
    return res.trim();
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

// =========================================================
// API ルート定義
// =========================================================

// クラスターステータス取得
app.get("/api/cluster/status", (req, res) => {
  try {
    const statusFile = path.join(DATA_DIR, "cluster_status.json");
    let statusData: any = null;

    if (fs.existsSync(statusFile)) {
      try {
        statusData = JSON.parse(fs.readFileSync(statusFile, "utf-8"));
      } catch (e) {
        // ignore parse error
      }
    }

    // SQLite から最新統計を取得
    const dbQuery = `
import sqlite3, json, os, time
from pathlib import Path
db_path = Path('data/tasks.db')
if not db_path.exists():
    print(json.dumps({'exists': False}))
else:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute('SELECT status, COUNT(*) as cnt FROM tasks GROUP BY status')
    counts = {'PENDING': 0, 'RUNNING': 0, 'COMPLETED': 0}
    for r in c.fetchall():
        counts[r['status']] = r['cnt']
    c.execute('SELECT SUM(total_solutions) FROM tasks WHERE status = "COMPLETED"')
    sol_sum = c.fetchone()[0] or 0
    total = sum(counts.values())
    rate = round((counts['COMPLETED'] / max(1, total)) * 100, 2)
    conn.close()
    print(json.dumps({
        'exists': True,
        'pending': counts['PENDING'],
        'running': counts['RUNNING'],
        'completed': counts['COMPLETED'],
        'total': total,
        'completion_rate': rate,
        'total_solutions': sol_sum
    }))
`;
    let dbStats: any = { exists: false, pending: 0, running: 0, completed: 0, total: 0, completion_rate: 0, total_solutions: 0 };
    try {
      const dbOut = runPythonCode(dbQuery);
      dbStats = JSON.parse(dbOut);
    } catch (e) {}

    // 22台のワーカーPCスロット一覧を構成
    const activeWorkersMap = new Map<string, any>();
    if (statusData && Array.isArray(statusData.workers)) {
      statusData.workers.forEach((w: any) => {
        activeWorkersMap.set(w.worker_id, w);
      });
    }

    const allWorkerSlots = [];
    for (let i = 1; i <= 22; i++) {
      const wId = `PC${i.toString().padStart(2, "0")}`;
      const isRunningProcess = workerProcesses.has(wId);
      const reported = activeWorkersMap.get(wId);

      allWorkerSlots.push({
        worker_id: wId,
        is_active_process: isRunningProcess,
        status: reported ? reported.status : (isRunningProcess ? "CONNECTED" : "DISCONNECTED"),
        task_id: reported ? reported.task_id : null,
        task_range: reported ? reported.task_range : "-",
        last_heartbeat_ago: reported ? reported.last_heartbeat_ago : null,
        completed_count: reported ? reported.completed_count : 0,
        address: reported ? reported.address : "192.168.1." + (100 + i)
      });
    }

    const isServerRunning = serverProcess !== null && !serverProcess.killed;

    res.json({
      server_running: isServerRunning,
      db_stats: dbStats,
      active_workers_count: statusData ? statusData.workers_count : allWorkerSlots.filter(w => w.status !== "DISCONNECTED").length,
      workers: allWorkerSlots,
      updated_at: statusData?.updated_at || new Date().toISOString(),
      uptime_seconds: statusData?.uptime_seconds || 0
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 親サーバーの起動
app.post("/api/cluster/server/start", (req, res) => {
  try {
    if (serverProcess && !serverProcess.killed) {
      return res.json({ status: "already_running" });
    }

    serverProcess = spawn("python3", ["server.py", "--port", "5000"], {
      cwd: PARALLEL_DIR,
      stdio: "pipe",
      detached: false,
    });

    serverProcess.on("exit", (code) => {
      serverProcess = null;
    });

    res.json({ status: "started" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 親サーバーの停止
app.post("/api/cluster/server/stop", (req, res) => {
  try {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      serverProcess = null;
    }
    // 全ワーカーも停止
    for (const [wId, proc] of workerProcesses.entries()) {
      proc.kill("SIGTERM");
    }
    workerProcesses.clear();

    try {
      execSync("pkill -f 'parallel/server.py' || true");
      execSync("pkill -f 'parallel/worker.py' || true");
    } catch (e) {}

    res.json({ status: "stopped" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ワーカープロセスの起動 (単体または一括)
app.post("/api/cluster/worker/spawn", (req, res) => {
  try {
    const { worker_id, count } = req.body;

    const spawnOne = (id: string) => {
      if (workerProcesses.has(id)) return;
      const proc = spawn("python3", ["worker.py", "--id", id, "--server", "127.0.0.1", "--port", "5000"], {
        cwd: PARALLEL_DIR,
        stdio: "pipe",
      });
      proc.on("exit", () => {
        workerProcesses.delete(id);
      });
      workerProcesses.set(id, proc);
    };

    if (count && typeof count === "number") {
      const numToSpawn = Math.min(22, count);
      for (let i = 1; i <= numToSpawn; i++) {
        const id = `PC${i.toString().padStart(2, "0")}`;
        spawnOne(id);
      }
    } else if (worker_id) {
      spawnOne(worker_id);
    } else {
      // 次の空きスロットを探す
      for (let i = 1; i <= 22; i++) {
        const id = `PC${i.toString().padStart(2, "0")}`;
        if (!workerProcesses.has(id)) {
          spawnOne(id);
          break;
        }
      }
    }

    res.json({ status: "spawned", running_workers: Array.from(workerProcesses.keys()) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ワーカーの強制切断/キル (障害検出・タスク再配分テスト用)
app.post("/api/cluster/worker/kill", (req, res) => {
  try {
    const { worker_id } = req.body;
    if (worker_id && workerProcesses.has(worker_id)) {
      const proc = workerProcesses.get(worker_id);
      proc?.kill("SIGKILL");
      workerProcesses.delete(worker_id);
      return res.json({ status: "killed", worker_id });
    }
    // システム全体から該当ワーカープロセスをkill
    try {
      execSync(`pkill -f "worker.py --id ${worker_id}" || true`);
    } catch (e) {}
    res.json({ status: "killed", worker_id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// タスク生成・リセット
app.post("/api/cluster/tasks/generate", (req, res) => {
  try {
    const { range_start = 1, range_end = 10000, chunk_size = 100 } = req.body;
    const start = Math.max(1, parseInt(range_start, 10));
    const end = Math.max(start, parseInt(range_end, 10));
    const chunk = Math.max(1, parseInt(chunk_size, 10));

    const pyCode = `
import sqlite3, os
from pathlib import Path
db_path = Path('data/tasks.db')
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute('DROP TABLE IF EXISTS tasks')
cur.execute('''
    CREATE TABLE tasks (
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
''')
cur.execute('CREATE INDEX idx_tasks_status ON tasks(status)')
task_id = 1
curr = ${start}
items = []
while curr <= ${end}:
    c_end = min(curr + ${chunk} - 1, ${end})
    items.append((task_id, curr, c_end, 'PENDING'))
    task_id += 1
    curr = c_end + 1
cur.executemany('INSERT INTO tasks (task_id, start, end, status) VALUES (?, ?, ?, ?)', items)
conn.commit()
conn.close()
print(f"{len(items)}")
`;
    const count = runPythonCode(pyCode);
    res.json({ status: "generated", count: parseInt(count, 10) || 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// タスクをPENDINGにリセット
app.post("/api/cluster/tasks/reset", (req, res) => {
  try {
    const pyCode = `
import sqlite3
from pathlib import Path
db_path = Path('data/tasks.db')
if db_path.exists():
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute('UPDATE tasks SET status = "PENDING", worker_id = NULL, assigned_at = NULL, completed_at = NULL, duration = NULL, total_solutions = 0, result_summary = NULL')
    conn.commit()
    conn.close()
    print("reset_ok")
else:
    print("no_db")
`;
    const result = runPythonCode(pyCode);
    res.json({ status: result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// tasks.db のバックアップ作成
app.post("/api/cluster/database/backup", (req, res) => {
  try {
    const dbPath = path.join(DATA_DIR, "tasks.db");
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: "tasks.db が存在しません。" });
    }

    const pyCode = `
import sqlite3, datetime
from pathlib import Path
db_path = Path('data/tasks.db')
backup_dir = Path('data/backups')
backup_dir.mkdir(parents=True, exist_ok=True)
now_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
target = backup_dir / f"tasks_backup_{now_str}.db"

src = sqlite3.connect(db_path)
dst = sqlite3.connect(target)
try:
    src.backup(dst)
    print(target.name)
finally:
    dst.close()
    src.close()
`;
    const backupFileName = runPythonCode(pyCode);
    res.json({
      status: "success",
      filename: backupFileName,
      path: `data/backups/${backupFileName}`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// バックアップ一覧取得
app.get("/api/cluster/database/backups", (req, res) => {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) {
      return res.json([]);
    }
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.endsWith(".db"))
      .map(name => {
        const fullPath = path.join(BACKUPS_DIR, name);
        const stats = fs.statSync(fullPath);
        return {
          filename: name,
          size_bytes: stats.size,
          created_at: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json(files);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// タスク一覧 (ページネーション)
app.get("/api/cluster/tasks/list", (req, res) => {
  try {
    const page = parseInt(req.query.page as string || "1", 10);
    const limit = parseInt(req.query.limit as string || "50", 10);
    const statusFilter = req.query.status as string || "ALL";
    const offset = (page - 1) * limit;

    const pyCode = `
import sqlite3, json
from pathlib import Path
db_path = Path('data/tasks.db')
if not db_path.exists():
    print(json.dumps({'tasks': [], 'total': 0}))
else:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    filter_sql = ""
    params = []
    if '${statusFilter}' != 'ALL':
        filter_sql = "WHERE status = ?"
        params.append('${statusFilter}')
    c.execute(f"SELECT COUNT(*) FROM tasks {filter_sql}", params)
    total = c.fetchone()[0]
    c.execute(f"SELECT task_id, start, end, status, worker_id, duration, total_solutions FROM tasks {filter_sql} ORDER BY task_id ASC LIMIT {limit} OFFSET {offset}", params)
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    print(json.dumps({'tasks': rows, 'total': total}))
`;
    const out = runPythonCode(pyCode);
    res.json(JSON.parse(out));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ベンチマーク・処理時間グラフ用データエンドポイント (resultsフォルダから全件集計)
app.get("/api/cluster/results/benchmark", (req, res) => {
  try {
    if (!fs.existsSync(RESULTS_DIR)) {
      return res.json({ points: [], summary: { total_tasks: 0, avg_duration: 0, total_solutions: 0 } });
    }

    const files = fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith(".json"));
    const points: Array<{
      task_id: number;
      start: number;
      end: number;
      label: string;
      range_display: string;
      duration_sec: number;
      total_solutions: number;
      solvable_count: number;
      worker_id: string;
      completed_at: string;
    }> = [];

    for (const file of files) {
      try {
        const fullPath = path.join(RESULTS_DIR, file);
        const data = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
        const tid = data.task_id || 0;
        const resObj = data.result || {};
        const start = resObj.start || 0;
        const end = resObj.end || 0;
        const duration = typeof data.duration === "number" ? data.duration : (resObj.duration_sec || 0);

        points.push({
          task_id: tid,
          start,
          end,
          label: `${end}`, // 横軸: 分割の終端 (例: 100, 200, 300, ...)
          range_display: `${start}〜${end}`,
          duration_sec: Math.round(duration * 1000) / 1000,
          total_solutions: resObj.total_solutions || 0,
          solvable_count: resObj.solvable_count || 0,
          worker_id: data.worker_id || "-",
          completed_at: data.completed_at || "",
        });
      } catch (e) {
        // スキップ
      }
    }

    // 横軸 (startまたはend) で昇順ソート
    points.sort((a, b) => a.end - b.end);

    const totalDuration = points.reduce((acc, p) => acc + p.duration_sec, 0);
    const totalSolutions = points.reduce((acc, p) => acc + p.total_solutions, 0);
    const avgDuration = points.length > 0 ? Math.round((totalDuration / points.length) * 1000) / 1000 : 0;

    res.json({
      points,
      summary: {
        total_tasks: points.length,
        avg_duration: avgDuration,
        total_solutions: totalSolutions,
        min_end: points.length > 0 ? points[0].end : 0,
        max_end: points.length > 0 ? points[points.length - 1].end : 0,
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 最近の完了結果詳細
app.get("/api/cluster/results/list", (req, res) => {
  try {
    if (!fs.existsSync(RESULTS_DIR)) {
      return res.json([]);
    }
    const files = fs.readdirSync(RESULTS_DIR)
      .filter(f => f.endsWith(".json"))
      .sort((a, b) => fs.statSync(path.join(RESULTS_DIR, b)).mtimeMs - fs.statSync(path.join(RESULTS_DIR, a)).mtimeMs)
      .slice(0, 15);

    const results = files.map(file => {
      try {
        return JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), "utf-8"));
      } catch (e) {
        return null;
      }
    }).filter(Boolean);

    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ログ取得
app.get("/api/cluster/logs", (req, res) => {
  try {
    const serverLogPath = path.join(LOGS_DIR, "server.log");
    const workerLogPath = path.join(LOGS_DIR, "worker.log");

    const readTail = (filePath: string, linesCount: number = 80) => {
      if (!fs.existsSync(filePath)) return "(ログはまだありません)";
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      return lines.slice(-linesCount).join("\n");
    };

    res.json({
      server_log: readTail(serverLogPath, 80),
      worker_log: readTail(workerLogPath, 80),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endo_method 単体計算テスト
app.post("/api/endo/calculate", (req, res) => {
  try {
    const nVal = parseInt(req.body.n, 10);
    if (isNaN(nVal) || nVal < 1) {
      return res.status(400).json({ error: "正の整数を入力してください。" });
    }

    const pyCode = `
import json, time
from Endo_method import phi_inverse, theta_terms, M
t0 = time.time()
sol = sorted(list(phi_inverse(${nVal})))
dur = time.time() - t0
terms = [[p, pe] for p, pe in theta_terms(${nVal})]
m_decomp = [[[d, e] for d, e in part] for part in M(${nVal})]
print(json.dumps({
    'n': ${nVal},
    'solutions': sol,
    'count': len(sol),
    'duration_ms': round(dur * 1000, 3),
    'theta_terms': terms,
    'm_decompositions': m_decomp
}))
`;
    const out = runPythonCode(pyCode);
    res.json(JSON.parse(out));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ファイル内容確認
app.get("/api/files/view", (req, res) => {
  try {
    const filename = req.query.file as string;
    const allowed = [
      "gui_launcher.py",
      "gui_launcher.pyw",
      "gui_server.py",
      "gui_server.pyw",
      "gui_worker.py",
      "gui_worker.pyw",
      "start_gui_server.bat",
      "start_gui_worker.bat",
      "server.py",
      "worker.py",
      "start_server_windows.bat",
      "start_worker_windows.bat",
      "Endo_method.py",
      "config.json",
      "README.md"
    ];
    if (!allowed.includes(filename)) {
      return res.status(400).json({ error: "許可されていないファイルです" });
    }
    const targetPath = path.join(PARALLEL_DIR, filename);
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: "ファイルが見つかりません" });
    }
    const content = fs.readFileSync(targetPath, "utf-8");
    res.json({ filename, content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// Vite ミドルウェア統合
// =========================================================
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // 自動的にバックグラウンドで Python server.py を起動しておく
  try {
    serverProcess = spawn("python3", ["server.py", "--port", "5000"], {
      cwd: PARALLEL_DIR,
      stdio: "pipe",
    });
    console.log("Python 親サーバーを自動初期起動しました (ポート 5000)");
  } catch (e) {
    console.warn("Python server auto-start note:", e);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
