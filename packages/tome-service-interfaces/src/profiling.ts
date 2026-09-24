/** Opt-in request/SQL profiling shared by tome-http and tome-sqlite.
 *
 * Storage and vocabulary align with OpenTelemetry span concepts (trace_id,
 * span_id, parent_span_id, SpanKind, attributes) without depending on the
 * OTel SDK or OTLP exporters.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { Database, type SQLQueryBindings } from "bun:sqlite";
import { dirname, join, resolve } from "node:path";
import { mkdirSync } from "node:fs";

/** OTel SpanKind subset used by Tome profiling. */
export type ProfilingSpanKind = "SERVER" | "CLIENT" | "INTERNAL";

export type ProfilingAttributes = Record<string, string | number | boolean>;

export type ProfilingSpan = {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  kind: ProfilingSpanKind;
  startTime: string;
  durationMs: number;
  attributes: ProfilingAttributes;
};

export type ProfilingConfig = {
  /** When false, record/timing helpers are no-ops (callers should skip timers). */
  enabled: boolean;
  /** Record every span, not only those >= slowMs. */
  verbose: boolean;
  /** Threshold in ms for slow spans (default 100). */
  slowMs: number;
  /** Mirror spans to stderr when true (default false). Env: `TOME_PROFILING_LOG`. */
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
/** Bytes-per-span heuristic for MB → row conversion (row + attrs + index overhead). */
export const BYTES_PER_SAMPLE_EST = 512;
export const SQL_TRUNCATE = 800;
export const PROFILING_DB_FILENAME = "tome-profiling.sqlite";
export const PROFILING_SPANS_TABLE = "spans";

type ProfilingContext = {
  traceId: string;
  spanId: string | null;
};

const profilingAls = new AsyncLocalStorage<ProfilingContext>();

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

/** 16-byte trace id as 32 lowercase hex chars (OTel / W3C shape). */
export function newProfilingTraceId(): string {
  return randomBytes(16).toString("hex");
}

/** 8-byte span id as 16 lowercase hex chars. */
export function newProfilingSpanId(): string {
  return randomBytes(8).toString("hex");
}

export function getProfilingContext(): ProfilingContext | undefined {
  return profilingAls.getStore();
}

/**
 * Run `fn` under a profiling trace context. Nested spans inherit `traceId`.
 * Does not record a span by itself.
 */
export function runInProfilingTrace<T>(fn: () => T, traceId?: string): T {
  const id = traceId ?? newProfilingTraceId();
  return profilingAls.run({ traceId: id, spanId: null }, fn);
}

/**
 * Run async `fn` under a profiling trace context.
 */
export function runInProfilingTraceAsync<T>(fn: () => Promise<T>, traceId?: string): Promise<T> {
  const id = traceId ?? newProfilingTraceId();
  return profilingAls.run({ traceId: id, spanId: null }, fn);
}

function shouldRecord(durationMs: number): boolean {
  if (!config.enabled) return false;
  if (config.verbose) return true;
  return durationMs >= config.slowMs;
}

function logSpanToStderr(span: ProfilingSpan): void {
  const tag =
    span.kind === "SERVER" ? "[tome-http]" : span.kind === "CLIENT" ? "[tome-sql]" : "[tome-phase]";
  const attrKeys = Object.keys(span.attributes);
  const attrPreview =
    attrKeys.length === 0
      ? ""
      : ` ${attrKeys
          .slice(0, 4)
          .map((k) => `${k}=${JSON.stringify(span.attributes[k])}`)
          .join(" ")}`;
  console.error(
    `${tag} ${span.durationMs}ms ${span.kind} ${span.name} trace=${span.traceId} span=${span.spanId}${
      span.parentSpanId ? ` parent=${span.parentSpanId}` : ""
    }${attrPreview}`,
  );
}

/**
 * Record a completed span when profiling is enabled and the span is slow
 * (or verbose). Appends to the SQLite store when open; optionally logs to stderr.
 */
export function recordProfilingSpan(span: Omit<ProfilingSpan, "startTime"> & { startTime?: string }): void {
  if (!shouldRecord(span.durationMs)) return;

  const rounded = Math.round(span.durationMs * 100) / 100;
  const full: ProfilingSpan = {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    name: span.name,
    kind: span.kind,
    startTime: span.startTime ?? new Date().toISOString(),
    durationMs: rounded,
    attributes: span.attributes ?? {},
  };
  store?.append(full);

  if (config.logToStderr) {
    logSpanToStderr(full);
  }
}

/**
 * Time `fn` as a nested span. Allocates span_id, sets ALS parent for children,
 * records on completion. When profiling is off, runs `fn` with no timers.
 */
export function withProfilingSpan<T>(
  name: string,
  kind: ProfilingSpanKind,
  attributes: ProfilingAttributes,
  fn: () => T,
): T {
  if (!config.enabled) return fn();

  const parent = profilingAls.getStore();
  const traceId = parent?.traceId ?? newProfilingTraceId();
  const spanId = newProfilingSpanId();
  const parentSpanId = parent?.spanId ?? null;
  const startTime = new Date().toISOString();
  const started = performance.now();

  const run = (): T => {
    try {
      return fn();
    } finally {
      recordProfilingSpan({
        traceId,
        spanId,
        parentSpanId,
        name,
        kind,
        startTime,
        durationMs: performance.now() - started,
        attributes,
      });
    }
  };

  return profilingAls.run({ traceId, spanId }, run);
}

/**
 * Async variant of {@link withProfilingSpan}.
 */
export async function withProfilingSpanAsync<T>(
  name: string,
  kind: ProfilingSpanKind,
  attributes: ProfilingAttributes,
  fn: () => Promise<T>,
): Promise<T> {
  if (!config.enabled) return fn();

  const parent = profilingAls.getStore();
  const traceId = parent?.traceId ?? newProfilingTraceId();
  const spanId = newProfilingSpanId();
  const parentSpanId = parent?.spanId ?? null;
  const startTime = new Date().toISOString();
  const started = performance.now();

  return profilingAls.run({ traceId, spanId }, async () => {
    try {
      return await fn();
    } finally {
      recordProfilingSpan({
        traceId,
        spanId,
        parentSpanId,
        name,
        kind,
        startTime,
        durationMs: performance.now() - started,
        attributes,
      });
    }
  });
}

/**
 * Record a CLIENT (SQL) span from statement timing. Uses ALS for trace/parent
 * when present; synthesizes a root span otherwise.
 */
export function recordSqlProfilingSpan(
  durationMs: number,
  attributes: ProfilingAttributes,
  name = "db.query",
): void {
  if (!shouldRecord(durationMs)) return;
  const parent = profilingAls.getStore();
  recordProfilingSpan({
    traceId: parent?.traceId ?? newProfilingTraceId(),
    spanId: newProfilingSpanId(),
    parentSpanId: parent?.spanId ?? null,
    name,
    kind: "CLIENT",
    durationMs,
    attributes: { "db.system": "sqlite", ...attributes },
  });
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
    // Prototypal: drop legacy `samples` table if present (disposable diagnostic DB).
    const tables = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('samples', 'spans')`)
      .all() as { name: string }[];
    const names = new Set(tables.map((t) => t.name));
    if (names.has("samples")) {
      this.db.exec(`DROP TABLE samples`);
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS spans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trace_id TEXT NOT NULL,
        span_id TEXT NOT NULL,
        parent_span_id TEXT,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        start_time TEXT NOT NULL,
        duration_ms REAL NOT NULL,
        attributes TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS spans_trace_id ON spans(trace_id);
      CREATE INDEX IF NOT EXISTS spans_start_time ON spans(start_time);
      CREATE INDEX IF NOT EXISTS spans_kind_duration ON spans(kind, duration_ms);
    `);
    this.maxRows = retention?.maxRows ?? config.maxRows;
    this.batchDeleteRows = retention?.batchDeleteRows ?? config.batchDeleteRows;
    this.insertStmt = this.db.prepare(
      `INSERT INTO spans (
         trace_id, span_id, parent_span_id, name, kind, start_time, duration_ms, attributes
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.countStmt = this.db.prepare(`SELECT COUNT(*) AS n FROM spans`);
    this.deleteBatchStmt = this.db.prepare(
      `DELETE FROM spans WHERE id IN (
         SELECT id FROM spans ORDER BY id ASC LIMIT ?
       )`,
    );
  }

  setRetention(maxRows: number, batchDeleteRows: number): void {
    this.maxRows = maxRows;
    this.batchDeleteRows = Math.min(maxRows, Math.max(1, batchDeleteRows));
  }

  append(span: ProfilingSpan): void {
    this.insertStmt.run(
      span.traceId,
      span.spanId,
      span.parentSpanId,
      span.name,
      span.kind,
      span.startTime,
      span.durationMs,
      JSON.stringify(span.attributes ?? {}),
    );
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
    this.db.exec(`DELETE FROM spans`);
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
 * Wrap a bun:sqlite `Database` so `.prepare(…).all/get/run` emit CLIENT spans
 * when profiling is enabled (checked at execute time). Safe to call once at
 * GraphDatabase construction; cost when off is one boolean check per execute.
 */
export function instrumentSqliteDatabaseForProfiling(db: Database): Database {
  const originalPrepare = db.prepare.bind(db);
  const prepareInstrumented = ((sql: string, params?: SQLQueryBindings) => {
    const stmt =
      params === undefined ? originalPrepare(sql) : originalPrepare(sql, params);
    return wrapSqliteStatementForProfiling(stmt, sql);
  }) as Database["prepare"];
  (db as { prepare: Database["prepare"] }).prepare = prepareInstrumented;
  return db;
}

type SqliteStatement = ReturnType<Database["prepare"]>;

function wrapSqliteStatementForProfiling(stmt: SqliteStatement, sql: string): SqliteStatement {
  const truncated = truncateSql(sql);
  const originalAll = stmt.all.bind(stmt);
  const originalGet = stmt.get.bind(stmt);
  const originalRun = stmt.run.bind(stmt);

  stmt.all = ((...params: SQLQueryBindings[]) => {
    if (!isProfilingEnabled()) return originalAll(...params);
    const started = performance.now();
    try {
      const rows = originalAll(...params);
      recordSqlProfilingSpan(performance.now() - started, {
        "db.operation": "all",
        "db.statement": truncated,
        "db.rows": Array.isArray(rows) ? rows.length : 0,
        "db.params_count": params.length,
      });
      return rows;
    } catch (err) {
      recordSqlProfilingSpan(performance.now() - started, {
        "db.operation": "all",
        "db.statement": truncated,
        "db.params_count": params.length,
        "db.error": true,
      });
      throw err;
    }
  }) as typeof stmt.all;

  stmt.get = ((...params: SQLQueryBindings[]) => {
    if (!isProfilingEnabled()) return originalGet(...params);
    const started = performance.now();
    try {
      const row = originalGet(...params);
      recordSqlProfilingSpan(performance.now() - started, {
        "db.operation": "get",
        "db.statement": truncated,
        "db.rows": row == null ? 0 : 1,
        "db.params_count": params.length,
      });
      return row;
    } catch (err) {
      recordSqlProfilingSpan(performance.now() - started, {
        "db.operation": "get",
        "db.statement": truncated,
        "db.params_count": params.length,
        "db.error": true,
      });
      throw err;
    }
  }) as typeof stmt.get;

  stmt.run = ((...params: SQLQueryBindings[]) => {
    if (!isProfilingEnabled()) return originalRun(...params);
    const started = performance.now();
    try {
      const result = originalRun(...params);
      recordSqlProfilingSpan(performance.now() - started, {
        "db.operation": "run",
        "db.statement": truncated,
        "db.rows": typeof result?.changes === "number" ? result.changes : 0,
        "db.params_count": params.length,
      });
      return result;
    } catch (err) {
      recordSqlProfilingSpan(performance.now() - started, {
        "db.operation": "run",
        "db.statement": truncated,
        "db.params_count": params.length,
        "db.error": true,
      });
      throw err;
    }
  }) as typeof stmt.run;

  return stmt;
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
