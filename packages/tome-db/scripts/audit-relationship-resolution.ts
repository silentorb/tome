#!/usr/bin/env bun
/**
 * Audit relationships in a content store: every stored edge should use a registered
 * dual-perspective association id (ULID), with no legacy includes bucket.
 *
 * Usage: bun packages/tome-db/scripts/audit-relationship-resolution.ts [contentDir]
 *
 * Exit code 0 = no blockers. Exit code 1 = unresolvable entries found.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isAssociationId,
  normalizeAssociationId,
  parseAssociationsFile,
  isDualPerspectiveType,
  type AssociationsFile,
} from "tome-flatfile";
import {
  relationshipsFilePath,
  associationsFilePath,
  parseRelationshipsFile,
  type RelationshipEntry,
} from "tome-flatfile";

function resolveExpectedComposite(
  entry: RelationshipEntry,
  registry: AssociationsFile,
): { target: string; rule: string } | null {
  const type = normalizeAssociationId(entry.type);
  const typeDef = registry.associations[type];

  if (typeDef && isDualPerspectiveType(typeDef)) {
    if (!isAssociationId(type)) {
      return { target: "BLOCKER", rule: "non-ulid-association-key" };
    }
    return null;
  }

  if (type === "includes") {
    return { target: "BLOCKER", rule: "legacy-includes-storage" };
  }

  if (!isAssociationId(type)) {
    return { target: "BLOCKER", rule: "non-ulid-association-key" };
  }

  if (typeDef) {
    return { target: "BLOCKER", rule: "unidirectional-or-invalid-composite" };
  }

  return { target: "BLOCKER", rule: "unknown-type" };
}

export function auditRelationships(contentDir: string): {
  migrations: Map<string, { target: string; rule: string; count: number }>;
  directedFromCount: number;
  blockers: { entry: RelationshipEntry; reason: string }[];
} {
  const relPath = relationshipsFilePath(contentDir);
  const typesPath = associationsFilePath(contentDir);
  const relFile = parseRelationshipsFile(readFileSync(relPath, "utf-8"));
  const registry = parseAssociationsFile(readFileSync(typesPath, "utf-8"));

  const migrations = new Map<string, { target: string; rule: string; count: number }>();
  const blockers: { entry: RelationshipEntry; reason: string }[] = [];
  let directedFromCount = 0;

  for (const entry of relFile.relationships) {
    if (entry.directedFrom) directedFromCount++;

    const result = resolveExpectedComposite(entry, registry);
    if (!result) continue;

    const key = `${entry.type} → ${result.target}`;
    const existing = migrations.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      migrations.set(key, { target: result.target, rule: result.rule, count: 1 });
    }
    blockers.push({ entry, reason: result.rule });
  }

  return { migrations, directedFromCount, blockers };
}

function main(): void {
  const contentDir = resolve(
    process.argv[2] ?? process.env.TOME_CONTENT_PATH ?? ".",
  );
  const { migrations, directedFromCount, blockers } = auditRelationships(contentDir);

  console.log(`Audited ${contentDir}`);
  console.log(`directedFrom remnants: ${directedFromCount}`);
  if (migrations.size === 0) {
    console.log("No blockers.");
    process.exit(0);
  }

  console.log("Blockers:");
  for (const [key, info] of [...migrations.entries()].sort()) {
    console.log(`  ${key} (${info.rule} × ${info.count})`);
  }
  console.log(`Total blocker edges: ${blockers.length}`);
  process.exit(1);
}

if (import.meta.main) main();
