import { afterEach, describe, expect, test } from "bun:test";
import {
  clearProfileSamples,
  configureProfiler,
  getProfileSnapshot,
  isProfilingEnabled,
  recordProfileSample,
  resetProfilerForTests,
  resolveProfilerFromEnv,
  truncateSql,
} from "../src/profiler";

describe("profiler", () => {
  afterEach(() => {
    resetProfilerForTests();
    delete process.env.TOME_PROFILE;
    delete process.env.TOME_SLOW_MS;
  });

  test("resolveProfilerFromEnv reads TOME_PROFILE and TOME_SLOW_MS", () => {
    process.env.TOME_PROFILE = "1";
    process.env.TOME_SLOW_MS = "50";
    expect(resolveProfilerFromEnv()).toEqual({
      enabled: true,
      verbose: false,
      slowMs: 50,
    });

    process.env.TOME_PROFILE = "verbose";
    expect(resolveProfilerFromEnv().verbose).toBe(true);

    expect(resolveProfilerFromEnv({ profile: false }).enabled).toBe(false);
    expect(resolveProfilerFromEnv({ profile: true, slowMs: 10 })).toEqual({
      enabled: true,
      verbose: true,
      slowMs: 10,
    });
  });

  test("recordProfileSample is a no-op when disabled", () => {
    configureProfiler({ enabled: false, verbose: false, slowMs: 0 });
    recordProfileSample("http", 500, "GET /api/x → 200");
    expect(getProfileSnapshot().samples).toEqual([]);
  });

  test("records slow samples into the ring buffer when enabled", () => {
    configureProfiler({ enabled: true, verbose: false, slowMs: 100 });
    expect(isProfilingEnabled()).toBe(true);
    recordProfileSample("http", 50, "GET /api/fast → 200");
    expect(getProfileSnapshot().samples).toEqual([]);
    recordProfileSample("sql", 150, "SELECT 1 (0 params)");
    const snap = getProfileSnapshot();
    expect(snap.samples).toHaveLength(1);
    expect(snap.samples[0]?.kind).toBe("sql");
    expect(snap.samples[0]?.ms).toBe(150);
    clearProfileSamples();
    expect(getProfileSnapshot().samples).toEqual([]);
  });

  test("verbose records every sample", () => {
    configureProfiler({ enabled: true, verbose: true, slowMs: 1000 });
    recordProfileSample("http", 1, "GET /api/health → 200");
    expect(getProfileSnapshot().samples).toHaveLength(1);
  });

  test("truncateSql collapses whitespace and caps length", () => {
    expect(truncateSql("SELECT   a\nFROM b", 20)).toBe("SELECT a FROM b");
    expect(truncateSql("x".repeat(50), 10)).toBe(`${"x".repeat(10)}…`);
  });
});
