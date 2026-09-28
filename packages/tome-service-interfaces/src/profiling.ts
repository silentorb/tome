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
  /** Advisory derived row estimate from maxMb (not the retention gate). */
  maxRows: number;
  /** Advisory derived batch delete row estimate from batchDeleteMb. */
  batchDeleteRows: number;
};

export const DEFAULT_SLOW_MS = 100;
export const DEFAULT_MAX_MB = 32;
export const DEFAULT_BATCH_DELETE_MB = 4;
/**
 * Bytes-per-span heuristic for advisory MB → row conversion and batch-size
 * estimates when the store has no rows yet (real retention uses used pages).
 */
export const BYTES_PER_SAMPLE_EST = 2048;
export const SQL_TRUNCATE = 800;
export const PROFILING_DB_FILENAME = "tome-profiling.sqlite";
export const PROFILING_SPANS_TABLE = "spans";

type ProfilingContext = {
  traceId: string;
  spanId: string | null;
  /** Sum of direct child durations (recorded or deferred) for residual_ms. */
  childDurationMs: number;
  /** Children below slowMs, flushed if this span is recorded. */
  deferredChildren: ProfilingSpan[];
};

const profilingAls = new AsyncLocalStorage<ProfilingContext>();

function newProfilingContext(traceId: string, spanId: string | null): ProfilingContext {
  return { traceId, spanId, childDurationMs: 0, deferredChildren: [] };
}

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
let lastProfilingWarnAt = 0;

function warnProfiling(message: string, err?: unknown): void {
  const now = Date.now();
  if (now - lastProfilingWarnAt < 5_000) return;
  lastProfilingWarnAt = now;
  const detail = err instanceof Error ? err.message : err != null ? String(err) : "";
  console.error(`[tome-profiling] ${message}${detail ? `: ${detail}` : ""}`);
}

export function mbToBytes(mb: number): number {
  if (!Number.isFinite(mb) || mb <= 0) return 0;
  return Math.floor(mb * 1024 * 1024);
}

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
  store?.setRetention(config.maxMb, config.batchDeleteMb);
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
  return profilingAls.run(newProfilingContext(id, null), fn);
}

/**
 * Run async `fn` under a profiling trace context.
 */
export function runInProfilingTraceAsync<T>(fn: () => Promise<T>, traceId?: string): Promise<T> {
  const id = traceId ?? newProfilingTraceId();
  return profilingAls.run(newProfilingContext(id, null), fn);
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

function appendProfilingSpan(full: ProfilingSpan): void {
  try {
    store?.append(full);
  } catch (err) {
    warnProfiling("span append failed", err);
  }
  if (config.logToStderr) {
    try {
      logSpanToStderr(full);
    } catch {
      // ignore stderr mirror failures
    }
  }
}

function finalizeCompletedSpan(
  span: Omit<ProfilingSpan, "startTime"> & { startTime?: string },
  selfCtx: ProfilingContext | undefined,
  parent: ProfilingContext | undefined,
): void {
  if (!config.enabled) return;

  try {
    const rounded = Math.round(span.durationMs * 100) / 100;
    const attrs: ProfilingAttributes = { ...(span.attributes ?? {}) };

    if (parent?.spanId) {
      parent.childDurationMs += rounded;
    }

    const meets = shouldRecord(rounded);
    if (meets && selfCtx) {
      const residual = Math.max(0, Math.round((rounded - selfCtx.childDurationMs) * 100) / 100);
      if (selfCtx.deferredChildren.length > 0 || selfCtx.childDurationMs > 0) {
        attrs.residual_ms = residual;
      }
    }

    const full: ProfilingSpan = {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      name: span.name,
      kind: span.kind,
      startTime: span.startTime ?? new Date().toISOString(),
      durationMs: rounded,
      attributes: attrs,
    };

    if (meets) {
      appendProfilingSpan(full);
      if (selfCtx) {
        for (const child of selfCtx.deferredChildren) {
          appendProfilingSpan(child);
        }
        selfCtx.deferredChildren.length = 0;
      }
    } else if (parent?.spanId) {
      parent.deferredChildren.push(full);
    }
  } catch (err) {
    warnProfiling("span finalize failed", err);
  }
}

/**
 * Record a completed span when profiling is enabled and the span is slow
 * (or verbose). Pass `{ force: true }` to bypass the slow threshold (used when
 * flushing deferred children of a recorded parent).
 */
export function recordProfilingSpan(
  span: Omit<ProfilingSpan, "startTime"> & { startTime?: string },
  options?: { force?: boolean },
): void {
  if (!config.enabled) return;
  if (!options?.force && !shouldRecord(span.durationMs)) return;

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
  appendProfilingSpan(full);
}

/**
 * Time `fn` as a nested span. Allocates span_id, sets ALS parent for children,
 * records on completion. When profiling is off, runs `fn` with no timers.
 *
 * Under non-verbose mode, children below `slowMs` are deferred and flushed if
 * this parent is recorded (keeps slow trees attributable).
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
  const selfCtx = newProfilingContext(traceId, spanId);

  const run = (): T => {
    try {
      return fn();
    } finally {
      finalizeCompletedSpan(
        {
          traceId,
          spanId,
          parentSpanId,
          name,
          kind,
          startTime,
          durationMs: performance.now() - started,
          attributes,
        },
        selfCtx,
        parent,
      );
    }
  };

  return profilingAls.run(selfCtx, run);
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
  const selfCtx = newProfilingContext(traceId, spanId);

  return profilingAls.run(selfCtx, async () => {
    try {
      return await fn();
    } finally {
      finalizeCompletedSpan(
        {
          traceId,
          spanId,
          parentSpanId,
          name,
          kind,
          startTime,
          durationMs: performance.now() - started,
          attributes,
        },
        selfCtx,
        parent,
      );
    }
  });
}

/**
 * Record a CLIENT (SQL) span from statement timing. Uses ALS for trace/parent
 * when present; synthesizes a root span otherwise. Below-threshold SQL under a
 * parent is deferred until that parent is recorded.
 */
export function recordSqlProfilingSpan(
  durationMs: number,
  attributes: ProfilingAttributes,
  name = "db.query",
): void {
  if (!config.enabled) return;
  const parent = profilingAls.getStore();
  finalizeCompletedSpan(
    {
      traceId: parent?.traceId ?? newProfilingTraceId(),
      spanId: newProfilingSpanId(),
      parentSpanId: parent?.spanId ?? null,
      name,
      kind: "CLIENT",
      durationMs,
      attributes: { "db.system": "sqlite", ...attributes },
    },
    undefined,
    parent,
  );
}

export class ProfilingStore {
  readonly dbPath: string;
  private readonly db: Database;
  private maxBytes: number;
  private batchDeleteBytes: number;
  private readonly insertStmt;
  private readonly countStmt;
  private readonly deleteBatchStmt;

  constructor(dbPath: string, retention?: { maxMb: number; batchDeleteMb: number }) {
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
    this.maxBytes = 0;
    this.batchDeleteBytes = 0;
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
    this.setRetention(
      retention?.maxMb ?? config.maxMb,
      retention?.batchDeleteMb ?? config.batchDeleteMb,
    );
  }

  setRetention(maxMb: number, batchDeleteMb: number): void {
    const max = maxMb > 0 ? maxMb : DEFAULT_MAX_MB;
    const batch = batchDeleteMb > 0 ? batchDeleteMb : DEFAULT_BATCH_DELETE_MB;
    this.maxBytes = Math.max(4096, mbToBytes(max));
    this.batchDeleteBytes = Math.max(4096, mbToBytes(batch));
    if (this.batchDeleteBytes > this.maxBytes) {
      this.batchDeleteBytes = this.maxBytes;
    }
  }

  /** Used logical bytes: allocated pages minus freelist. */
  usedBytes(): number {
    const pageSize = (this.db.prepare("PRAGMA page_size").get() as { page_size: number }).page_size;
    const pageCount = (this.db.prepare("PRAGMA page_count").get() as { page_count: number })
      .page_count;
    const freelist = (this.db.prepare("PRAGMA freelist_count").get() as { freelist_count: number })
      .freelist_count;
    return Math.max(0, (pageCount - freelist) * pageSize);
  }

  private batchDeleteRowEstimate(): number {
    const n = this.count();
    const used = this.usedBytes();
    const avg =
      n > 0 ? Math.max(BYTES_PER_SAMPLE_EST, Math.floor(used / n)) : BYTES_PER_SAMPLE_EST;
    return Math.max(1, Math.floor(this.batchDeleteBytes / avg));
  }

  /**
   * When at/over the soft ceiling, delete oldest batches until under headroom
   * (`maxBytes - batchDeleteBytes`). Never throws; stops on no progress or safety cap.
   */
  pruneForHeadroom(): number {
    if (this.usedBytes() < this.maxBytes) return 0;
    const target = Math.max(0, this.maxBytes - this.batchDeleteBytes);
    let iterations = 0;
    while (this.usedBytes() > target) {
      const beforeCount = this.count();
      if (beforeCount === 0) break;
      this.deleteBatchStmt.run(this.batchDeleteRowEstimate());
      iterations += 1;
      if (this.count() >= beforeCount) break;
      if (iterations > 10_000) {
        warnProfiling("prune exceeded iteration safety limit");
        break;
      }
    }
    return iterations;
  }

  /**
   * Check used size, prune when near/over the ceiling, then insert.
   * Skips insert (with warning) if still over ceiling after prune and rows remain.
   */
  append(span: ProfilingSpan): void {
    if (this.usedBytes() >= this.maxBytes) {
      this.pruneForHeadroom();
    }
    if (this.usedBytes() >= this.maxBytes && this.count() > 0) {
      warnProfiling("skipping span insert; store still at retention ceiling");
      return;
    }

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

    // Safety net only — primary gate is prune-before-insert.
    if (this.usedBytes() >= this.maxBytes) {
      this.pruneForHeadroom();
    }
  }

  count(): number {
    const row = this.countStmt.get() as { n: number };
    return row.n;
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
    store.setRetention(config.maxMb, config.batchDeleteMb);
  }
}

/** Open (or replace) the process-wide profiling store at `dbPath`. */
export function openProfilingStore(dbPath: string): ProfilingStore {
  const next = new ProfilingStore(dbPath, {
    maxMb: config.maxMb,
    batchDeleteMb: config.batchDeleteMb,
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

  const safeRecord = (durationMs: number, attributes: ProfilingAttributes): void => {
    try {
      recordSqlProfilingSpan(durationMs, attributes);
    } catch (err) {
      warnProfiling("sql span record failed", err);
    }
  };

  stmt.all = ((...params: SQLQueryBindings[]) => {
    if (!isProfilingEnabled()) return originalAll(...params);
    const started = performance.now();
    try {
      const rows = originalAll(...params);
      safeRecord(performance.now() - started, {
        "db.operation": "all",
        "db.statement": truncated,
        "db.rows": Array.isArray(rows) ? rows.length : 0,
        "db.params_count": params.length,
      });
      return rows;
    } catch (err) {
      safeRecord(performance.now() - started, {
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
      safeRecord(performance.now() - started, {
        "db.operation": "get",
        "db.statement": truncated,
        "db.rows": row == null ? 0 : 1,
        "db.params_count": params.length,
      });
      return row;
    } catch (err) {
      safeRecord(performance.now() - started, {
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
      safeRecord(performance.now() - started, {
        "db.operation": "run",
        "db.statement": truncated,
        "db.rows": typeof result?.changes === "number" ? result.changes : 0,
        "db.params_count": params.length,
      });
      return result;
    } catch (err) {
      safeRecord(performance.now() - started, {
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
