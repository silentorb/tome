/** Opt-in request/SQL profiling shared by tome-http and tome-sqlite. */

import { Database } from "bun:sqlite";
import { dirname, join, resolve } from "node:path";
import { mkdirSync } from "node:fs";

export type ProfilingSampleKind = "http" | "sql";

export type ProfilingSample = {
  at: string;
  kind: ProfilingSampleKind;
  ms: number;
  detail: string;
};

export type ProfilingConfig = {
  /** When false, record/timing helpers are no-ops (callers should skip timers). */
  enabled: boolean;
  /** Record every sample, not only those >= slowMs. */
  verbose: boolean;
  /** Threshold in ms for slow samples (default 100). */
  slowMs: number;
  /** Mirror samples to stderr when true (default false). Env: `TOME_PROFILING_LOG`. */
  logToStderr: boolean;
  /** Soft ceiling in MB (default 32). Env: `TOME_PROFILING_MAX_MB`. */
  maxMb: number;
  /** Batch delete size in MB when pruning (default 4). Env: `TOME_PROFILING_BATCH_DELETE_MB`. */
  batchDeleteMb: number;
  /** Derived row ceiling from maxMb. */
  maxRows: number;
  /** Derived batch delete row count from batchDeleteMb. */
  batchDeleteRows: number;
};

export const DEFAULT_SLOW_MS = 100;
export const DEFAULT_MAX_MB = 32;
export const DEFAULT_BATCH_DELETE_MB = 4;
/** Bytes-per-sample heuristic for MB → row conversion (row + detail + index overhead). */
export const BYTES_PER_SAMPLE_EST = 512;
export const SQL_TRUNCATE = 200;
export const PROFILING_DB_FILENAME = "tome-profiling.sqlite";

function defaultConfig(): ProfilingConfig {
  const caps = deriveRowCaps(DEFAULT_MAX_MB, DEFAULT_BATCH_DELETE_MB);
  return {
    enabled: false,
    verbose: false,
    slowMs: DEFAULT_SLOW_MS,
    logToStderr: false,
    maxMb: DEFAULT_MAX_MB,
    batchDeleteMb: DEFAULT_BATCH_DELETE_MB,
    maxRows: caps.maxRows,
    batchDeleteRows: caps.batchDeleteRows,
  };
}

let config: ProfilingConfig = defaultConfig();
let store: ProfilingStore | null = null;

function readEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function parseNonNegInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parsePositiveMb(raw: string | undefined, fallback: number): number {
  if (raw == null || raw === "") return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseProfilingFlag(raw: string | undefined): { enabled: boolean; verbose: boolean } {
  if (raw == null || raw === "") return { enabled: false, verbose: false };
  const v = raw.toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") {
    return { enabled: false, verbose: false };
  }
  if (v === "verbose" || v === "all") {
    return { enabled: true, verbose: true };
  }
  return { enabled: true, verbose: false };
}

function parseLogFlag(raw: string | undefined): boolean {
  if (raw == null || raw === "") return false;
  const v = raw.toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** Convert a MB budget to a row count using {@link BYTES_PER_SAMPLE_EST}. */
export function mbToRows(mb: number, minRows = 1): number {
  if (!Number.isFinite(mb) || mb <= 0) return minRows;
  return Math.max(minRows, Math.floor((mb * 1024 * 1024) / BYTES_PER_SAMPLE_EST));
}

export function deriveRowCaps(maxMb: number, batchDeleteMb: number): {
  maxRows: number;
  batchDeleteRows: number;
} {
  const maxRows = mbToRows(maxMb, 1_000);
  const batchDeleteRows = Math.min(maxRows, mbToRows(batchDeleteMb, 1));
  return { maxRows, batchDeleteRows };
}

/**
 * Resolve profiling DB path: `TOME_PROFILING_DB_PATH`, else
 * `dirname(cacheDbPath)/tome-profiling.sqlite`.
 */
export function resolveProfilingDbPath(cacheDbPath?: string): string {
  const fromEnv = readEnv("TOME_PROFILING_DB_PATH");
  if (fromEnv) return resolve(fromEnv);
  if (cacheDbPath != null && cacheDbPath.trim() !== "") {
    return join(dirname(resolve(cacheDbPath)), PROFILING_DB_FILENAME);
  }
  throw new Error(
    "Profiling DB path requires TOME_PROFILING_DB_PATH or a cache dbPath to derive a neighbor file",
  );
}

/**
 * Resolve profiling config from env, then apply optional overrides
 * (e.g. HTTP service `options.profiling` / `options.slowMs`).
 */
export function resolveProfilingFromEnv(overrides?: {
  profiling?: boolean | "verbose";
  slowMs?: number;
  maxMb?: number;
  batchDeleteMb?: number;
  logToStderr?: boolean;
}): ProfilingConfig {
  const fromEnv = parseProfilingFlag(readEnv("TOME_PROFILING"));
  let enabled = fromEnv.enabled;
  let verbose = fromEnv.verbose;
  let slowMs = parseNonNegInt(readEnv("TOME_PROFILING_SLOW_MS"), DEFAULT_SLOW_MS);
  let maxMb = parsePositiveMb(readEnv("TOME_PROFILING_MAX_MB"), DEFAULT_MAX_MB);
  let batchDeleteMb = parsePositiveMb(
    readEnv("TOME_PROFILING_BATCH_DELETE_MB"),
    DEFAULT_BATCH_DELETE_MB,
  );
  let logToStderr = parseLogFlag(readEnv("TOME_PROFILING_LOG"));

  if (overrides?.profiling === true) {
    enabled = true;
  } else if (overrides?.profiling === "verbose") {
    enabled = true;
    verbose = true;
  } else if (overrides?.profiling === false) {
    enabled = false;
    verbose = false;
  }

  if (typeof overrides?.slowMs === "number" && Number.isFinite(overrides.slowMs) && overrides.slowMs >= 0) {
    slowMs = overrides.slowMs;
  }
  if (typeof overrides?.maxMb === "number" && Number.isFinite(overrides.maxMb) && overrides.maxMb > 0) {
    maxMb = overrides.maxMb;
  }
  if (
    typeof overrides?.batchDeleteMb === "number" &&
    Number.isFinite(overrides.batchDeleteMb) &&
    overrides.batchDeleteMb > 0
  ) {
    batchDeleteMb = overrides.batchDeleteMb;
  }
  if (typeof overrides?.logToStderr === "boolean") {
    logToStderr = overrides.logToStderr;
  }

  const { maxRows, batchDeleteRows } = deriveRowCaps(maxMb, batchDeleteMb);
  return {
    enabled,
    verbose,
    slowMs,
    logToStderr,
    maxMb,
    batchDeleteMb,
    maxRows,
    batchDeleteRows,
  };
}

/** Apply config (typically once at HTTP/SQLite startup). Does not open the store. */
export function configureProfiling(next: ProfilingConfig): void {
  const maxMb = next.maxMb > 0 ? next.maxMb : DEFAULT_MAX_MB;
  const batchDeleteMb = next.batchDeleteMb > 0 ? next.batchDeleteMb : DEFAULT_BATCH_DELETE_MB;
  const caps = deriveRowCaps(maxMb, batchDeleteMb);
  config = {
    enabled: next.enabled,
    verbose: next.verbose,
    slowMs: next.slowMs >= 0 ? next.slowMs : DEFAULT_SLOW_MS,
    logToStderr: next.logToStderr,
    maxMb,
    batchDeleteMb,
    maxRows: caps.maxRows,
    batchDeleteRows: caps.batchDeleteRows,
  };
  store?.setRetention(config.maxRows, config.batchDeleteRows);
}

export function getProfilingConfig(): ProfilingConfig {
  return { ...config };
}

export function isProfilingEnabled(): boolean {
  return config.enabled;
}

export function truncateSql(sql: string, max = SQL_TRUNCATE): string {
  const oneLine = sql.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max)}…`;
}

export class ProfilingStore {
  readonly dbPath: string;
  private readonly db: Database;
  private maxRows: number;
  private batchDeleteRows: number;
  private readonly insertStmt;
  private readonly countStmt;
  private readonly deleteBatchStmt;

  constructor(dbPath: string, retention?: { maxRows: number; batchDeleteRows: number }) {
    this.dbPath = resolve(dbPath);
    mkdirSync(dirname(this.dbPath), { recursive: true });
    this.db = new Database(this.dbPath, { create: true });
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        kind TEXT NOT NULL,
        ms REAL NOT NULL,
        detail TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS samples_at ON samples(at);
      CREATE INDEX IF NOT EXISTS samples_kind_ms ON samples(kind, ms);
    `);
    this.maxRows = retention?.maxRows ?? config.maxRows;
    this.batchDeleteRows = retention?.batchDeleteRows ?? config.batchDeleteRows;
    this.insertStmt = this.db.prepare(
      `INSERT INTO samples (at, kind, ms, detail) VALUES (?, ?, ?, ?)`,
    );
    this.countStmt = this.db.prepare(`SELECT COUNT(*) AS n FROM samples`);
    this.deleteBatchStmt = this.db.prepare(
      `DELETE FROM samples WHERE id IN (
         SELECT id FROM samples ORDER BY id ASC LIMIT ?
       )`,
    );
  }

  setRetention(maxRows: number, batchDeleteRows: number): void {
    this.maxRows = maxRows;
    this.batchDeleteRows = Math.min(maxRows, Math.max(1, batchDeleteRows));
  }

  append(sample: ProfilingSample): void {
    this.insertStmt.run(sample.at, sample.kind, sample.ms, sample.detail);
    this.pruneIfNeeded();
  }

  count(): number {
    const row = this.countStmt.get() as { n: number };
    return row.n;
  }

  /** Delete oldest `batchDeleteRows` while over the ceiling. Returns prune iterations. */
  pruneIfNeeded(): number {
    let iterations = 0;
    while (this.count() > this.maxRows) {
      this.deleteBatchStmt.run(this.batchDeleteRows);
      iterations += 1;
      if (iterations > 10_000) {
        throw new Error("ProfilingStore prune exceeded iteration safety limit");
      }
    }
    return iterations;
  }

  queryAll<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params: readonly import("bun:sqlite").SQLQueryBindings[] = [],
  ): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  clear(): void {
    this.db.exec(`DELETE FROM samples`);
  }

  close(): void {
    this.db.close();
  }
}

export function getProfilingStore(): ProfilingStore | null {
  return store;
}

export function setProfilingStore(next: ProfilingStore | null): void {
  if (store && store !== next) {
    try {
      store.close();
    } catch {
      // ignore close errors when replacing
    }
  }
  store = next;
  if (store) {
    store.setRetention(config.maxRows, config.batchDeleteRows);
  }
}

/** Open (or replace) the process-wide profiling store at `dbPath`. */
export function openProfilingStore(dbPath: string): ProfilingStore {
  const next = new ProfilingStore(dbPath, {
    maxRows: config.maxRows,
    batchDeleteRows: config.batchDeleteRows,
  });
  setProfilingStore(next);
  return next;
}

/**
 * When profiling is enabled, ensure a store is open at the resolved path
 * (does not replace an existing store unless `force` is true).
 */
export function ensureProfilingStore(cacheDbPath?: string, force = false): ProfilingStore | null {
  if (!config.enabled) return store;
  if (store && !force) return store;
  return openProfilingStore(resolveProfilingDbPath(cacheDbPath));
}

/**
 * Record a timed sample when profiling is enabled and the sample is slow
 * (or verbose). Appends to the SQLite store when open; optionally logs to stderr.
 */
export function recordProfilingSample(
  kind: ProfilingSampleKind,
  ms: number,
  detail: string,
): void {
  if (!config.enabled) return;
  const rounded = Math.round(ms * 100) / 100;
  if (!config.verbose && rounded < config.slowMs) return;

  const sample: ProfilingSample = {
    at: new Date().toISOString(),
    kind,
    ms: rounded,
    detail,
  };
  store?.append(sample);

  if (config.logToStderr) {
    const tag = kind === "http" ? "[tome-http]" : "[tome-sql]";
    console.error(`${tag} ${rounded}ms ${detail}`);
  }
}

/** Test helper: reset config and close store. */
export function resetProfilingForTests(): void {
  config = defaultConfig();
  if (store) {
    try {
      store.close();
    } catch {
      // ignore
    }
  }
  store = null;
}
