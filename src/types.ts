export type WorkerStatus = "CONNECTED" | "RUNNING" | "WAITING" | "DISCONNECTED";

export interface WorkerSlot {
  worker_id: string;
  is_active_process: boolean;
  status: WorkerStatus;
  task_id: number | null;
  task_range: string;
  last_heartbeat_ago: number | null;
  completed_count: number;
  address: string;
}

export interface WebWorkerSlot {
  worker_id: string;
  type: "WEB";
  is_active_process: boolean;
  status: "STANDBY" | "RUNNING" | "PAUSED" | "DISCONNECTED";
  task_id: number | null;
  task_range: string;
  last_heartbeat_ago: number | null;
  completed_count: number;
  total_solutions: number;
  cores: number;
  engine: string;
  speed: number;
  progress_pct: number;
  address: string;
}

export interface DbStats {
  exists: boolean;
  pending: number;
  running: number;
  completed: number;
  total: number;
  completion_rate: number;
  total_solutions: number;
}

export interface ClusterStatus {
  server_running: boolean;
  db_stats: DbStats;
  active_workers_count: number;
  workers: WorkerSlot[];
  web_workers?: WebWorkerSlot[];
  lan_ips?: string[];
  updated_at: string;
  uptime_seconds: number;
}

export interface TaskItem {
  task_id: number;
  start: number;
  end: number;
  status: "PENDING" | "RUNNING" | "COMPLETED";
  worker_id: string | null;
  duration: number | null;
  total_solutions: number;
}

export interface TaskResult {
  task_id: number;
  worker_id: string;
  completed_at: string;
  duration: number;
  result: {
    start: number;
    end: number;
    count: number;
    total_solutions: number;
    solvable_count: number;
    sample_solutions: Record<string, number[]>;
    duration_sec: number;
  };
}

export interface EndoResult {
  n: number;
  solutions: number[];
  count: number;
  duration_ms: number;
  theta_terms: [number, number][];
  m_decompositions: [number, number][][];
}
