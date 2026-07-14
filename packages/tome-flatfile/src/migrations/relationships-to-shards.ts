import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  parseLegacyRelationshipsFile,
  serializeRelationshipEntry,
  type RelationshipEntry,
} from "../content/relationships-file";
import { relationshipRelativePath } from "../content/relationship-path";
import {
  contentDataDir,
  contentRelationshipsArchiveDir,
  contentRelationshipsDir,
  RELATIONSHIPS_FILENAME,
} from "../content/paths";

export interface MigrateRelationshipsToShardsReport {
  live: number;
  archived: number;
  sourcePath: string;
}

/**
 * Migrate monolithic `data/relationships.json` (v3) into sharded one-file-per-edge
 * trees under `data/relationships/` and `archive/relationships/`.
 */
export function migrateRelationshipsToShards(contentDir: string): MigrateRelationshipsToShardsReport {
  const sourcePath = resolve(contentDataDir(contentDir), RELATIONSHIPS_FILENAME);
  if (!existsSync(sourcePath)) {
    throw new Error(`No relationships file at ${sourcePath}`);
  }

  const legacy = parseLegacyRelationshipsFile(readFileSync(sourcePath, "utf-8"));
  const liveRoot = contentRelationshipsDir(contentDir);
  const archiveRoot = contentRelationshipsArchiveDir(contentDir);
  mkdirSync(liveRoot, { recursive: true });
  mkdirSync(archiveRoot, { recursive: true });

  const seen = new Set<string>();
  let live = 0;
  let archived = 0;

  for (const row of legacy.relationships) {
    const entry: RelationshipEntry = {
      a: row.a,
      b: row.b,
      type: row.type,
      ...(row.properties && Object.keys(row.properties).length > 0
        ? { properties: row.properties }
        : {}),
    };
    const relative = relationshipRelativePath(entry.a, entry.b, entry.type);
    const isArchived = row.archived === true;
    const dest = resolve(isArchived ? archiveRoot : liveRoot, relative);
    if (seen.has(`${isArchived ? "a" : "l"}:${relative}`)) {
      throw new Error(`Duplicate relationship path: ${dest}`);
    }
    seen.add(`${isArchived ? "a" : "l"}:${relative}`);
    if (existsSync(dest)) {
      throw new Error(`Destination already exists: ${dest}`);
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, serializeRelationshipEntry(entry), "utf-8");
    if (isArchived) archived += 1;
    else live += 1;
  }

  const backup = `${sourcePath}.pre-shard-backup`;
  renameSync(sourcePath, backup);
  rmSync(backup, { force: true });

  return { live, archived, sourcePath };
}
