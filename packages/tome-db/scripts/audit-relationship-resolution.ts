#!/usr/bin/env bun
/**
 * Audit relationships in a content store: every stored edge should use a registered
 * dual-perspective composite type (no legacy includes bucket or unidirectional types).
 *
 * Usage: bun packages/tome-db/scripts/audit-relationship-resolution.ts [contentDir]
 *
 * Exit code 0 = no blockers. Exit code 1 = unresolvable entries found.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeRelationshipType } from "../src/relation-type";
import {
  relationshipsFilePath,
  relationshipTypesFilePath,
} from "../src/content/paths";
import {
  parseRelationshipTypesFile,
  isDualPerspectiveType,
  type RelationshipTypesFile,
} from "../src/content/relationship-types-file";
import {
  parseRelationshipsFile,
  type RelationshipEntry,
} from "../src/content/relationships-file";

function isUlidCompositeKey(type: string): boolean {
  return /^[a-z0-9]{4}_[a-z_]+_[a-z0-9]{4}$/.test(normalizeRelationshipType(type));
}

function resolveExpectedComposite(
  entry: RelationshipEntry,
  registry: RelationshipTypesFile,
): { target: string; rule: string } | null {
  const type = normalizeRelationshipType(entry.type);
  const typeDef = registry.types[type];

  if (typeDef && isDualPerspectiveType(typeDef)) {
    return null;
  }

  if (type === "includes") {
    return { target: "BLOCKER", rule: "legacy-includes-storage" };
  }

  if (isUlidCompositeKey(type)) {
    return { target: "BLOCKER", rule: "ulid-suffixed-composite" };
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
  const typesPath = relationshipTypesFilePath(contentDir);
  const relFile = parseRelationshipsFile(readFileSync(relPath, "utf-8"));
  const registry = parseRelationshipTypesFile(readFileSync(typesPath, "utf-8"));

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
      existing.count++;
    } else {
      migrations.set(key, { target: result.target, rule: result.rule, count: 1 });
    }

    if (result.target === "BLOCKER") {
      blockers.push({ entry, reason: result.rule });
    }
  }

  return { migrations, directedFromCount, blockers };
}

if (import.meta.main) {
  const contentDir = process.argv[2]
    ? resolve(process.argv[2])
    : resolve(import.meta.dir, "../../../../repos/marloth-story/content");

  console.log(`Auditing: ${contentDir}\n`);
  const { migrations, directedFromCount, blockers } = auditRelationships(contentDir);

  console.log("Migration summary:");
  for (const [key, value] of [...migrations.entries()].sort((a, b) => b[1].count - a[1].count)) {
    const status = value.target === "BLOCKER" ? "  ** BLOCKER **" : "";
    console.log(`  ${key} (${value.rule}) — ${value.count} records${status}`);
  }
  console.log(`\n  directedFrom entries: ${directedFromCount}`);
  console.log(`  blockers: ${blockers.length}`);

  if (blockers.length > 0) {
    console.log("\nBlocker details:");
    for (const b of blockers.slice(0, 20)) {
      console.log(`  ${b.entry.a}:${b.entry.b}:${b.entry.type} — ${b.reason}`);
    }
    process.exit(1);
  }

  console.log("\nAll entries resolvable. Migration is safe.");
  process.exit(0);
}
