#!/usr/bin/env bun
/**
 * Reorder relationships.json tuples into meaningful order (Step 1), then rebuild
 * and validate the SQLite cache.
 *
 *   bun run scripts/migrate-relationship-order.ts <contentDir>
 *   TOME_CONTENT_PATH=... bun run scripts/migrate-relationship-order.ts
 */
import { resolve } from "node:path";
import { migrateRelationshipOrder } from "../src/migrations/relationship-order";
import { defaultDbPathForContent } from "../src/content/paths";
import { openContentGraph } from "../src/content/sync";

const target = process.argv[2] ?? process.env.TOME_CONTENT_PATH;
if (!target) {
  console.error("Usage: bun run scripts/migrate-relationship-order.ts <contentDir>");
  process.exit(1);
}
const contentDir = resolve(target);
console.log(`Reordering relationship tuples in ${contentDir}`);

const report = migrateRelationshipOrder(contentDir);
console.log(
  `  ${report.total} relationships: ${report.reordered} reordered, ${report.unchanged} unchanged, ${report.ambiguous.length} ambiguous`,
);

if (report.ambiguous.length > 0) {
  const byType = new Map<string, number>();
  for (const item of report.ambiguous) byType.set(item.type, (byType.get(item.type) ?? 0) + 1);
  console.log("  ambiguous (kept as-is, review direction manually):");
  for (const [type, count] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${count}`);
  }
  for (const item of report.ambiguous.slice(0, 10)) {
    console.log(`      ${item.type}  ${item.a} <-> ${item.b}  (${item.reason})`);
  }
}

const dbPath = process.env.TOME_DB_PATH ?? defaultDbPathForContent(contentDir);
const { store, sync, db } = openContentGraph(contentDir, dbPath);
sync.fullRebuild();

const rels = store.readRelationshipsFile().relationships;
if (rels.length !== report.total) {
  console.error(`  ERROR: relationship count changed: ${report.total} -> ${rels.length}`);
  db.close();
  process.exit(1);
}
if (store.readRelationshipsFile().version !== 3) {
  console.error("  ERROR: relationships.json version was not bumped to 3");
  db.close();
  process.exit(1);
}
const counts = db.counts();
db.close();
console.log(
  `  OK: ${rels.length} relationships (version 3); cache rebuilt at ${dbPath} (${counts.relationships} projections)`,
);
