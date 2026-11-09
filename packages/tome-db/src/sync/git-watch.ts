import { existsSync, readFileSync, watch, type FSWatcher } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { TomeQueryCache } from "tome-service-interfaces";
import type {
  SyncEndpoint,
  SyncScope,
  SyncSignal,
  SyncSourceRead,
} from "tome-service-interfaces/sync";
import {
  emptySyncPartialScope,
  mergeSyncPartialScope,
} from "tome-service-interfaces/sync";
import { storeChangeEventToSyncScope } from "./scope-from-events";
import {
  NODE_FILE_PATTERN,
  RELATIONSHIPS_SYNC_MARKER,
} from "tome-flatfile";

export const GIT_WATCH_COMMIT_META_PREFIX = "git_watch_commit:";

export function gitWatchCommitMetaKey(storeId: string): string {
  return `${GIT_WATCH_COMMIT_META_PREFIX}${storeId}`;
}

/** Walk upward from `startDir` looking for a `.git` directory or file (worktree). */
export function findGitDir(startDir: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    const gitPath = join(dir, ".git");
    if (existsSync(gitPath)) {
      if (existsSync(join(gitPath, "HEAD"))) return gitPath;
      try {
        const text = readFileSync(gitPath, "utf8").trim();
        if (text.startsWith("gitdir:")) {
          const target = text.slice("gitdir:".length).trim();
          const abs = resolve(dir, target);
          if (existsSync(join(abs, "HEAD"))) return abs;
        }
      } catch {
        /* continue walking */
      }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Repository working tree root for `git -C` (parent of `.git`, or content walk). */
export function findRepoRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    const gitPath = join(dir, ".git");
    if (existsSync(gitPath)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export type ResolvedGitHead = {
  /** Full commit hash */
  hash: string;
  /** Absolute path to watch for tip changes (HEAD and/or ref file). */
  watchPaths: string[];
};

/**
 * Resolve the current tip hash and which files to watch.
 * Symbolic HEAD → watch HEAD + the ref file; detached → watch HEAD only.
 */
export function resolveGitHead(gitDir: string): ResolvedGitHead | null {
  const headPath = join(gitDir, "HEAD");
  if (!existsSync(headPath)) return null;
  let headText: string;
  try {
    headText = readFileSync(headPath, "utf8").trim();
  } catch {
    return null;
  }

  if (headText.startsWith("ref:")) {
    const ref = headText.slice("ref:".length).trim();
    if (!ref) return null;
    const refPath = join(gitDir, ref);
    const watchPaths = [headPath];
    if (existsSync(refPath)) watchPaths.push(refPath);
    const hash = existsSync(refPath)
      ? readFileSync(refPath, "utf8").trim()
      : readPackedRef(gitDir, ref);
    if (!hash || !/^[0-9a-f]{40,64}$/i.test(hash)) return null;
    return { hash, watchPaths };
  }

  if (!/^[0-9a-f]{40,64}$/i.test(headText)) return null;
  return { hash: headText, watchPaths: [headPath] };
}

function readPackedRef(gitDir: string, ref: string): string | null {
  const packed = join(gitDir, "packed-refs");
  if (!existsSync(packed)) return null;
  try {
    const text = readFileSync(packed, "utf8");
    for (const line of text.split("\n")) {
      if (!line || line.startsWith("#") || line.startsWith("^")) continue;
      const sp = line.indexOf(" ");
      if (sp < 0) continue;
      const hash = line.slice(0, sp).trim();
      const name = line.slice(sp + 1).trim();
      if (name === ref && /^[0-9a-f]{40,64}$/i.test(hash)) return hash;
    }
  } catch {
    return null;
  }
  return null;
}

export async function gitDiffNameOnly(
  repoRoot: string,
  oldHash: string,
  newHash: string,
): Promise<string[]> {
  const proc = Bun.spawn(
    ["git", "-C", repoRoot, "diff", "--name-only", oldHash, newHash],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`git diff failed (exit ${exitCode})`);
  }
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Map repo-relative paths under a content root into SyncScopes.
 * Returns one or more scopes (nodes merged; coarse markers separate).
 */
export function gitPathsToSyncScopes(
  repoRelativePaths: readonly string[],
  contentDir: string,
  repoRoot: string,
): SyncScope[] {
  const contentAbs = resolve(contentDir);
  const repoAbs = resolve(repoRoot);
  let contentPrefix = relative(repoAbs, contentAbs);
  if (contentPrefix === "") contentPrefix = ".";
  // Normalize to forward slashes for matching
  const prefix =
    contentPrefix === "."
      ? ""
      : contentPrefix.split(sep).join("/") + "/";

  let nodeChanges = emptySyncPartialScope();
  let hasNodes = false;
  const contentNames = new Set<string>();
  let needsFull = false;

  for (const repoPath of repoRelativePaths) {
    const norm = repoPath.split(sep).join("/");
    if (prefix && !norm.startsWith(prefix)) continue;
    const underContent =
      prefix === "" ? norm : norm.slice(prefix.length);
    if (!underContent) continue;

    // Relationship shard files live under data/relationships/
    if (
      underContent === "data/relationships" ||
      underContent.startsWith("data/relationships/") ||
      underContent.startsWith("archive/relationships/")
    ) {
      contentNames.add(RELATIONSHIPS_SYNC_MARKER);
      continue;
    }

    const base = underContent.includes("/")
      ? underContent.slice(underContent.lastIndexOf("/") + 1)
      : underContent;
    if (NODE_FILE_PATTERN.test(base) && underContent.includes("/nodes/")) {
      const id = base.slice(0, -3);
      nodeChanges = mergeSyncPartialScope(nodeChanges, {
        ...emptySyncPartialScope(),
        nodes: { created: [], modified: [id], deleted: [] },
      });
      hasNodes = true;
      continue;
    }

    // Model / config files under content/model or content root
    const kindGuess = guessStoreChangeKind(underContent);
    if (kindGuess) {
      const scope = storeChangeEventToSyncScope({
        path: underContent.includes("/")
          ? underContent.slice(underContent.lastIndexOf("/") + 1)
          : underContent,
        kind: kindGuess,
      });
      if (scope.mode === "content") {
        contentNames.add(scope.relativeName);
      } else if (scope.mode === "full") {
        needsFull = true;
      }
      continue;
    }

    needsFull = true;
  }

  if (needsFull) return [{ mode: "full" }];

  const scopes: SyncScope[] = [];
  if (hasNodes) {
    scopes.push({ mode: "partial", changes: nodeChanges });
  }
  for (const name of contentNames) {
    scopes.push({ mode: "content", relativeName: name });
  }
  if (scopes.length === 0) return [];
  return scopes;
}

function guessStoreChangeKind(
  underContent: string,
):
  | "relationships"
  | "relationship-types"
  | "schema"
  | "dynamic-properties"
  | "views"
  | "table-schemas"
  | "workspace"
  | "sequencing"
  | "extensions"
  | null {
  const base = underContent.includes("/")
    ? underContent.slice(underContent.lastIndexOf("/") + 1)
    : underContent;
  switch (base) {
    case "associations.json":
      return "relationship-types";
    case "schema.json":
      return "schema";
    case "dynamic-properties.json":
      return "dynamic-properties";
    case "views.json":
      return "views";
    case "table-schemas.json":
      return "table-schemas";
    case "workspace.json":
    case "corpus.json":
      return "workspace";
    case "sequencing.json":
      return "sequencing";
    case "extensions.json":
      return "extensions";
    default:
      return null;
  }
}

export type CreateGitWatchSyncEndpointOptions = {
  /** Sync graph node id (endpoint id). */
  id: string;
  storeId: string;
  contentDir: string;
  source: SyncSourceRead;
  queryCache: TomeQueryCache;
  /** Optional override for tests. */
  gitDir?: string;
  repoRoot?: string;
};

/**
 * Git HEAD/ref observe source for a flatfile corpus.
 * Emits SyncSignals when the resolved commit hash changes.
 */
export function createGitWatchSyncEndpoint(
  options: CreateGitWatchSyncEndpointOptions,
): SyncEndpoint & {
  /** Record tip after cold/full sync. */
  recordBaselineHash: () => Promise<void>;
  /** Test helper: run one hash-check cycle. */
  checkForUpdates: () => Promise<void>;
} {
  const gitDir = options.gitDir ?? findGitDir(options.contentDir);
  const repoRoot =
    options.repoRoot ?? findRepoRoot(options.contentDir) ?? resolve(options.contentDir);

  const listeners = new Set<(signal: SyncSignal) => void>();
  let watchers: FSWatcher[] = [];
  let watchedPaths: string[] = [];
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let applying = false;

  const metaKey = gitWatchCommitMetaKey(options.storeId);

  async function currentHash(): Promise<string | null> {
    if (!gitDir) return null;
    return resolveGitHead(gitDir)?.hash ?? null;
  }

  async function recordBaselineHash(): Promise<void> {
    const hash = await currentHash();
    if (hash) await options.queryCache.setMeta(metaKey, hash);
  }

  async function emitScopes(scopes: SyncScope[]): Promise<void> {
    for (const scope of scopes) {
      const signal: SyncSignal = { source: options.source, scope };
      for (const listener of listeners) listener(signal);
    }
  }

  async function checkForUpdates(): Promise<void> {
    if (!gitDir || applying) return;
    applying = true;
    try {
      const resolved = resolveGitHead(gitDir);
      if (!resolved) return;
      rebindWatchers(resolved.watchPaths);

      const prev = await options.queryCache.getMeta(metaKey);
      if (!prev) {
        await emitScopes([{ mode: "full" }]);
        await options.queryCache.setMeta(metaKey, resolved.hash);
        return;
      }
      if (prev === resolved.hash) return;

      try {
        const paths = await gitDiffNameOnly(repoRoot, prev, resolved.hash);
        const scopes = gitPathsToSyncScopes(paths, options.contentDir, repoRoot);
        if (scopes.length === 0) {
          await options.queryCache.setMeta(metaKey, resolved.hash);
          return;
        }
        await emitScopes(scopes);
        await options.queryCache.setMeta(metaKey, resolved.hash);
      } catch {
        await emitScopes([{ mode: "full" }]);
        await options.queryCache.setMeta(metaKey, resolved.hash);
      }
    } finally {
      applying = false;
    }
  }

  function scheduleCheck(): void {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      debounce = null;
      void checkForUpdates();
    }, 50);
  }

  function rebindWatchers(paths: string[]): void {
    const next = [...new Set(paths.map((p) => resolve(p)))].sort();
    if (
      next.length === watchedPaths.length &&
      next.every((p, i) => p === watchedPaths[i])
    ) {
      return;
    }
    for (const w of watchers) w.close();
    watchers = [];
    watchedPaths = next;
    for (const p of watchedPaths) {
      try {
        watchers.push(
          watch(p, () => {
            scheduleCheck();
          }),
        );
      } catch {
        /* ignore missing path until next resolve */
      }
    }
  }

  return {
    id: options.id,
    capabilities: {
      kind: "flatfile",
      canBeObserved: true,
      canObserve: false,
    },
    asSource: () => options.source,
    apply() {
      throw new Error(
        `Git watch endpoint "${options.id}" is not a sync sink`,
      );
    },
    subscribe(listener: (signal: SyncSignal) => void) {
      listeners.add(listener);
      if (listeners.size === 1 && gitDir) {
        const resolved = resolveGitHead(gitDir);
        if (resolved) rebindWatchers(resolved.watchPaths);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          for (const w of watchers) w.close();
          watchers = [];
          watchedPaths = [];
          if (debounce) {
            clearTimeout(debounce);
            debounce = null;
          }
        }
      };
    },
    recordBaselineHash,
    checkForUpdates,
  };
}
