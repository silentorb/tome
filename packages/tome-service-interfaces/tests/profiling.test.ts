import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import {
  BYTES_PER_SAMPLE_EST,
  configureProfiling,
  deriveRowCaps,
  getProfilingConfig,
  getProfilingStore,
  isProfilingEnabled,
  mbToRows,
  openProfilingStore,
  recordProfilingSpan,
  resetProfilingForTests,
  resolveProfilingDbPath,
  resolveProfilingFromEnv,
  runInProfilingTrace,
  truncateSql,
  withProfilingSpan,
} from "../src/profiling";

describe("profiling", () => {
  const envKeys = [
    "TOME_PROFILING",
    "TOME_PROFILING_SLOW_MS",
    "TOME_PROFILING_LOG",
    "TOME_PROFILING_DB_PATH",
    "TOME_PROFILING_MAX_MB",
    "TOME_PROFILING_BATCH_DELETE_MB",
  ] as const;
  let tempDirs: string[] = [];

  afterEach(() => {
    resetProfilingForTests();
    for (const key of envKeys) delete process.env[key];
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    tempDirs = [];
  });

  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "tome-profiling-"));
    tempDirs.push(dir);
    return dir;
  }

  test("resolveProfilingFromEnv reads TOME_PROFILING* knobs", () => {
    process.env.TOME_PROFILING = "1";
    process.env.TOME_PROFILING_SLOW_MS = "50";
    process.env.TOME_PROFILING_MAX_MB = "16";
    process.env.TOME_PROFILING_BATCH_DELETE_MB = "2";
    process.env.TOME_PROFILING_LOG = "1";
    const cfg = resolveProfilingFromEnv();
    expect(cfg.enabled).toBe(true);
    expect(cfg.verbose).toBe(false);
    expect(cfg.slowMs).toBe(50);
    expect(cfg.maxMb).toBe(16);
    expect(cfg.batchDeleteMb).toBe(2);
    expect(cfg.logToStderr).toBe(true);
    expect(cfg.maxRows).toBe(deriveRowCaps(16, 2).maxRows);
    expect(cfg.batchDeleteRows).toBe(deriveRowCaps(16, 2).batchDeleteRows);

    process.env.TOME_PROFILING = "verbose";
    expect(resolveProfilingFromEnv().verbose).toBe(true);

    expect(resolveProfilingFromEnv({ profiling: false }).enabled).toBe(false);
    expect(resolveProfilingFromEnv({ profiling: true, slowMs: 10 }).enabled).toBe(true);
    expect(resolveProfilingFromEnv({ profiling: "verbose" }).verbose).toBe(true);
  });

  test("mbToRows and deriveRowCaps use the 512B heuristic", () => {
    expect(mbToRows(1)).toBe(Math.floor((1024 * 1024) / BYTES_PER_SAMPLE_EST));
    const caps = deriveRowCaps(32, 4);
    expect(caps.maxRows).toBeGreaterThanOrEqual(1_000);
    expect(caps.batchDeleteRows).toBeLessThanOrEqual(caps.maxRows);
  });

  test("resolveProfilingDbPath prefers env then neighbor of cache path", () => {
    process.env.TOME_PROFILING_DB_PATH = "/tmp/custom-profiling.sqlite";
    expect(resolveProfilingDbPath("/any/tome.sqlite")).toBe("/tmp/custom-profiling.sqlite");
    delete process.env.TOME_PROFILING_DB_PATH;
    const dir = tempDir();
    expect(resolveProfilingDbPath(join(dir, "tome.sqlite"))).toBe(
      join(dir, "tome-profiling.sqlite"),
    );
  });

  test("recordProfilingSpan is a no-op when disabled", () => {
    configureProfiling({
      ...resolveProfilingFromEnv(),
      enabled: false,
      verbose: false,
      slowMs: 0,
    });
    const dir = tempDir();
    openProfilingStore(join(dir, "tome-profiling.sqlite"));
    recordProfilingSpan({
      traceId: "a".repeat(32),
      spanId: "b".repeat(16),
      parentSpanId: null,
      name: "GET /api/x",
      kind: "SERVER",
      durationMs: 500,
      attributes: { "http.status_code": 200 },
    });
    expect(getProfilingStore()?.count()).toBe(0);
  });

  test("records slow spans into SQLite when enabled", () => {
    const dir = tempDir();
    configureProfiling({
      ...resolveProfilingFromEnv(),
      enabled: true,
      verbose: false,
      slowMs: 100,
      logToStderr: false,
    });
    openProfilingStore(join(dir, "tome-profiling.sqlite"));
    expect(isProfilingEnabled()).toBe(true);
    recordProfilingSpan({
      traceId: "a".repeat(32),
      spanId: "b".repeat(16),
      parentSpanId: null,
      name: "GET /api/fast",
      kind: "SERVER",
      durationMs: 50,
      attributes: {},
    });
    expect(getProfilingStore()?.count()).toBe(0);
    recordProfilingSpan({
      traceId: "a".repeat(32),
      spanId: "c".repeat(16),
      parentSpanId: null,
      name: "db.query",
      kind: "CLIENT",
      durationMs: 150,
      attributes: { "db.statement": "SELECT 1" },
    });
    expect(getProfilingStore()?.count()).toBe(1);
    const rows = getProfilingStore()!.queryAll<{ kind: string; duration_ms: number }>(
      "SELECT kind, duration_ms FROM spans",
    );
    expect(rows[0]?.kind).toBe("CLIENT");
    expect(rows[0]?.duration_ms).toBe(150);
  });

  test("verbose records every span", () => {
    const dir = tempDir();
    configureProfiling({
      ...resolveProfilingFromEnv(),
      enabled: true,
      verbose: true,
      slowMs: 1000,
      logToStderr: false,
    });
    openProfilingStore(join(dir, "tome-profiling.sqlite"));
    recordProfilingSpan({
      traceId: "a".repeat(32),
      spanId: "b".repeat(16),
      parentSpanId: null,
      name: "GET /api/health",
      kind: "SERVER",
      durationMs: 1,
      attributes: {},
    });
    expect(getProfilingStore()?.count()).toBe(1);
  });

  test("withProfilingSpan nests parent_span_id under a shared trace_id", () => {
    const dir = tempDir();
    configureProfiling({
      enabled: true,
      verbose: true,
      slowMs: 0,
      logToStderr: false,
      maxMb: 32,
      batchDeleteMb: 4,
      maxRows: 1,
      batchDeleteRows: 1,
    });
    openProfilingStore(join(dir, "tome-profiling.sqlite"));

    runInProfilingTrace(() => {
      withProfilingSpan("root", "INTERNAL", {}, () => {
        withProfilingSpan("child", "INTERNAL", { step: 1 }, () => "ok");
      });
    });

    const rows = getProfilingStore()!.queryAll<{
      name: string;
      trace_id: string;
      span_id: string;
      parent_span_id: string | null;
      attributes: string;
    }>("SELECT name, trace_id, span_id, parent_span_id, attributes FROM spans ORDER BY id ASC");
    expect(rows).toHaveLength(2);
    const child = rows.find((r) => r.name === "child")!;
    const root = rows.find((r) => r.name === "root")!;
    expect(child.trace_id).toBe(root.trace_id);
    expect(child.parent_span_id).toBe(root.span_id);
    expect(root.parent_span_id).toBeNull();
    expect(JSON.parse(child.attributes)).toEqual({ step: 1 });
  });

  test("slow parent flushes below-threshold children and sets residual_ms", () => {
    const dir = tempDir();
    configureProfiling({
      enabled: true,
      verbose: false,
      slowMs: 50,
      logToStderr: false,
      maxMb: 32,
      batchDeleteMb: 4,
      maxRows: 10_000,
      batchDeleteRows: 100,
    });
    openProfilingStore(join(dir, "tome-profiling.sqlite"));

    runInProfilingTrace(() => {
      withProfilingSpan("slow-parent", "INTERNAL", {}, () => {
        withProfilingSpan("fast-child", "INTERNAL", { step: 1 }, () => {
          const end = performance.now() + 5;
          while (performance.now() < end) {
            /* spin briefly */
          }
        });
        const end = performance.now() + 60;
        while (performance.now() < end) {
          /* ensure parent exceeds slowMs */
        }
      });
    });

    const rows = getProfilingStore()!.queryAll<{
      name: string;
      parent_span_id: string | null;
      attributes: string;
    }>("SELECT name, parent_span_id, attributes FROM spans ORDER BY id ASC");
    const parent = rows.find((r) => r.name === "slow-parent");
    const child = rows.find((r) => r.name === "fast-child");
    expect(parent).toBeDefined();
    expect(child).toBeDefined();
    expect(child!.parent_span_id).not.toBeNull();
    const parentAttrs = JSON.parse(parent!.attributes) as { residual_ms?: number };
    expect(typeof parentAttrs.residual_ms).toBe("number");
  });

  test("fast parent does not flush below-threshold children", () => {
    const dir = tempDir();
    configureProfiling({
      enabled: true,
      verbose: false,
      slowMs: 1000,
      logToStderr: false,
      maxMb: 32,
      batchDeleteMb: 4,
      maxRows: 10_000,
      batchDeleteRows: 100,
    });
    openProfilingStore(join(dir, "tome-profiling.sqlite"));

    runInProfilingTrace(() => {
      withProfilingSpan("fast-parent", "INTERNAL", {}, () => {
        withProfilingSpan("fast-child", "INTERNAL", {}, () => "ok");
      });
    });

    expect(getProfilingStore()?.count()).toBe(0);
  });

  test("opens spans table and drops legacy samples", () => {
    const dir = tempDir();
    const dbPath = join(dir, "tome-profiling.sqlite");
    const legacy = new Database(dbPath, { create: true });
    legacy.exec(`
      CREATE TABLE samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        kind TEXT NOT NULL,
        ms REAL NOT NULL,
        detail TEXT NOT NULL
      );
    `);
    legacy.prepare(`INSERT INTO samples (at, kind, ms, detail) VALUES (?, ?, ?, ?)`).run(
      new Date().toISOString(),
      "http",
      1,
      "legacy",
    );
    legacy.close();

    configureProfiling({
      enabled: true,
      verbose: true,
      slowMs: 0,
      logToStderr: false,
      maxMb: 32,
      batchDeleteMb: 4,
      maxRows: 1,
      batchDeleteRows: 1,
    });
    openProfilingStore(dbPath);
    const tables = getProfilingStore()!.queryAll<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
    );
    expect(tables.map((t) => t.name)).toContain("spans");
    expect(tables.map((t) => t.name)).not.toContain("samples");
  });

  test("batch-deletes oldest rows when over maxRows", () => {
    const dir = tempDir();
    configureProfiling({
      enabled: true,
      verbose: true,
      slowMs: 0,
      logToStderr: false,
      maxMb: 1,
      batchDeleteMb: 1,
      maxRows: 1,
      batchDeleteRows: 1,
    });
    const store = openProfilingStore(join(dir, "tome-profiling.sqlite"));
    store.setRetention(5, 3);
    for (let i = 0; i < 5; i++) {
      recordProfilingSpan({
        traceId: "a".repeat(32),
        spanId: `${i}`.padStart(16, "0"),
        parentSpanId: null,
        name: `row-${i}`,
        kind: "INTERNAL",
        durationMs: 1,
        attributes: { i },
      });
    }
    expect(store.count()).toBe(5);
    recordProfilingSpan({
      traceId: "a".repeat(32),
      spanId: "5".padStart(16, "0"),
      parentSpanId: null,
      name: "row-5",
      kind: "INTERNAL",
      durationMs: 1,
      attributes: {},
    });
    expect(store.count()).toBe(3);
    const names = store
      .queryAll<{ name: string }>("SELECT name FROM spans ORDER BY id ASC")
      .map((r) => r.name);
    expect(names).toEqual(["row-3", "row-4", "row-5"]);
  });

  test("getProfilingConfig exposes capacity fields", () => {
    configureProfiling({
      enabled: true,
      verbose: false,
      slowMs: 100,
      logToStderr: false,
      maxMb: 8,
      batchDeleteMb: 1,
      maxRows: 1,
      batchDeleteRows: 1,
    });
    const cfg = getProfilingConfig();
    expect(cfg.maxMb).toBe(8);
    expect(cfg.batchDeleteMb).toBe(1);
    expect(cfg.maxRows).toBe(deriveRowCaps(8, 1).maxRows);
    expect(cfg.batchDeleteRows).toBe(deriveRowCaps(8, 1).batchDeleteRows);
  });

  test("truncateSql collapses whitespace and caps length", () => {
    expect(truncateSql("SELECT   a\nFROM b", 20)).toBe("SELECT a FROM b");
    expect(truncateSql("x".repeat(50), 10)).toBe(`${"x".repeat(10)}…`);
  });
});
