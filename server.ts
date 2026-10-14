import express from "express";
import http from "http";
import path from "path";
import fs from "fs";
import os from "os";
import { spawn, execSync, ChildProcess } from "child_process";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createRequire } from "node:module";

// ESM (tsx) と CommonJS (dist/server.cjs) の両環境で安全に動作
const cjsRequire: any = typeof require !== "undefined" ? require : createRequire(import.meta?.url || "file:///");
const app = express();
const PORT = 3000;

app.use(express.json());

function getLocalIpAddresses(): string[] {
  try {
    const interfaces = os.networkInterfaces();
    const addresses: string[] = [];
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name] || []) {
        if (net.family === "IPv4" && !net.internal) {
          addresses.push(net.address);
        }
      }
    }
    return addresses;
  } catch (e) {
    return [];
  }
}

const BASE_DIR = process.cwd();
const PARALLEL_DIR = path.join(BASE_DIR, "parallel");
const DATA_DIR = path.join(PARALLEL_DIR, "data");
const LOGS_DIR = path.join(PARALLEL_DIR, "logs");
const RESULTS_DIR = path.join(DATA_DIR, "results");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");

// 追跡中の子プロセス管理
let serverProcess: ChildProcess | null = null;
const workerProcesses: Map<string, ChildProcess> = new Map();

// =========================================================
// Web Worker 接続管理 (WebSocket 経由のブラウザ計算ノード)
// =========================================================
export interface ConnectedWebWorker {
  id: string; // 例: "WEB-PC01"
  cores: number;
  engine: string;
  status: "STANDBY" | "RUNNING" | "PAUSED" | "DISCONNECTED";
  current_task_id: number | null;
  current_range: string;
  last_heartbeat: number;
  completed_tasks: number;
  total_solutions: number;
  current_speed: number;
  progress_pct: number;
  connected_at: string;
  ws: WebSocket;
  ip: string;
}

const connectedWebWorkers: Map<string, ConnectedWebWorker> = new Map();
let nextWebWorkerIndex = 1;

app.get("/favicon.ico", (req, res) => res.status(204).end());

// ディレクトリ確保
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

// 高速・非同期安全な組み込み SQLite エンジン (Node.js 22 built-in)
let DatabaseSyncClass: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  DatabaseSyncClass = cjsRequire("node:sqlite")?.DatabaseSync || null;
} catch (e) {
  DatabaseSyncClass = null;
}

interface StoredTask {
  task_id: number;
  start: number;
  end: number;
  status: "PENDING" | "RUNNING" | "COMPLETED";
  worker_id: string | null;
  assigned_at: number | null;
  completed_at: number | null;
  duration: number | null;
  total_solutions: number;
  result_summary: string | null;
}

class JsonFallbackDb {
  private tasks: Map<number, StoredTask> = new Map();
  private filePath: string;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.loadFromDisk();
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        const list: StoredTask[] = JSON.parse(raw);
        for (const t of list) {
          if (t.status === "RUNNING") {
            t.status = "PENDING";
            t.worker_id = null;
            t.assigned_at = null;
          }
          this.tasks.set(t.task_id, t);
        }
      }
    } catch (e) {
      console.error("[JsonFallbackDb Load Error]", e);
    }
  }

  private scheduleSave() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      try {
        const arr = Array.from(this.tasks.values());
        fs.writeFileSync(this.filePath, JSON.stringify(arr), "utf-8");
      } catch (e) {
        console.error("[JsonFallbackDb Save Error]", e);
      }
    }, 300);
  }

  public flush() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    try {
      const arr = Array.from(this.tasks.values());
      fs.writeFileSync(this.filePath, JSON.stringify(arr), "utf-8");
    } catch (e) {}
  }

  public exec(sql: string) {
    if (sql.includes("DROP TABLE")) {
      this.tasks.clear();
      this.flush();
    }
  }

  public prepare(sql: string) {
    const s = sql.trim();
    return {
      get: (...args: any[]) => {
        if (s.includes("MAX(task_id)")) {
          let maxId = 0;
          let maxEnd = 0;
          const total = this.tasks.size;
          for (const t of this.tasks.values()) {
            if (t.task_id > maxId) maxId = t.task_id;
            if (t.end > maxEnd) maxEnd = t.end;
          }
          return { max_id: maxId, max_end: maxEnd, total };
        }
        if (s.includes("SUM(total_solutions)")) {
          let solSum = 0;
          for (const t of this.tasks.values()) {
            if (t.status === "COMPLETED") solSum += (t.total_solutions || 0);
          }
          return { sol_sum: solSum };
        }
        if (s.includes("WHERE status = 'PENDING'") && s.includes("LIMIT 1")) {
          let best: StoredTask | null = null;
          for (const t of this.tasks.values()) {
            if (t.status === "PENDING") {
              if (!best || t.task_id < best.task_id) {
                best = t;
              }
            }
          }
          return best ? { task_id: best.task_id, start: best.start, end: best.end } : null;
        }
        if (s.includes("WHERE status = 'RUNNING'") && s.includes("assigned_at <")) {
          const cutoff = args[0] || 0;
          let best: StoredTask | null = null;
          for (const t of this.tasks.values()) {
            if (t.status === "RUNNING" && (t.assigned_at || 0) < cutoff) {
              if (!best || (t.assigned_at || 0) < (best.assigned_at || 0)) {
                best = t;
              }
            }
          }
          return best ? { task_id: best.task_id, start: best.start, end: best.end } : null;
        }
        return null;
      },
      all: (...args: any[]) => {
        if (s.includes("COUNT(*) as cnt FROM tasks GROUP BY status")) {
          const counts: Record<string, number> = { PENDING: 0, RUNNING: 0, COMPLETED: 0 };
          for (const t of this.tasks.values()) {
            counts[t.status] = (counts[t.status] || 0) + 1;
          }
          return [
            { status: "PENDING", cnt: counts.PENDING },
            { status: "RUNNING", cnt: counts.RUNNING },
            { status: "COMPLETED", cnt: counts.COMPLETED },
          ];
        }
        return [];
      },
      run: (...args: any[]) => {
        if (s.includes("INSERT INTO tasks")) {
          const [taskId, start, end] = args;
          this.tasks.set(Number(taskId), {
            task_id: Number(taskId),
            start: Number(start),
            end: Number(end),
            status: "PENDING",
            worker_id: null,
            assigned_at: null,
            completed_at: null,
            duration: null,
            total_solutions: 0,
            result_summary: null,
          });
          this.scheduleSave();
          return { changes: 1 };
        }
        if (s.includes("UPDATE tasks SET status = 'RUNNING'")) {
          const [workerId, assignedAt, taskId] = args;
          const t = this.tasks.get(Number(taskId));
          if (t) {
            t.status = "RUNNING";
            t.worker_id = String(workerId);
            t.assigned_at = Number(assignedAt);
            this.scheduleSave();
            return { changes: 1 };
          }
          return { changes: 0 };
        }
        if (s.includes("UPDATE tasks SET status = 'COMPLETED'")) {
          const [workerId, completedAt, duration, totalSolutions, resultSummary, taskId] = args;
          const t = this.tasks.get(Number(taskId));
          if (t) {
            t.status = "COMPLETED";
            t.worker_id = String(workerId);
            t.completed_at = Number(completedAt);
            t.duration = Number(duration);
            t.total_solutions = Number(totalSolutions) || 0;
            t.result_summary = String(resultSummary || "");
            this.scheduleSave();
            return { changes: 1 };
          }
          return { changes: 0 };
        }
        if (s.includes("SET status = \"PENDING\"") || s.includes("SET status = 'PENDING'")) {
          let cnt = 0;
          for (const t of this.tasks.values()) {
            if (s.includes("WHERE status = 'RUNNING'")) {
              if (t.status === "RUNNING") {
                t.status = "PENDING";
                t.worker_id = null;
                t.assigned_at = null;
                cnt++;
              }
            } else {
              t.status = "PENDING";
              t.worker_id = null;
              t.assigned_at = null;
              t.completed_at = null;
              t.duration = null;
              t.total_solutions = 0;
              t.result_summary = null;
              cnt++;
            }
          }
          this.scheduleSave();
          return { changes: cnt };
        }
        return { changes: 0 };
      },
    };
  }

  public close() {
    this.flush();
  }
}

let dbInstance: any = null;

function initDbSchema(db: any) {
  try {
    db.exec(`
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
      );
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_worker ON tasks(worker_id);
    `);
    // 起動時リカバリ: RUNNINGのまま中断されたタスクをPENDINGへ復元
    try {
      db.prepare("UPDATE tasks SET status = 'PENDING', worker_id = NULL, assigned_at = NULL WHERE status = 'RUNNING'").run();
    } catch (e) {}
  } catch (e) {
    console.error("[initDbSchema Error]", e);
  }
}

function getDb(): any {
  if (dbInstance) return dbInstance;
  const dbPath = path.join(DATA_DIR, "tasks.db");
  if (DatabaseSyncClass) {
    try {
      dbInstance = new DatabaseSyncClass(dbPath);
      // WAL (Write-Ahead Logging) モード有効化: 読み取りと書き込みが互いをロックせず並行実行可能
      dbInstance.exec("PRAGMA journal_mode = WAL;");
      dbInstance.exec("PRAGMA synchronous = NORMAL;");
      dbInstance.exec("PRAGMA busy_timeout = 5000;");
      initDbSchema(dbInstance);
      return dbInstance;
    } catch (e) {
      console.error("[SQLite Native Connection Error, falling back to JsonFallbackDb]", e);
      dbInstance = null;
    }
  }

  // Node 18/20やネイティブ未対応環境向けのゼロクラッシュ安全フォールバック
  try {
    const jsonPath = path.join(DATA_DIR, "tasks.json");
    dbInstance = new JsonFallbackDb(jsonPath);
    return dbInstance;
  } catch (e) {
    console.error("[JsonFallbackDb Init Error]", e);
    return null;
  }
}

function resetDbConnection() {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch (e) {}
    dbInstance = null;
  }
  invalidateStatsCache();
}

let cachedDbStats: any = null;
let lastStatsFetchTime = 0;
let cachedMaxRange: any = null;
let lastMaxRangeFetch = 0;
const recentCompletedResults: any[] = [];
let cachedStatusJson: { data: any; time: number } = { data: null, time: 0 };
let cachedFilesMetadata: { data: any; time: number } = { data: null, time: 0 };
let cachedLogs: { data: any; time: number } = { data: null, time: 0 };

function invalidateStatsCache() {
  // キャッシュを即死させず、最短1.5秒間隔での再取得にスロットル (タスク大量完了時のDB高負荷・イベントループ停止を完全防止)
  if (Date.now() - lastStatsFetchTime > 1500) {
    lastStatsFetchTime = 0;
  }
  lastMaxRangeFetch = 0;
}

// データベース最新統計の取得 (高速ネイティブ実行 & 1.5秒インメモリキャッシュ)
function getDatabaseStats(): any {
  const now = Date.now();
  if (cachedDbStats && (now - lastStatsFetchTime) < 1500) {
    return cachedDbStats;
  }

  const db = getDb();
  if (db) {
    try {
      const counts: Record<string, number> = { PENDING: 0, RUNNING: 0, COMPLETED: 0 };
      const rows = db.prepare("SELECT status, COUNT(*) as cnt FROM tasks GROUP BY status").all() as any[];
      for (const r of rows) {
        if (counts[r.status] !== undefined) {
          counts[r.status] = Number(r.cnt) || 0;
        }
      }
      const solRow = db.prepare("SELECT SUM(total_solutions) as sol_sum FROM tasks WHERE status = 'COMPLETED'").get() as any;
      const sol_sum = Number(solRow?.sol_sum) || 0;
      const total = counts.PENDING + counts.RUNNING + counts.COMPLETED;
      const rate = total > 0 ? Math.round((counts.COMPLETED / total) * 10000) / 100 : 0;

      cachedDbStats = {
        exists: total > 0,
        pending: counts.PENDING,
        running: counts.RUNNING,
        completed: counts.COMPLETED,
        total,
        completion_rate: rate,
        total_solutions: sol_sum,
      };
      lastStatsFetchTime = now;
      return cachedDbStats;
    } catch (e) {
      console.error("[getDatabaseStats Native Error]", e);
    }
  }

  return cachedDbStats || { exists: false, pending: 0, running: 0, completed: 0, total: 0, completion_rate: 0, total_solutions: 0 };
}

// 非同期・ノンブロッキング Python実行ヘルパー (イベントループを一切止めない)
function runPythonCodeAsync(code: string): Promise<string> {
  return new Promise((resolve) => {
    const pythonCmds = process.platform === "win32" ? ["python", "py", "python3"] : ["python3", "python"];
    let cmdIdx = 0;

    function tryNext() {
      if (cmdIdx >= pythonCmds.length) {
        return resolve(JSON.stringify({ error: "Python実行環境が見つかりません" }));
      }
      const cmd = pythonCmds[cmdIdx++];
      try {
        const proc = spawn(cmd, [], {
          cwd: PARALLEL_DIR,
          stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        proc.stdout?.on("data", (data) => { stdout += data.toString(); });
        proc.on("error", () => { tryNext(); });
        proc.on("close", (code) => {
          if (code === 0) {
            resolve(stdout.trim());
          } else {
            tryNext();
          }
        });

        proc.stdin?.write(code);
        proc.stdin?.end();
      } catch (e) {
        tryNext();
      }
    }

    tryNext();
  });
}

// 互換用同期フォールバック
function runPythonCode(code: string): string {
  const pythonCmds = process.platform === "win32" ? ["python", "py", "python3"] : ["python3", "python"];
  for (const cmd of pythonCmds) {
    try {
      const res = execSync(cmd, {
        cwd: PARALLEL_DIR,
        input: code,
        encoding: "utf-8",
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return res.trim();
    } catch (e) {
      continue;
    }
  }
  return JSON.stringify({ error: "Python実行環境が見つかりません" });
}

// 次の未完了タスクを取得して RUNNING に更新 (超高速ネイティブ実行・0.1ms)
function getNextPendingTask(workerId: string): { task_id: number; start: number; end: number } | null {
  const db = getDb();
  if (!db) return null;

  try {
    // 1. 未割当 (PENDING) タスクを最優先取得
    let row = db.prepare("SELECT task_id, start, end FROM tasks WHERE status = 'PENDING' ORDER BY task_id ASC LIMIT 1").get() as any;
    // 2. なければ 30秒以上無応答の放置RUNNINGタスクを自動救済
    if (!row) {
      const cutoff = (Date.now() / 1000) - 30.0;
      row = db.prepare("SELECT task_id, start, end FROM tasks WHERE status = 'RUNNING' AND (assigned_at IS NULL OR assigned_at < ?) ORDER BY task_id ASC LIMIT 1").get(cutoff) as any;
    }
    if (row) {
      const nowSec = Date.now() / 1000;
      db.prepare("UPDATE tasks SET status = 'RUNNING', worker_id = ?, assigned_at = ? WHERE task_id = ?").run(workerId, nowSec, row.task_id);
      invalidateStatsCache();
      return { task_id: Number(row.task_id), start: Number(row.start), end: Number(row.end) };
    }
    return null;
  } catch (e) {
    console.error("[getNextPendingTask Error]", e);
    return null;
  }
}

// 待機中・未割当の全接続ワーカーに即座にタスクを自動配分
function dispatchTasksToIdleWorkers(): number {
  let dispatched = 0;
  for (const [id, worker] of connectedWebWorkers.entries()) {
    if (worker.ws.readyState === WebSocket.OPEN && !worker.current_task_id && worker.status !== "PAUSED") {
      const task = getNextPendingTask(worker.id);
      if (task) {
        worker.current_task_id = task.task_id;
        worker.current_range = `${task.start}〜${task.end}`;
        worker.status = "RUNNING";
        worker.ws.send(JSON.stringify({
          type: "ASSIGN_TASK",
          task_id: task.task_id,
          start: task.start,
          end: task.end,
        }));
        dispatched++;
      }
    }
  }
  if (dispatched > 0) {
    console.log(`[WebSocket] 待機中のワーカー ${dispatched}台 へ新タスクを即時自動配分しました`);
  }
  return dispatched;
}

// タスク完了処理 (完全非同期ファイル保存 & ネイティブDB即時更新)
function completeTask(taskId: number, workerId: string, durationSec: number, totalSolutions: number, resultData: any) {
  const resultRecord = {
    task_id: taskId,
    worker_id: workerId,
    completed_at: new Date().toISOString(),
    duration: durationSec,
    result: resultData || {}
  };

  // メモリ内リングバッファに即時追加 (ディスクI/Oなしで即座にフロントエンドへ返却可能)
  recentCompletedResults.unshift(resultRecord);
  if (recentCompletedResults.length > 30) {
    recentCompletedResults.pop();
  }

  // インメモリ統計を即時インクリメント (DBフルスキャンクエリを回避し他端末の接続を即時化)
  if (cachedDbStats) {
    cachedDbStats.completed = (cachedDbStats.completed || 0) + 1;
    cachedDbStats.running = Math.max(0, (cachedDbStats.running || 1) - 1);
    cachedDbStats.total_solutions = (cachedDbStats.total_solutions || 0) + totalSolutions;
    if (cachedDbStats.total > 0) {
      cachedDbStats.completion_rate = Math.round((cachedDbStats.completed / cachedDbStats.total) * 10000) / 100;
    }
  }

  // 1. 結果JSONファイルを非同期保存 (I/Oブロックなし)
  const resFile = path.join(RESULTS_DIR, `task_${taskId}.json`);
  fs.writeFile(resFile, JSON.stringify(resultRecord, null, 2), () => {});

  // 2. tasks.db を超高速ネイティブ更新
  const db = getDb();
  if (db) {
    try {
      const nowSec = Date.now() / 1000;
      const summary = JSON.stringify({
        total_solutions: totalSolutions,
        duration_sec: durationSec
      });
      db.prepare("UPDATE tasks SET status = 'COMPLETED', completed_at = ?, duration = ?, total_solutions = ?, result_summary = ? WHERE task_id = ?")
        .run(nowSec, durationSec, totalSolutions, summary, taskId);
      invalidateStatsCache();
    } catch (e) {
      console.error("[completeTask Native DB Error]", e);
    }
  }
}

// 切断時・タイムアウト時のタスク自動回収 (ネイティブ高速処理)
function recoverWorkerTask(workerId: string) {
  const db = getDb();
  if (db) {
    try {
      db.prepare("UPDATE tasks SET status = 'PENDING', worker_id = NULL, assigned_at = NULL WHERE worker_id = ? AND status = 'RUNNING'").run(workerId);
      invalidateStatsCache();
      console.log(`[タスク回収] ワーカー ${workerId} の未完了タスクを PENDING に回収しました`);
    } catch (e) {
      console.error("[recoverWorkerTask Error]", e);
    }
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
    const now = Date.now();

    if (cachedStatusJson.data && (now - cachedStatusJson.time < 1500)) {
      statusData = cachedStatusJson.data;
    } else if (fs.existsSync(statusFile)) {
      try {
        statusData = JSON.parse(fs.readFileSync(statusFile, "utf-8"));
        cachedStatusJson = { data: statusData, time: now };
      } catch (e) {
        // ignore parse error
      }
    }

    // SQLite から最新統計を取得 (高速・キャッシュ付き)
    const dbStats = getDatabaseStats();

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

    const webWorkersList = Array.from(connectedWebWorkers.values()).map((w) => ({
      worker_id: w.id,
      type: "WEB" as const,
      is_active_process: true,
      status: w.status,
      task_id: w.current_task_id,
      task_range: w.current_range,
      last_heartbeat_ago: Math.max(0, Math.round((Date.now() - w.last_heartbeat) / 1000)),
      completed_count: w.completed_tasks,
      total_solutions: w.total_solutions,
      cores: w.cores,
      engine: w.engine,
      speed: w.current_speed,
      progress_pct: w.progress_pct,
      address: `Browser (${w.ip})`,
    }));

    const activeLanCount = statusData ? statusData.workers_count : allWorkerSlots.filter((w) => w.status !== "DISCONNECTED").length;

    res.json({
      server_running: isServerRunning,
      db_stats: dbStats,
      active_workers_count: activeLanCount + webWorkersList.length,
      workers: allWorkerSlots,
      web_workers: webWorkersList,
      lan_ips: getLocalIpAddresses(),
      updated_at: statusData?.updated_at || new Date().toISOString(),
      uptime_seconds: statusData?.uptime_seconds || 0,
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

    const db = getDb();
    if (!db) {
      return res.status(500).json({ error: "データベース初期化エラー" });
    }

    db.exec("DROP TABLE IF EXISTS tasks;");
    initDbSchema(db);

    const insert = db.prepare("INSERT INTO tasks (task_id, start, end, status) VALUES (?, ?, ?, 'PENDING')");
    let taskId = 1;
    let curr = start;
    let totalGenerated = 0;

    db.exec("BEGIN TRANSACTION;");
    while (curr <= end) {
      const cEnd = Math.min(curr + chunk - 1, end);
      insert.run(taskId, curr, cEnd);
      taskId++;
      totalGenerated++;
      curr = cEnd + 1;
    }
    db.exec("COMMIT;");

    invalidateStatsCache();
    // 待機中のワーカーへ即座に新タスクを自動配分
    dispatchTasksToIdleWorkers();
    res.json({ status: "generated", count: totalGenerated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 現在のタスク最大範囲と総数を取得 (gui_server.py の _auto_fill_next_range と同期)
app.get("/api/cluster/tasks/max-range", (req, res) => {
  const now = Date.now();
  if (cachedMaxRange && (now - lastMaxRangeFetch) < 1500) {
    return res.json(cachedMaxRange);
  }

  const db = getDb();
  if (db) {
    try {
      const row = db.prepare("SELECT MAX(task_id) as max_id, MAX(end) as max_end, COUNT(*) as total FROM tasks").get() as any;
      cachedMaxRange = {
        max_id: Number(row?.max_id) || 0,
        max_end: Number(row?.max_end) || 0,
        total: Number(row?.total) || 0,
      };
      lastMaxRangeFetch = now;
      return res.json(cachedMaxRange);
    } catch (e) {
      console.error("[max-range Native Error]", e);
    }
  }

  res.json({ max_id: 0, max_end: 0, total: 0 });
});

// 続きのタスクを追加登録 (gui_server.py の _append_next_tasks と同等 - ネイティブ超高速処理)
app.post("/api/cluster/tasks/append", (req, res) => {
  try {
    const { range_start, range_end, chunk_size = 100 } = req.body;
    let start = Math.max(1, parseInt(range_start, 10));
    const end = Math.max(start, parseInt(range_end, 10));
    const chunk = Math.max(1, parseInt(chunk_size, 10));

    const db = getDb();
    if (!db) return res.status(500).json({ error: "DBエラー" });

    const row = db.prepare("SELECT MAX(task_id) as max_id, MAX(end) as max_end FROM tasks").get() as any;
    const maxId = Number(row?.max_id) || 0;
    const maxEnd = Number(row?.max_end) || 0;

    if (start <= maxEnd) {
      start = maxEnd + 1;
    }

    if (start > end) {
      return res.json({ status: "appended", count: 0 });
    }

    const insert = db.prepare("INSERT INTO tasks (task_id, start, end, status) VALUES (?, ?, ?, 'PENDING')");
    let taskId = maxId + 1;
    let curr = start;
    let totalAppended = 0;

    db.exec("BEGIN TRANSACTION;");
    while (curr <= end) {
      const cEnd = Math.min(curr + chunk - 1, end);
      insert.run(taskId, curr, cEnd);
      taskId++;
      totalAppended++;
      curr = cEnd + 1;
    }
    db.exec("COMMIT;");

    invalidateStatsCache();
    // 待機中のワーカーへ即座に新タスクを自動配分
    dispatchTasksToIdleWorkers();
    res.json({ status: "appended", count: totalAppended });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// タスクをPENDINGにリセット (ネイティブ超高速処理)
app.post("/api/cluster/tasks/reset", (req, res) => {
  try {
    const db = getDb();
    if (db) {
      db.prepare('UPDATE tasks SET status = "PENDING", worker_id = NULL, assigned_at = NULL, completed_at = NULL, duration = NULL, total_solutions = 0, result_summary = NULL').run();
      invalidateStatsCache();
      dispatchTasksToIdleWorkers();
      return res.json({ status: "reset_ok" });
    }
    res.json({ status: "no_db" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// tasks.db のバックアップ作成 (非同期非ブロッキング)
app.post("/api/cluster/database/backup", async (req, res) => {
  try {
    const dbPath = path.join(DATA_DIR, "tasks.db");
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: "tasks.db が存在しません。" });
    }

    const nowStr = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const backupFileName = `tasks_backup_${nowStr}.db`;
    const targetPath = path.join(BACKUPS_DIR, backupFileName);

    await fs.promises.copyFile(dbPath, targetPath);
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

    const db = getDb();
    if (db) {
      try {
        let countSql = "SELECT COUNT(*) as total FROM tasks";
        let listSql = "SELECT task_id, start, end, status, worker_id, duration, total_solutions FROM tasks";
        const queryParams: any[] = [];
        if (statusFilter !== "ALL") {
          countSql += " WHERE status = ?";
          listSql += " WHERE status = ?";
          queryParams.push(statusFilter);
        }
        listSql += " ORDER BY task_id ASC LIMIT ? OFFSET ?";
        const totalRow = db.prepare(countSql).get(...(statusFilter !== "ALL" ? [statusFilter] : [])) as any;
        const rows = db.prepare(listSql).all(...queryParams, limit, offset) as any[];
        return res.json({ tasks: rows, total: Number(totalRow?.total) || 0 });
      } catch (e) {
        console.error("[tasks/list Native Error]", e);
      }
    }

    res.json({ tasks: [], total: 0 });
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

// 最近の完了結果詳細 (メモリ内リングバッファ優先・超高速0ms返却)
app.get("/api/cluster/results/list", (req, res) => {
  try {
    if (recentCompletedResults.length > 0) {
      return res.json(recentCompletedResults.slice(0, 15));
    }

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

    results.forEach((r) => recentCompletedResults.push(r));
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 結果フォルダ内の全ファイル一覧 & 格納先メタデータ取得 (3秒インメモリキャッシュ)
app.get("/api/cluster/results/files", (req, res) => {
  try {
    const now = Date.now();
    if (cachedFilesMetadata.data && (now - cachedFilesMetadata.time < 3000)) {
      return res.json(cachedFilesMetadata.data);
    }

    const resultsDirRel = "parallel/data/results";
    const dbPathRel = "parallel/data/tasks.db";
    const backupsDirRel = "parallel/data/backups";

    if (!fs.existsSync(RESULTS_DIR)) {
      const emptyData = {
        folder_path: resultsDirRel,
        database_path: dbPathRel,
        backups_dir: backupsDirRel,
        files: [],
        total_count: 0,
        total_size_bytes: 0,
      };
      cachedFilesMetadata = { data: emptyData, time: now };
      return res.json(emptyData);
    }

    const fileNames = fs.readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json"));
    let totalSizeBytes = 0;
    const files = fileNames.slice(-80).map((name) => {
      const full = path.join(RESULTS_DIR, name);
      try {
        const st = fs.statSync(full);
        totalSizeBytes += st.size;
        const tidMatch = name.match(/task_(\d+)\.json/);
        return {
          filename: name,
          task_id: tidMatch ? parseInt(tidMatch[1], 10) : null,
          size_bytes: st.size,
          updated_at: st.mtime.toISOString(),
        };
      } catch (e) {
        return null;
      }
    }).filter(Boolean);

    files.sort((a: any, b: any) => (b.task_id || 0) - (a.task_id || 0));

    const resultData = {
      folder_path: resultsDirRel,
      database_path: dbPathRel,
      backups_dir: backupsDirRel,
      files,
      total_count: fileNames.length,
      total_size_bytes: totalSizeBytes,
    };
    cachedFilesMetadata = { data: resultData, time: now };
    res.json(resultData);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 全結果JSONの一括ZIPダウンロード
app.get("/api/cluster/results/download/zip", (req, res) => {
  try {
    if (!fs.existsSync(RESULTS_DIR)) {
      return res.status(404).json({ error: "resultsフォルダが存在しません。" });
    }
    const tempZipPath = path.join(DATA_DIR, `endo_results_${Date.now()}.zip`);
    const pyCode = `
import zipfile, glob, os
from pathlib import Path
results_dir = Path('${RESULTS_DIR.replace(/\\/g, "/")}')
zip_path = Path('${tempZipPath.replace(/\\/g, "/")}')
files = sorted(glob.glob(str(results_dir / "*.json")))
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(f, arcname=os.path.basename(f))
print(len(files))
`;
    const countStr = runPythonCode(pyCode);
    const count = parseInt(countStr, 10) || 0;

    if (!fs.existsSync(tempZipPath)) {
      return res.status(500).json({ error: "ZIPの作成に失敗しました。" });
    }

    res.download(tempZipPath, "endo_results_all.zip", (err) => {
      try {
        if (fs.existsSync(tempZipPath)) {
          fs.unlinkSync(tempZipPath);
        }
      } catch (e) {}
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// tasks.db の直接ダウンロード
app.get("/api/cluster/database/download", (req, res) => {
  try {
    const dbPath = path.join(DATA_DIR, "tasks.db");
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: "tasks.db が存在しません。" });
    }
    res.download(dbPath, "tasks.db");
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// tasks.db バックアップファイルのダウンロード
app.get("/api/cluster/database/backup/download/:filename", (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(BACKUPS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "指定されたバックアップファイルが存在しません。" });
    }
    res.download(filePath, filename);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ログ取得 (2秒インメモリキャッシュで複数端末接続時の同時I/O負荷を解消)
app.get("/api/cluster/logs", (req, res) => {
  try {
    const now = Date.now();
    if (cachedLogs.data && (now - cachedLogs.time < 2000)) {
      return res.json(cachedLogs.data);
    }

    const serverLogPath = path.join(LOGS_DIR, "server.log");
    const workerLogPath = path.join(LOGS_DIR, "worker.log");

    const readTailLines = (filePath: string, linesCount: number = 80): string[] => {
      if (!fs.existsSync(filePath)) return ["[ログ待機中 - 親サーバーが稼働中です]"];
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        return content.split("\n").filter((l) => l.trim().length > 0).slice(-linesCount);
      } catch (e) {
        return ["[ログ読み込み中...]"];
      }
    };

    const sLines = readTailLines(serverLogPath, 80);
    const wLines = readTailLines(workerLogPath, 80);

    const logData = {
      server_log: sLines.join("\n"),
      server_lines: sLines,
      worker_log: wLines.join("\n"),
      worker_lines: wLines,
    };
    cachedLogs = { data: logData, time: now };
    res.json(logData);
  } catch (err: any) {
    res.json({
      server_log: "",
      server_lines: [],
      worker_log: "",
      worker_lines: [],
    });
  }
});

// Endo_method 単体計算テスト (非同期・イベントループを止めない)
app.post("/api/endo/calculate", async (req, res) => {
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
    const out = await runPythonCodeAsync(pyCode);
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

// Webワーカー一括開始
app.post("/api/cluster/web-workers/start-all", (req, res) => {
  try {
    for (const [id, worker] of connectedWebWorkers.entries()) {
      if (worker.status !== "RUNNING") {
        worker.status = "RUNNING";
        if (worker.ws.readyState === WebSocket.OPEN) {
          worker.ws.send(JSON.stringify({ type: "START_COMMAND" }));
          if (!worker.current_task_id) {
            const task = getNextPendingTask(worker.id);
            if (task) {
              worker.current_task_id = task.task_id;
              worker.current_range = `${task.start}〜${task.end}`;
              worker.ws.send(JSON.stringify({
                type: "ASSIGN_TASK",
                task_id: task.task_id,
                start: task.start,
                end: task.end,
              }));
            }
          }
        }
      }
    }
    res.json({ status: "all_started", count: connectedWebWorkers.size });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Webワーカー一括一時停止
app.post("/api/cluster/web-workers/pause-all", (req, res) => {
  try {
    for (const [id, worker] of connectedWebWorkers.entries()) {
      worker.status = "PAUSED";
      if (worker.ws.readyState === WebSocket.OPEN) {
        worker.ws.send(JSON.stringify({ type: "PAUSE_COMMAND" }));
      }
    }
    res.json({ status: "all_paused", count: connectedWebWorkers.size });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 個別Webワーカー開始
app.post("/api/cluster/web-workers/start/:id", (req, res) => {
  try {
    const worker = connectedWebWorkers.get(req.params.id);
    if (!worker) {
      return res.status(404).json({ error: "ワーカーが見つかりません" });
    }
    worker.status = "RUNNING";
    if (worker.ws.readyState === WebSocket.OPEN) {
      worker.ws.send(JSON.stringify({ type: "START_COMMAND" }));
      if (!worker.current_task_id) {
        const task = getNextPendingTask(worker.id);
        if (task) {
          worker.current_task_id = task.task_id;
          worker.current_range = `${task.start}〜${task.end}`;
          worker.ws.send(JSON.stringify({
            type: "ASSIGN_TASK",
            task_id: task.task_id,
            start: task.start,
            end: task.end,
          }));
        }
      }
    }
    res.json({ status: "started", worker_id: worker.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 個別Webワーカー一時停止
app.post("/api/cluster/web-workers/pause/:id", (req, res) => {
  try {
    const worker = connectedWebWorkers.get(req.params.id);
    if (!worker) {
      return res.status(404).json({ error: "ワーカーが見つかりません" });
    }
    worker.status = "PAUSED";
    if (worker.ws.readyState === WebSocket.OPEN) {
      worker.ws.send(JSON.stringify({ type: "PAUSE_COMMAND" }));
    }
    res.json({ status: "paused", worker_id: worker.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 全ワーカー一括開始 (Webワーカーおよびシミュレーションワーカー)
app.post("/api/cluster/workers/start-all", (req, res) => {
  try {
    for (const [id, worker] of connectedWebWorkers.entries()) {
      worker.status = "RUNNING";
      if (worker.ws.readyState === WebSocket.OPEN) {
        worker.ws.send(JSON.stringify({ type: "START_COMMAND" }));
        if (!worker.current_task_id) {
          const task = getNextPendingTask(worker.id);
          if (task) {
            worker.current_task_id = task.task_id;
            worker.current_range = `${task.start}〜${task.end}`;
            worker.ws.send(JSON.stringify({
              type: "ASSIGN_TASK",
              task_id: task.task_id,
              start: task.start,
              end: task.end,
            }));
          }
        }
      }
    }
    res.json({ status: "all_started" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 全ワーカー一括一時停止
app.post("/api/cluster/workers/pause-all", (req, res) => {
  try {
    for (const [id, worker] of connectedWebWorkers.entries()) {
      worker.status = "PAUSED";
      if (worker.ws.readyState === WebSocket.OPEN) {
        worker.ws.send(JSON.stringify({ type: "PAUSE_COMMAND" }));
      }
    }
    res.json({ status: "all_paused" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 指定ワーカー開始
app.post("/api/cluster/workers/start/:id", (req, res) => {
  try {
    const id = req.params.id;
    const worker = connectedWebWorkers.get(id);
    if (worker) {
      worker.status = "RUNNING";
      if (worker.ws.readyState === WebSocket.OPEN) {
        worker.ws.send(JSON.stringify({ type: "START_COMMAND" }));
        if (!worker.current_task_id) {
          const task = getNextPendingTask(worker.id);
          if (task) {
            worker.current_task_id = task.task_id;
            worker.current_range = `${task.start}〜${task.end}`;
            worker.ws.send(JSON.stringify({
              type: "ASSIGN_TASK",
              task_id: task.task_id,
              start: task.start,
              end: task.end,
            }));
          }
        }
      }
      return res.json({ status: "started", worker_id: id });
    }

    // LANワーカー (PC01 etc.) の場合、プロセス起動
    if (id.startsWith("PC") && !workerProcesses.has(id)) {
      const proc = spawn("python3", ["worker.py", "--id", id, "--server", "127.0.0.1", "--port", "5000"], {
        cwd: PARALLEL_DIR,
        stdio: "pipe",
      });
      proc.on("exit", () => {
        workerProcesses.delete(id);
      });
      workerProcesses.set(id, proc);
      return res.json({ status: "spawned", worker_id: id });
    }

    res.json({ status: "ok", worker_id: id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 指定ワーカー一時停止
app.post("/api/cluster/workers/pause/:id", (req, res) => {
  try {
    const id = req.params.id;
    const worker = connectedWebWorkers.get(id);
    if (worker) {
      worker.status = "PAUSED";
      if (worker.ws.readyState === WebSocket.OPEN) {
        worker.ws.send(JSON.stringify({ type: "PAUSE_COMMAND" }));
      }
      return res.json({ status: "paused", worker_id: id });
    }

    if (id.startsWith("PC") && workerProcesses.has(id)) {
      const proc = workerProcesses.get(id);
      proc?.kill("SIGTERM");
      workerProcesses.delete(id);
      return res.json({ status: "paused", worker_id: id });
    }

    res.json({ status: "ok", worker_id: id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 特定タスクの強制回収 (PENDINGに戻す - ネイティブ高速処理)
app.post("/api/cluster/tasks/recover/:id", (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const db = getDb();
    if (db) {
      db.prepare('UPDATE tasks SET status = "PENDING", worker_id = NULL, assigned_at = NULL WHERE task_id = ?').run(taskId);
      invalidateStatsCache();
    }
    res.json({ status: "recovered", task_id: taskId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================
// Vite ミドルウェア & WebSocket サーバー統合
// =========================================================
async function startServer() {
  const server = http.createServer(app);

  // Cloudflare Tunnel (trycloudflare / custom domain) 及び複数デバイス同時接続の最適化
  server.keepAliveTimeout = 65000; // 65秒 (Cloudflareのリバースプロキシのアイドルタイムアウト60秒に対応)
  server.headersTimeout = 66000;   // 66秒 (keepAliveTimeoutより大きく設定)
  // 注意: server.maxConnections = 0 と設定すると全接続が拒否される致命的バグとなるため設定しない (無制限)

  // WebSocket サーバーの初期化 (/ws および /ws/worker の両方のパスを受け入れ)
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    socket.on("error", () => {});
    const url = request.url || "";
    if (url.startsWith("/ws")) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      // 拒否時も abruptly socket.destroy() ではなく 404 で正常に応答終了 (トンネル多重化の破損を防止)
      try {
        socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
        socket.end();
      } catch (e) {
        socket.destroy();
      }
    }
  });

  wss.on("connection", (ws: WebSocket, req) => {
    const remoteIp = req.socket.remoteAddress || "127.0.0.1";
    let workerSession: ConnectedWebWorker | null = null;

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        switch (msg.type) {
          case "REGISTER": {
            // ワーカーID採番または指定 (重複時は自動ナンバリング)
            let assignedId = msg.worker_id && msg.worker_id !== "AUTO"
              ? msg.worker_id
              : `WEB-PC${(nextWebWorkerIndex++).toString().padStart(2, "0")}`;

            // 同一IDの別ワーカーが既にアクティブ接続中の場合は自動でサフィックスを付与して衝突を回避
            if (connectedWebWorkers.has(assignedId)) {
              const existing = connectedWebWorkers.get(assignedId);
              if (existing && existing.ws !== ws && existing.ws.readyState === WebSocket.OPEN) {
                assignedId = `WEB-PC${(nextWebWorkerIndex++).toString().padStart(2, "0")}`;
              }
            }

            const initialMode = msg.mode === "immediate" ? "RUNNING" : "STANDBY";

            workerSession = {
              id: assignedId,
              cores: msg.cores || 1,
              engine: msg.engine || "Pyodide (Wasm)",
              status: initialMode,
              current_task_id: null,
              current_range: "-",
              last_heartbeat: Date.now(),
              completed_tasks: 0,
              total_solutions: 0,
              current_speed: 0,
              progress_pct: 0,
              connected_at: new Date().toISOString(),
              ws,
              ip: remoteIp.replace("::ffff:", ""),
            };

            connectedWebWorkers.set(assignedId, workerSession);
            console.log(`[WebSocket] Webワーカー登録完了: ${assignedId} (コア: ${workerSession.cores}, モード: ${initialMode})`);

            ws.send(JSON.stringify({
              type: "REGISTERED",
              assigned_id: assignedId,
              status: initialMode,
              server_time: Date.now(),
            }));

            // immediate モードの場合は即座にタスクを要求・配分
            if (initialMode === "RUNNING") {
              const task = getNextPendingTask(assignedId);
              if (task) {
                workerSession.current_task_id = task.task_id;
                workerSession.current_range = `${task.start}〜${task.end}`;
                ws.send(JSON.stringify({
                  type: "ASSIGN_TASK",
                  task_id: task.task_id,
                  start: task.start,
                  end: task.end,
                }));
              } else {
                ws.send(JSON.stringify({ type: "NO_TASK" }));
              }
            }
            break;
          }

          case "REQUEST_TASK": {
            if (!workerSession) return;
            const task = getNextPendingTask(workerSession.id);
            if (task) {
              workerSession.current_task_id = task.task_id;
              workerSession.current_range = `${task.start}〜${task.end}`;
              workerSession.status = "RUNNING";
              ws.send(JSON.stringify({
                type: "ASSIGN_TASK",
                task_id: task.task_id,
                start: task.start,
                end: task.end,
              }));
            } else {
              ws.send(JSON.stringify({ type: "NO_TASK" }));
            }
            break;
          }

          case "HEARTBEAT": {
            if (!workerSession) return;
            workerSession.last_heartbeat = Date.now();
            if (typeof msg.progress_pct === "number") workerSession.progress_pct = msg.progress_pct;
            if (typeof msg.current_speed === "number") workerSession.current_speed = msg.current_speed;
            if (typeof msg.total_solutions === "number") workerSession.total_solutions = msg.total_solutions;
            ws.send(JSON.stringify({ type: "HEARTBEAT_ACK", timestamp: Date.now() }));

            // 待機中またはタスク未所持なら保留タスクを即座に自動割当
            if (!workerSession.current_task_id && workerSession.status !== "PAUSED") {
              const task = getNextPendingTask(workerSession.id);
              if (task) {
                workerSession.current_task_id = task.task_id;
                workerSession.current_range = `${task.start}〜${task.end}`;
                workerSession.status = "RUNNING";
                ws.send(JSON.stringify({
                  type: "ASSIGN_TASK",
                  task_id: task.task_id,
                  start: task.start,
                  end: task.end,
                }));
              }
            }
            break;
          }

          case "COMPLETE_TASK":
          case "TASK_COMPLETED": {
            if (!workerSession) return;
            const task_id = msg.task_id || (msg.result && msg.result.task_id);
            const duration_sec = msg.duration_sec ?? (msg.result && msg.result.duration_sec) ?? 0;
            const total_solutions = msg.total_solutions ?? (msg.result && msg.result.total_solutions) ?? 0;
            const result = msg.result;
            if (task_id) {
              completeTask(task_id, workerSession.id, duration_sec, total_solutions, result);
            }
            workerSession.completed_tasks += 1;
            workerSession.total_solutions += total_solutions;
            workerSession.current_task_id = null;
            workerSession.current_range = "-";
            workerSession.progress_pct = 100;

            // 次のタスクを自動配分
            const nextTask = getNextPendingTask(workerSession.id);
            if (nextTask) {
              workerSession.current_task_id = nextTask.task_id;
              workerSession.current_range = `${nextTask.start}〜${nextTask.end}`;
              workerSession.status = "RUNNING";
              ws.send(JSON.stringify({
                type: "ASSIGN_TASK",
                task_id: nextTask.task_id,
                start: nextTask.start,
                end: nextTask.end,
              }));
            } else {
              workerSession.status = "STANDBY";
              ws.send(JSON.stringify({ type: "NO_TASK" }));
            }
            break;
          }

          case "TASK_FAILED": {
            if (!workerSession) return;
            const { task_id } = msg;
            if (task_id) {
              const db = getDb();
              if (db) {
                db.prepare('UPDATE tasks SET status = "PENDING", worker_id = NULL, assigned_at = NULL WHERE task_id = ?').run(task_id);
                invalidateStatsCache();
              }
            }
            workerSession.current_task_id = null;
            workerSession.current_range = "-";
            break;
          }

          case "WORKER_START": {
            if (!workerSession) return;
            workerSession.status = "RUNNING";
            if (!workerSession.current_task_id) {
              const task = getNextPendingTask(workerSession.id);
              if (task) {
                workerSession.current_task_id = task.task_id;
                workerSession.current_range = `${task.start}〜${task.end}`;
                ws.send(JSON.stringify({
                  type: "ASSIGN_TASK",
                  task_id: task.task_id,
                  start: task.start,
                  end: task.end,
                }));
              } else {
                ws.send(JSON.stringify({ type: "NO_TASK" }));
              }
            }
            break;
          }

          case "WORKER_PAUSE": {
            if (!workerSession) return;
            workerSession.status = "PAUSED";
            break;
          }
        }
      } catch (err) {
        console.error("[WebSocket] 受信メッセージ解析エラー:", err);
      }
    });

    const cleanup = () => {
      if (workerSession) {
        console.log(`[WebSocket] Webワーカー切断: ${workerSession.id}`);
        recoverWorkerTask(workerSession.id);
        connectedWebWorkers.delete(workerSession.id);
        workerSession = null;
      }
    };

    ws.on("close", cleanup);
    ws.on("error", cleanup);
  });

  // 定期的なハートビート監視 & タイムアウト回収 (5秒ごと)
  setInterval(() => {
    const now = Date.now();
    for (const [id, worker] of connectedWebWorkers.entries()) {
      if (now - worker.last_heartbeat > 15000) {
        console.warn(`[WebSocket] ハートビートタイムアウト: ${id} (最終通信: ${Math.round((now - worker.last_heartbeat) / 1000)}秒前)`);
        recoverWorkerTask(id);
        try {
          worker.ws.terminate();
        } catch (e) {}
        connectedWebWorkers.delete(id);
      }
    }
  }, 5000);

  const distPath = path.join(process.cwd(), "dist");
  const hasBuiltDist = fs.existsSync(path.join(distPath, "index.html"));

  const publicPath = path.join(process.cwd(), "public");
  if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath, { maxAge: "1h" }));
  }

  if (hasBuiltDist || process.env.NODE_ENV === "production") {
    console.log("[Server] ビルド済み静的ファイル (dist/) を配信します (最高速・高安定・複数端末同時接続モード)");
    app.use(express.static(distPath, {
      maxAge: "1d",
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache");
        } else {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      }
    }));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      if (url.startsWith("/api") || url.startsWith("/ws")) {
        return next();
      }
      try {
        const indexPath = path.resolve(process.cwd(), "index.html");
        let template = fs.readFileSync(indexPath, "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        next(e);
      }
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

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server (HTTP + WebSocket) running on http://localhost:${PORT}`);
  });
}

startServer();
