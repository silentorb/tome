#!/usr/bin/env bun
/**
 * Audit all relationships in a content store, reporting any that use unidirectional
 * (single-perspective) types or directedFrom. Simulates the resolution rules the
 * write path will use after hardening:
 *
 *  1. includes slug → "includes"
 *  2. taxonomy inspiration slug → *_inspirations composite
 *  3. parents|children → parents_children
 *  4. registered dual-perspective composite via table-schema inverse lookup
 *  5. BLOCKER (cannot resolve)
 *
 * Usage: bun packages/tome-db/scripts/audit-relationship-resolution.ts [contentDir]
 *
 * Exit code 0 = no blockers. Exit code 1 = unresolvable entries found.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  INCLUDES_TYPE,
  TAXONOMY_INSPIRATION_PERSPECTIVES,
} from "../src/includes-relationship";
import { normalizeRelationshipType } from "../src/relation-type";
import {
  relationshipsFilePath,
  relationshipTypesFilePath,
} from "../src/content/paths";
import {
  parseRelationshipTypesFile,
  compositeTypeForPerspectives,
  isDualPerspectiveType,
  type RelationshipTypesFile,
} from "../src/content/relationship-types-file";
import {
  parseRelationshipsFile,
  type RelationshipEntry,
} from "../src/content/relationships-file";

const INCLUDES_PERSPECTIVE_SLUGS_EXPANDED = new Set([
  "includes",
  "inspirations",
  "features",
  "characters",
  "location",
  "products",
  "solutions",
  "bible_passages",
  "groups",
  "character_attributes",
  "scenes",
  "scenes_2",
  "themes",
  "theme",
  "motivation",
]);

function isExpandedIncludesSlug(perspective: string): boolean {
  return INCLUDES_PERSPECTIVE_SLUGS_EXPANDED.has(normalizeRelationshipType(perspective));
}

function isTaxonomyInspirationSlug(perspective: string): boolean {
  return TAXONOMY_INSPIRATION_PERSPECTIVES.has(normalizeRelationshipType(perspective));
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

  if (type === INCLUDES_TYPE) return null;
  if (type === "member_of") return null;

  const perspective = typeDef?.perspectives[0] ?? type;

  if (isExpandedIncludesSlug(perspective)) {
    return { target: INCLUDES_TYPE, rule: "includes-slug" };
  }

  if (isTaxonomyInspirationSlug(perspective)) {
    const composite = compositeTypeForPerspectives(perspective, "inspirations");
    if (registry.types[composite] && isDualPerspectiveType(registry.types[composite])) {
      return { target: composite, rule: "taxonomy-inspiration" };
    }
    return { target: composite, rule: "taxonomy-inspiration (MISSING REGISTRY)" };
  }

  if (perspective === "parents" || perspective === "children") {
    const composite = "parents_children";
    if (registry.types[composite] && isDualPerspectiveType(registry.types[composite])) {
      return { target: composite, rule: "parents-children" };
    }
    return { target: composite, rule: "parents-children (MISSING REGISTRY)" };
  }

  return { target: "BLOCKER", rule: "unresolvable" };
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
