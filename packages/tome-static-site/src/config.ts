import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultDbPathForContent, resolveContentPath } from "tome-db/content";

export interface ResolvedConfig {
  repoRoot: string;
  contentDir: string;
  dbPath: string;
  outDir: string;
  base: string;
}

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_REPO = resolve(PACKAGE_ROOT, "../..");

function envString(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env[name];
}

export interface ArgParseResult {
  help: boolean;
  kv: Map<string, string | boolean>;
}

function parseArgKv(argv: string[]): ArgParseResult {
  const kv = new Map<string, string | boolean>();
  let i = 0;
  let help = false;
  while (i < argv.length) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") {
      help = true;
      i += 1;
      continue;
    }
    if (a === "--") {
      i += 1;
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq !== -1) {
        kv.set(a.slice(2, eq), a.slice(eq + 1));
        i += 1;
        continue;
      }
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("-")) {
        kv.set(k, true);
        i += 1;
      } else {
        kv.set(k, next);
        i += 2;
      }
      continue;
    }
    i += 1;
  }
  return { help, kv };
}

function resolvePathArg(path: string | undefined, repoRoot: string): string | undefined {
  if (!path) return undefined;
  return resolve(path.startsWith("/") ? path : join(repoRoot, path));
}

function normalizeBase(base: string): string {
  if (!base || base === "/") return "/";
  return base.endsWith("/") ? base : `${base}/`;
}

function buildResolvedConfig(
  kv: Map<string, string | boolean>,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedConfig {
  const rawRepo = kv.get("repo");
  const repoFromCli = typeof rawRepo === "string" ? rawRepo : undefined;
  const repoRoot = resolve(repoFromCli ?? DEFAULT_REPO);

  const rawContent = kv.get("content-dir");
  const contentFromCli = typeof rawContent === "string" ? rawContent : undefined;
  const contentDir = resolvePathArg(
    contentFromCli ?? envString("TOME_CONTENT_PATH", env),
    repoRoot,
  ) ?? resolveContentPath(repoRoot);

  const rawDb = kv.get("db-path");
  const dbFromCli = typeof rawDb === "string" ? rawDb : undefined;
  const dbPath =
    resolvePathArg(dbFromCli, repoRoot) ??
    envString("TOME_DB_PATH", env) ??
    defaultDbPathForContent(contentDir);

  const rawOut = kv.get("out-dir");
  const outFromCli = typeof rawOut === "string" ? rawOut : undefined;
  const outDir =
    resolvePathArg(outFromCli ?? envString("TOME_WEB_OUT_DIR", env), repoRoot) ??
    resolve(repoRoot, "dist/web");

  const rawBase = kv.get("base");
  const baseFromCli = typeof rawBase === "string" ? rawBase : undefined;
  const base = normalizeBase(baseFromCli ?? envString("TOME_WEB_BASE", env) ?? "/");

  return { repoRoot, contentDir, dbPath, outDir, base };
}

export function readConfig(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): { help: true } | { help: false; config: ResolvedConfig } {
  const { help, kv } = parseArgKv(argv);
  if (help) return { help: true };
  return { help: false, config: buildResolvedConfig(kv, env) };
}

/** Set process env for Astro build and content loader. */
export function applyBuildEnv(config: ResolvedConfig, env: NodeJS.ProcessEnv = process.env): void {
  env.TOME_CONTENT_PATH = config.contentDir;
  env.TOME_DB_PATH = config.dbPath;
  env.TOME_WEB_OUT_DIR = config.outDir;
  env.TOME_WEB_BASE = config.base;
  env.MARLOTH_CONTENT_PATH = config.contentDir;
  env.MARLOTH_DB_PATH = config.dbPath;
  env.MARLOTH_WEB_OUT_DIR = config.outDir;
  env.MARLOTH_WEB_BASE = config.base;
}

export function printHelp(): void {
  const lines = [
    "tome-static-site — generate static HTML from content/ nodes",
    "",
    "Usage: web:build [options]",
    "",
    "Options (CLI overrides environment):",
    "  --repo <path>          Repository root (default: repository root)",
    "  --content-dir <path>   Content directory (default: ./content)",
    "  --db-path <path>       SQLite cache path (default: data/tome.sqlite)",
    "  --out-dir <path>       Output directory (default: dist/web)",
    "  --base <path>          Site base path for embedding (default: /)",
    "  -h, --help",
    "",
    "Environment:",
    "  TOME_CONTENT_PATH      Content directory when --content-dir is omitted",
    "  TOME_DB_PATH           SQLite cache path when --db-path is omitted",
    "  TOME_WEB_OUT_DIR       Output directory when --out-dir is omitted",
    "  TOME_WEB_BASE          Site base path when --base is omitted",
  ];
  console.log(lines.join("\n"));
}
