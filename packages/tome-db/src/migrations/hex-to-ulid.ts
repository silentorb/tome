import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { monotonicFactory } from "ulid";
import { contentDataDir, contentModelDir, RELATIONSHIPS_FILENAME } from "../content/paths";

/**
 * One-time migration: rewrite legacy 32-char lowercase-hex node ids to
 * canonical uppercase ULIDs across a content corpus (node files, relationships,
 * and model config). The SQLite cache is rebuilt separately from content.
 *
 * Only *known* node ids are rewritten. The known set is the union of:
 *   - node `<id>.md` filenames in `content/data/`
 *   - every id token in `relationships.json`
 *   - every id token in `content/model/*.json`
 * The last two catch dangling references to deleted nodes (still present in
 * config) so no hex leaks into the ULID-only config. Body text is rewritten
 * with the same map, so unrelated 32-hex strings (e.g. hashes inside external
 * URLs) are deliberately left untouched.
 */

/** Legacy node id token, guarded so it is not matched inside a longer hex run. */
const OLD_ID_TOKEN = /(?<![0-9a-fA-F])[0-9a-f]{32}(?![0-9a-fA-F])/g;
const OLD_NODE_FILE = /^[0-9a-f]{32}\.md$/;

export interface HexToUlidReport {
  fileBackedCount: number;
  mappedCount: number;
  idMap: Map<string, string>;
  filesRewritten: number;
}

/** Old (32-hex) node ids that exist as `<id>.md` files in `content/data/`. */
export function findFileBackedIds(dataDir: string): string[] {
  return readdirSync(dataDir)
    .filter((name) => OLD_NODE_FILE.test(name))
    .map((name) => name.slice(0, 32));
}

function tokensInFile(path: string): string[] {
  try {
    return [...readFileSync(path, "utf-8").matchAll(OLD_ID_TOKEN)].map((m) => m[0]);
  } catch {
    return [];
  }
}

/**
 * All legacy id tokens that are unambiguously node references: node filenames
 * plus every token appearing in `relationships.json` and `content/model/*.json`.
 */
export function collectMappableIds(contentDir: string): string[] {
  const dataDir = contentDataDir(contentDir);
  const modelDir = contentModelDir(contentDir);
  const ids = new Set<string>(findFileBackedIds(dataDir));
  for (const t of tokensInFile(resolve(dataDir, RELATIONSHIPS_FILENAME))) ids.add(t);
  for (const name of readdirSync(modelDir)) {
    if (name.endsWith(".json")) {
      for (const t of tokensInFile(resolve(modelDir, name))) ids.add(t);
    }
  }
  return [...ids].sort();
}

/** Assign each old id a fresh, unique ULID. `mint` is injectable for tests. */
export function buildIdMap(
  oldIds: readonly string[],
  mint: () => string = monotonicFactory(),
): Map<string, string> {
  const map = new Map<string, string>();
  const used = new Set<string>();
  for (const oldId of oldIds) {
    let next = mint();
    while (used.has(next)) next = mint();
    used.add(next);
    map.set(oldId, next);
  }
  return map;
}

/** Replace every mapped old-id token in `text` with its ULID (others untouched). */
export function remapText(text: string, idMap: ReadonlyMap<string, string>): string {
  return text.replace(OLD_ID_TOKEN, (token) => idMap.get(token) ?? token);
}

function rewriteFileInPlace(path: string, idMap: ReadonlyMap<string, string>): boolean {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return false;
  }
  const next = remapText(raw, idMap);
  if (next === raw) return false;
  writeFileSync(path, next, "utf-8");
  return true;
}

/** Legacy id tokens remaining in structural files (relationships + model). Must be empty post-migration. */
export function residualStructuralTokens(contentDir: string): string[] {
  const dataDir = contentDataDir(contentDir);
  const modelDir = contentModelDir(contentDir);
  const found = new Set<string>(tokensInFile(resolve(dataDir, RELATIONSHIPS_FILENAME)));
  for (const name of readdirSync(modelDir)) {
    if (name.endsWith(".json")) {
      for (const t of tokensInFile(resolve(modelDir, name))) found.add(t);
    }
  }
  return [...found];
}

/** Legacy id tokens remaining in node bodies (allowed: e.g. hashes in external URLs). */
export function residualBodyTokens(contentDir: string): Map<string, string[]> {
  const dataDir = contentDataDir(contentDir);
  const byFile = new Map<string, string[]>();
  for (const name of readdirSync(dataDir)) {
    if (!name.endsWith(".md")) continue;
    const toks = tokensInFile(resolve(dataDir, name));
    if (toks.length > 0) byFile.set(name, [...new Set(toks)]);
  }
  return byFile;
}

/**
 * Migrate a content corpus in place. Rewrites node bodies + renames node files,
 * then rewrites `relationships.json` and every `content/model/*.json`.
 */
export function migrateHexToUlid(
  contentDir: string,
  opts: { mint?: () => string } = {},
): HexToUlidReport {
  const dataDir = contentDataDir(contentDir);
  const modelDir = contentModelDir(contentDir);
  const fileBackedIds = findFileBackedIds(dataDir);
  const mappableIds = collectMappableIds(contentDir);
  const idMap = buildIdMap(mappableIds, opts.mint);
  let filesRewritten = 0;

  for (const oldId of fileBackedIds) {
    const newId = idMap.get(oldId)!;
    const oldPath = resolve(dataDir, `${oldId}.md`);
    const newPath = resolve(dataDir, `${newId}.md`);
    const raw = readFileSync(oldPath, "utf-8");
    const next = remapText(raw, idMap);
    writeFileSync(newPath, next, "utf-8");
    if (newPath !== oldPath) rmSync(oldPath, { force: true });
    filesRewritten += 1;
  }

  if (rewriteFileInPlace(resolve(dataDir, RELATIONSHIPS_FILENAME), idMap)) filesRewritten += 1;

  for (const name of readdirSync(modelDir)) {
    if (name.endsWith(".json") && rewriteFileInPlace(resolve(modelDir, name), idMap)) {
      filesRewritten += 1;
    }
  }

  return {
    fileBackedCount: fileBackedIds.length,
    mappedCount: idMap.size,
    idMap,
    filesRewritten,
  };
}
