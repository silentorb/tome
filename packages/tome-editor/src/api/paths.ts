import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "bun:sqlite";
import {
  defaultDbPathForContent,
  readEnv,
  resolveContentPath as resolveContentPathFromDb,
} from "tome-db/content";

const DEFAULT_PORT = 3847;
const moduleDir = dirname(fileURLToPath(import.meta.url));

function dbPathCandidates(contentPath: string): string[] {
  const canonicalTome = resolve(moduleDir, "../../../data/tome.sqlite");
  const candidates: string[] = [defaultDbPathForContent(contentPath)];
  let dir = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    candidates.push(resolve(dir, "data/tome.sqlite"));
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  candidates.push(canonicalTome);

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    return true;
  });
}

function nodeCount(dbPath: string): number {
  try {
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare("SELECT COUNT(*) AS c FROM nodes").get() as { c: number };
    db.close();
    return row.c;
  } catch {
    return 0;
  }
}

export function pickExistingDbPath(candidates: string[], fallback: string): string {
  let bestPath = fallback;
  let bestCount = -1;

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const count = nodeCount(candidate);
    if (count > bestCount) {
      bestCount = count;
      bestPath = candidate;
    }
  }

  return bestCount >= 0 ? bestPath : fallback;
}

export function resolveContentPath(): string {
  const fromEnv = readEnv("TOME_CONTENT_PATH");
  if (fromEnv) {
    return resolve(fromEnv);
  }
  return resolveContentPathFromDb(process.cwd());
}

export function resolveDbPath(): string {
  const fromEnv = readEnv("TOME_DB_PATH");
  if (fromEnv) {
    return resolve(fromEnv);
  }

  const contentPath = resolveContentPath();
  const candidates = dbPathCandidates(contentPath);
  const fallback = defaultDbPathForContent(contentPath);
  return pickExistingDbPath(candidates, fallback);
}

export function resolveApiPort(): number {
  const raw = readEnv("TOME_EDITOR_API_PORT") ?? String(DEFAULT_PORT);
  const port = Number.parseInt(raw, 10);
  return Number.isFinite(port) ? port : DEFAULT_PORT;
}

export function resolveUserSettingsPath(): string {
  const fromEnv = readEnv("TOME_USER_SETTINGS_PATH");
  if (fromEnv) {
    return resolve(fromEnv);
  }

  const contentPath = resolveContentPath();
  const repoRoot = resolve(contentPath, "..");
  return resolve(repoRoot, ".tome/user-settings.json");
}

export { resolveContentPathFromDb };
