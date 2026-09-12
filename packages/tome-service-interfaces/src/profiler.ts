/** Opt-in request/SQL profiling shared by tome-http and tome-sqlite. */

export type ProfileSampleKind = "http" | "sql";

export type ProfileSample = {
  at: string;
  kind: ProfileSampleKind;
  ms: number;
  detail: string;
};

export type ProfileConfig = {
  /** When false, record/timing helpers are no-ops (callers should skip timers). */
  enabled: boolean;
  /** Log and buffer every sample, not only those >= slowMs. */
  verbose: boolean;
  /** Threshold in ms for slow samples (default 100). */
  slowMs: number;
};

const DEFAULT_SLOW_MS = 100;
const RING_SIZE = 50;
const SQL_TRUNCATE = 200;

let config: ProfileConfig = {
  enabled: false,
  verbose: false,
  slowMs: DEFAULT_SLOW_MS,
};

const samples: ProfileSample[] = [];

function readEnv(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function parseSlowMs(raw: string | undefined, fallback: number): number {
  if (raw == null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseProfileFlag(raw: string | undefined): { enabled: boolean; verbose: boolean } {
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

/**
 * Resolve profiler config from env, then apply optional overrides
 * (e.g. HTTP service `options.profile` / `options.slowMs`).
 */
export function resolveProfilerFromEnv(overrides?: {
  profile?: boolean | "verbose";
  slowMs?: number;
}): ProfileConfig {
  const fromEnv = parseProfileFlag(readEnv("TOME_PROFILE"));
  let enabled = fromEnv.enabled;
  let verbose = fromEnv.verbose;
  let slowMs = parseSlowMs(readEnv("TOME_SLOW_MS"), DEFAULT_SLOW_MS);

  if (overrides?.profile === true) {
    enabled = true;
  } else if (overrides?.profile === "verbose") {
    enabled = true;
    verbose = true;
  } else if (overrides?.profile === false) {
    enabled = false;
    verbose = false;
  }

  if (typeof overrides?.slowMs === "number" && Number.isFinite(overrides.slowMs) && overrides.slowMs >= 0) {
    slowMs = overrides.slowMs;
  }

  return { enabled, verbose, slowMs };
}

/** Apply config (typically once at HTTP/SQLite startup). */
export function configureProfiler(next: ProfileConfig): void {
  config = {
    enabled: next.enabled,
    verbose: next.verbose,
    slowMs: next.slowMs >= 0 ? next.slowMs : DEFAULT_SLOW_MS,
  };
}

export function getProfilerConfig(): ProfileConfig {
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

function pushSample(sample: ProfileSample): void {
  samples.push(sample);
  if (samples.length > RING_SIZE) {
    samples.splice(0, samples.length - RING_SIZE);
  }
}

/**
 * Record a timed sample when profiling is enabled and the sample is slow
 * (or verbose). Logs to stderr and appends to the ring buffer.
 */
export function recordProfileSample(kind: ProfileSampleKind, ms: number, detail: string): void {
  if (!config.enabled) return;
  const rounded = Math.round(ms * 100) / 100;
  if (!config.verbose && rounded < config.slowMs) return;

  const sample: ProfileSample = {
    at: new Date().toISOString(),
    kind,
    ms: rounded,
    detail,
  };
  pushSample(sample);

  const tag = kind === "http" ? "[tome-http]" : "[tome-sql]";
  console.error(`${tag} ${rounded}ms ${detail}`);
}

export function getProfileSnapshot(): {
  config: ProfileConfig;
  samples: ProfileSample[];
} {
  return {
    config: getProfilerConfig(),
    samples: samples.slice(),
  };
}

export function clearProfileSamples(): void {
  samples.length = 0;
}

/** Test helper: reset config and buffer. */
export function resetProfilerForTests(): void {
  config = { enabled: false, verbose: false, slowMs: DEFAULT_SLOW_MS };
  samples.length = 0;
}
