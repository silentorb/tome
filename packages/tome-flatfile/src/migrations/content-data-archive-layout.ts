import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { isSetTraitComposite } from "../association-traits";
import { loadAssociationsFromContent } from "../associations/load";
import {
  CONTENT_NODES_SUBDIR,
  CONTENT_RELATIONSHIPS_SUBDIR,
  NODE_FILE_PATTERN,
  RELATIONSHIP_FILE_PATTERN,
  contentDataDir,
  contentNodesArchiveDir,
  contentNodesDir,
  contentRelationshipsArchiveDir,
  contentRelationshipsDir,
  nodeFilePath,
} from "../content/paths";
import { ContentStore } from "../content/store";
import { archiveNodeId } from "../workspace/resolve";

export interface MigrateContentDataArchiveLayoutReport {
  nodesLive: number;
  nodesArchived: number;
  relationshipsLiveMoved: number;
  relationshipsArchivedMoved: number;
}

function moveTree(fromRoot: string, toRoot: string, filePattern: RegExp): number {
  if (!existsSync(fromRoot)) return 0;
  let moved = 0;
  for (const shardEntry of readdirSync(fromRoot, { withFileTypes: true })) {
    if (!shardEntry.isDirectory()) continue;
    if (
      shardEntry.name === "archive" ||
      shardEntry.name === "nodes" ||
      shardEntry.name === "relationships"
    ) {
      continue;
    }
    const fromShard = resolve(fromRoot, shardEntry.name);
    for (const name of readdirSync(fromShard)) {
      if (!filePattern.test(name)) continue;
      const from = resolve(fromShard, name);
      const to = resolve(toRoot, shardEntry.name, name);
      if (existsSync(to)) {
        throw new Error(`Destination already exists: ${to}`);
      }
      mkdirSync(dirname(to), { recursive: true });
      renameSync(from, to);
      moved += 1;
    }
    try {
      if (readdirSync(fromShard).length === 0) rmSync(fromShard, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  return moved;
}

function moveFlatDataNodesToLive(contentDir: string): number {
  const dataDir = contentDataDir(contentDir);
  const liveNodes = contentNodesDir(contentDir);
  mkdirSync(liveNodes, { recursive: true });
  let moved = 0;
  if (!existsSync(dataDir)) return 0;
  for (const entry of readdirSync(dataDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === CONTENT_NODES_SUBDIR || entry.name === CONTENT_RELATIONSHIPS_SUBDIR) continue;
    const shardDir = resolve(dataDir, entry.name);
    for (const name of readdirSync(shardDir)) {
      if (!NODE_FILE_PATTERN.test(name)) continue;
      const id = name.slice(0, -3);
      const from = resolve(shardDir, name);
      const to = nodeFilePath(contentDir, id, false);
      if (from === to) continue;
      if (existsSync(to)) throw new Error(`Destination already exists: ${to}`);
      mkdirSync(dirname(to), { recursive: true });
      renameSync(from, to);
      moved += 1;
    }
    try {
      if (readdirSync(shardDir).length === 0) rmSync(shardDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  return moved;
}

function listArchiveHubMemberIds(store: ContentStore, hubId: string): string[] {
  const registry = loadAssociationsFromContent(store.contentDir);
  const members = new Set<string>();
  for (const entry of store.readRelationshipsFile().relationships) {
    if (!isSetTraitComposite(registry, entry.type)) continue;
    if (entry.a !== hubId && entry.b !== hubId) continue;
    const memberId = entry.a === hubId ? entry.b : entry.a;
    if (memberId !== hubId) members.add(memberId);
  }
  return [...members];
}

function listNodeIdsUnder(rootDir: string): string[] {
  const ids: string[] = [];
  if (!existsSync(rootDir)) return ids;
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const name of readdirSync(resolve(rootDir, entry.name))) {
      if (NODE_FILE_PATTERN.test(name)) ids.push(name.slice(0, -3));
    }
  }
  return ids;
}

/**
 * Migrate intermediate layout:
 * - `data/{shard}/*.md` → `data/nodes/{shard}/` (+ hub members → `archive/nodes/`)
 * - `relationships/{shard}` → `data/relationships/{shard}`
 * - `relationships/archive/{shard}` → `archive/relationships/{shard}`
 */
export function migrateContentDataArchiveLayout(
  contentDir: string,
): MigrateContentDataArchiveLayoutReport {
  const legacyRelRoot = resolve(contentDir, CONTENT_RELATIONSHIPS_SUBDIR);
  const legacyRelArchive = resolve(legacyRelRoot, "archive");

  mkdirSync(contentNodesDir(contentDir), { recursive: true });
  mkdirSync(contentRelationshipsDir(contentDir), { recursive: true });
  mkdirSync(contentNodesArchiveDir(contentDir), { recursive: true });
  mkdirSync(contentRelationshipsArchiveDir(contentDir), { recursive: true });

  let relationshipsLiveMoved = 0;
  let relationshipsArchivedMoved = 0;
  if (existsSync(legacyRelArchive) && legacyRelArchive !== contentRelationshipsArchiveDir(contentDir)) {
    relationshipsArchivedMoved = moveTree(
      legacyRelArchive,
      contentRelationshipsArchiveDir(contentDir),
      RELATIONSHIP_FILE_PATTERN,
    );
    rmSync(legacyRelArchive, { recursive: true, force: true });
  }
  if (existsSync(legacyRelRoot) && legacyRelRoot !== contentRelationshipsDir(contentDir)) {
    relationshipsLiveMoved = moveTree(
      legacyRelRoot,
      contentRelationshipsDir(contentDir),
      RELATIONSHIP_FILE_PATTERN,
    );
    try {
      if (existsSync(legacyRelRoot) && readdirSync(legacyRelRoot).length === 0) {
        rmSync(legacyRelRoot, { recursive: true, force: true });
      }
    } catch {
      /* ignore */
    }
  }

  moveFlatDataNodesToLive(contentDir);

  const store = new ContentStore(contentDir);
  let hubId: string | null = null;
  try {
    hubId = archiveNodeId(contentDir);
  } catch {
    hubId = null;
  }
  let nodesArchived = 0;
  if (hubId) {
    for (const id of listArchiveHubMemberIds(store, hubId)) {
      const from = nodeFilePath(contentDir, id, false);
      const to = nodeFilePath(contentDir, id, true);
      if (!existsSync(from)) continue;
      if (existsSync(to)) throw new Error(`Destination already exists: ${to}`);
      mkdirSync(dirname(to), { recursive: true });
      renameSync(from, to);
      nodesArchived += 1;
    }
  }

  try {
    if (existsSync(legacyRelRoot) && readdirSync(legacyRelRoot).length === 0) {
      rmSync(legacyRelRoot, { recursive: true, force: true });
    }
  } catch {
    /* ignore */
  }

  return {
    nodesLive: listNodeIdsUnder(contentNodesDir(contentDir)).length,
    nodesArchived,
    relationshipsLiveMoved,
    relationshipsArchivedMoved,
  };
}
