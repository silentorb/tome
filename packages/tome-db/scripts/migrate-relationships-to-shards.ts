#!/usr/bin/env bun
/**
 * Migrate monolithic content/data/relationships.json into sharded
 * content/relationships/{shard}/{digest}.json (+ archive/ subtree).
 *
 *   bun run scripts/migrate-relationships-to-shards.ts <contentDir>
 *   TOME_CONTENT_PATH=... bun run scripts/migrate-relationships-to-shards.ts
 */
import { resolve } from "node:path";
import { migrateRelationshipsToShards } from "tome-flatfile/migrations/relationships-to-shards";

const target = process.argv[2] ?? process.env.TOME_CONTENT_PATH;
if (!target) {
  console.error("Usage: bun run scripts/migrate-relationships-to-shards.ts <contentDir>");
  process.exit(1);
}

const contentDir = resolve(target);
const report = migrateRelationshipsToShards(contentDir);
console.log(
  `Migrated ${report.live} live + ${report.archived} archived relationship(s) from ${report.sourcePath}`,
);
