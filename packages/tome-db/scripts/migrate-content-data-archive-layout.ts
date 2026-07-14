#!/usr/bin/env bun
/**
 * Nest nodes/relationships under content/data and content/archive.
 *
 *   bun run scripts/migrate-content-data-archive-layout.ts <contentDir>
 *   TOME_CONTENT_PATH=... bun run scripts/migrate-content-data-archive-layout.ts
 */
import { resolve } from "node:path";
import { migrateContentDataArchiveLayout } from "tome-flatfile/migrations/content-data-archive-layout";

const target = process.argv[2] ?? process.env.TOME_CONTENT_PATH;
if (!target) {
  console.error("Usage: bun run scripts/migrate-content-data-archive-layout.ts <contentDir>");
  process.exit(1);
}

const contentDir = resolve(target);
const report = migrateContentDataArchiveLayout(contentDir);
console.log(
  `Layout migration: ${report.nodesLive} live nodes, ${report.nodesArchived} archived nodes; ` +
    `moved ${report.relationshipsLiveMoved} live + ${report.relationshipsArchivedMoved} archived relationship file(s)`,
);
