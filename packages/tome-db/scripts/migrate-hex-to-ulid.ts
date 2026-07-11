#!/usr/bin/env bun
/**
 * Run the hex -> ULID node-id migration against a content corpus, then rebuild
 * and validate its SQLite cache.
 *
 *   bun run scripts/migrate-hex-to-ulid.ts <contentDir>
 *   TOME_CONTENT_PATH=... bun run scripts/migrate-hex-to-ulid.ts
 */
import { resolve } from "node:path";
import {
  migrateHexToUlid,
  residualBodyTokens,
  residualStructuralTokens,
} from "../src/migrations/hex-to-ulid";
import { defaultDbPathForContent } from "../src/content/paths";
import { openContentGraph } from "../src/content/sync";

const target = process.argv[2] ?? process.env.TOME_CONTENT_PATH;
if (!target) {
  console.error("Usage: bun run scripts/migrate-hex-to-ulid.ts <contentDir>");
  process.exit(1);
}
const contentDir = resolve(target);
console.log(`Migrating node ids -> ULID in ${contentDir}`);

const report = migrateHexToUlid(contentDir);
console.log(
  `  renamed ${report.fileBackedCount} node files; mapped ${report.mappedCount} ids; touched ${report.filesRewritten} files`,
);

const structural = residualStructuralTokens(contentDir);
if (structural.length > 0) {
  console.error(
    `  ERROR: ${structural.length} legacy hex token(s) remain in relationships/model config: ${structural
      .slice(0, 5)
      .join(", ")}`,
  );
  process.exit(1);
}

const bodyResidual = residualBodyTokens(contentDir);
if (bodyResidual.size > 0) {
  let count = 0;
  for (const toks of bodyResidual.values()) count += toks.length;
  console.log(
    `  note: ${count} non-node 32-hex token(s) left untouched in ${bodyResidual.size} body file(s) (e.g. hashes inside external URLs)`,
  );
}

const dbPath = process.env.TOME_DB_PATH ?? defaultDbPathForContent(contentDir);
const { store, sync, cache } = openContentGraph(contentDir, dbPath);
sync.fullRebuild();
const nodeIds = store.listNodeIds();
if (nodeIds.length !== report.fileBackedCount) {
  console.error(`  ERROR: node count changed: ${report.fileBackedCount} -> ${nodeIds.length}`);
  cache.close();
  process.exit(1);
}
const known = new Set(nodeIds);
const rels = store.readRelationshipsFile().relationships;
const dangling = rels.filter((r) => !known.has(r.a) || !known.has(r.b));
cache.close();
console.log(
  `  OK: ${nodeIds.length} nodes, ${rels.length} relationships, cache rebuilt at ${dbPath}` +
    (dangling.length > 0 ? ` (${dangling.length} pre-existing dangling relationship endpoints)` : ""),
);
