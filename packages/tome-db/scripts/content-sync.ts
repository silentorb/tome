/**
 * Force-rebuild the SQLite query cache from flatfile content.
 *
 * Solo corpus:
 *   TOME_CONTENT_PATH (optional) + TOME_DB_PATH (optional → default next to content)
 *
 * Multi-corpus session (matches workbench `scripts/tome.sh`):
 *   TOME_CORPORA=id=/abs/path[,…]  +  TOME_DB_PATH=/abs/session.sqlite
 *   Also rebuilds sibling `*-fts.sqlite` when present in the sync graph.
 *
 * Always runs CacheSync.fullRebuild (does not trust content_mtime_ms), so drifted
 * caches with missing node rows are repaired.
 */
import {
  defaultDbPathForContent,
  openContentGraph,
  resolveContentPath,
} from "../src/content";
import { openDataStoreSession } from "../src/sync/open-session";
import type {
  TomeCorpusConfig,
  TomeServerModuleConfigEntry,
} from "tome-service-interfaces";

/** Parse `id=/abs/path[:readonly]` pairs separated by commas (same as tome-server). */
function parseTomeCorporaEnv(raw: string | undefined): TomeCorpusConfig[] | undefined {
  if (!raw?.trim()) return undefined;
  const out: TomeCorpusConfig[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const id = trimmed.slice(0, eq).trim();
    let pathPart = trimmed.slice(eq + 1).trim();
    let access: "readwrite" | "readonly" = "readwrite";
    if (pathPart.endsWith(":readonly")) {
      access = "readonly";
      pathPart = pathPart.slice(0, -":readonly".length);
    }
    if (!id || !pathPart) continue;
    out.push({ id, contentPath: pathPart, access });
  }
  return out.length > 0 ? out : undefined;
}

function ftsDbPathForSession(dbPath: string): string {
  return `${dbPath.replace(/\.sqlite$/, "")}-fts.sqlite`;
}

async function syncSolo(): Promise<void> {
  const contentDir = resolveContentPath();
  const dbPath = process.env.TOME_DB_PATH?.trim() || defaultDbPathForContent(contentDir);
  const ctx = await openContentGraph(contentDir, dbPath, { deferReady: true });
  try {
    if (!ctx.sync) {
      throw new Error("CacheSync unavailable (SoT-only session cannot rebuild a flatfile cache)");
    }
    await ctx.sync.fullRebuild();
    console.log(`Synced ${contentDir} → ${dbPath}`);
  } finally {
    await ctx.cache.close();
  }
}

async function syncMultiCorpus(corpora: TomeCorpusConfig[]): Promise<void> {
  const dbPath = process.env.TOME_DB_PATH?.trim();
  if (!dbPath) {
    throw new Error("TOME_DB_PATH is required when TOME_CORPORA is set");
  }

  const dataStores: Record<string, TomeServerModuleConfigEntry> = {};
  for (const corpus of corpora) {
    dataStores[corpus.id] = {
      id: corpus.id,
      module: "tome-flatfile",
      export: "createFlatfileModule",
      options: {
        contentPath: corpus.contentPath,
        access: corpus.access ?? "readwrite",
      },
    };
  }
  dataStores["session-cache"] = {
    id: "session-cache",
    module: "tome-sqlite",
    export: "createSqliteModule",
    options: { dbPath },
  };
  dataStores["fts"] = {
    id: "fts",
    module: "tome-search-sqlite",
    export: "createSearchSqliteModule",
    options: { dbPath: ftsDbPathForSession(dbPath) },
  };

  const session = await openDataStoreSession({
    dataStores,
    queryStoreId: "session-cache",
    deferReady: true,
  });
  try {
    const sync = session.writeContext.sync;
    if (!sync) {
      throw new Error("CacheSync unavailable");
    }
    await sync.fullRebuild();
    // Re-feed FTS (and any other observe sinks). SQLite sink ensureReady is a no-op
    // after fullRebuild updated content_mtime_ms.
    if (session.wire) {
      await session.wire.runInitialFull();
    }
    console.log(`Synced ${corpora.map((c) => c.id).join(", ")} → ${dbPath}`);
  } finally {
    session.dispose();
  }
}

const corpora = parseTomeCorporaEnv(process.env.TOME_CORPORA);
if (corpora) {
  await syncMultiCorpus(corpora);
} else {
  await syncSolo();
}
