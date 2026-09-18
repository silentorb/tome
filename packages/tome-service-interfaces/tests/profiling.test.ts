import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BYTES_PER_SAMPLE_EST,
  configureProfiling,
  deriveRowCaps,
  getProfilingConfig,
  getProfilingStore,
  isProfilingEnabled,
  mbToRows,
  openProfilingStore,
  recordProfilingSample,
  resetProfilingForTests,
  resolveProfilingDbPath,
  resolveProfilingFromEnv,
  truncateSql,
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

  test("recordProfilingSample is a no-op when disabled", () => {
    configureProfiling({
      ...resolveProfilingFromEnv(),
      enabled: false,
      verbose: false,
      slowMs: 0,
    });
    const dir = tempDir();
    openProfilingStore(join(dir, "tome-profiling.sqlite"));
    recordProfilingSample("http", 500, "GET /api/x → 200");
    expect(getProfilingStore()?.count()).toBe(0);
  });

  test("records slow samples into SQLite when enabled", () => {
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
    recordProfilingSample("http", 50, "GET /api/fast → 200");
    expect(getProfilingStore()?.count()).toBe(0);
    recordProfilingSample("sql", 150, "SELECT 1 (0 params)");
    expect(getProfilingStore()?.count()).toBe(1);
    const rows = getProfilingStore()!.queryAll<{ kind: string; ms: number }>(
      "SELECT kind, ms FROM samples",
    );
    expect(rows[0]?.kind).toBe("sql");
    expect(rows[0]?.ms).toBe(150);
  });

  test("verbose records every sample", () => {
    const dir = tempDir();
    configureProfiling({
      ...resolveProfilingFromEnv(),
      enabled: true,
      verbose: true,
      slowMs: 1000,
      logToStderr: false,
    });
    openProfilingStore(join(dir, "tome-profiling.sqlite"));
    recordProfilingSample("http", 1, "GET /api/health → 200");
    expect(getProfilingStore()?.count()).toBe(1);
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
    // Inject tiny caps so the test stays fast (MB heuristic would be huge).
    store.setRetention(5, 3);
    for (let i = 0; i < 5; i++) {
      recordProfilingSample("http", 1, `row-${i}`);
    }
    expect(store.count()).toBe(5);
    // 6th insert → count 6 > 5 → delete 3 oldest → 3 remain
    recordProfilingSample("http", 1, "row-5");
    expect(store.count()).toBe(3);
    const details = store
      .queryAll<{ detail: string }>("SELECT detail FROM samples ORDER BY id ASC")
      .map((r) => r.detail);
    expect(details).toEqual(["row-3", "row-4", "row-5"]);
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
