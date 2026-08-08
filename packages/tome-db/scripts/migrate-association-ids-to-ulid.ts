/**
 * Remap association registry keys from semantic slugs to ULIDs, and rewrite
 * every content reference (relationships, table-schemas, table-presentation,
 * dynamic-properties).
 *
 * Usage:
 *   bun packages/tome-db/scripts/migrate-association-ids-to-ulid.ts <contentDir>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { monotonicFactory } from "ulid";
import {
  associationsFilePath,
  dynamicPropertiesFilePath,
  tablePresentationFilePath,
  relationshipsFilePath,
  tableSchemasFilePath,
  isAssociationId,
  normalizeAssociationId,
  parseAssociationsFile,
  parseRelationshipsFile,
  serializeRelationshipsFile,
  parseTableSchemasFile,
  serializeTableSchemasFile,
  serializeAssociationsFile,
  type RelationshipEntry,
} from "tome-flatfile";

const mint = monotonicFactory();

function mintAssociationId(): string {
  return mint().toUpperCase();
}

function remapAssociationRef(
  value: string,
  slugToUlid: Map<string, string>,
  path: string,
): string {
  const trimmed = normalizeAssociationId(value);
  if (isAssociationId(trimmed)) return trimmed;
  const mapped = slugToUlid.get(trimmed);
  if (!mapped) {
    throw new Error(`${path}: unknown association slug "${value}"`);
  }
  return mapped;
}

function remapRelationships(
  entries: RelationshipEntry[],
  slugToUlid: Map<string, string>,
): RelationshipEntry[] {
  return entries.map((entry) => {
    const mapped = slugToUlid.get(entry.type) ?? (isAssociationId(entry.type) ? entry.type : null);
    if (!mapped) {
      throw new Error(`No ULID mapping for relationship type "${entry.type}"`);
    }
    return { ...entry, type: mapped };
  });
}

export function migrateAssociationIdsToUlid(contentDir: string): {
  mapped: number;
  relationships: number;
} {
  const associationsPath = associationsFilePath(contentDir);
  const data = JSON.parse(readFileSync(associationsPath, "utf-8")) as {
    version: number;
    associations: Record<string, unknown>;
  };
  if (!data.associations || typeof data.associations !== "object") {
    throw new Error("associations.json: associations must be an object");
  }

  const slugToUlid = new Map<string, string>();
  for (const key of Object.keys(data.associations)) {
    if (isAssociationId(key)) slugToUlid.set(key, key);
    else slugToUlid.set(key, mintAssociationId());
  }

  const remappedAssociations: Record<string, unknown> = {};
  for (const [slug, def] of Object.entries(data.associations)) {
    remappedAssociations[slugToUlid.get(slug)!] = def;
  }
  // Write remapped associations, then validate + normalize via formal serialize.
  writeFileSync(
    associationsPath,
    `${JSON.stringify({ version: data.version, associations: remappedAssociations }, null, 2)}\n`,
    "utf-8",
  );
  const parsedAssociations = parseAssociationsFile(readFileSync(associationsPath, "utf-8"));
  writeFileSync(associationsPath, serializeAssociationsFile(parsedAssociations), "utf-8");

  const relPath = relationshipsFilePath(contentDir);
  const relRaw = JSON.parse(readFileSync(relPath, "utf-8")) as {
    version: number;
    relationships: RelationshipEntry[];
  };
  relRaw.relationships = remapRelationships(relRaw.relationships, slugToUlid);
  writeFileSync(relPath, `${JSON.stringify(relRaw, null, 2)}\n`, "utf-8");
  const relFile = parseRelationshipsFile(readFileSync(relPath, "utf-8"));
  writeFileSync(relPath, serializeRelationshipsFile(relFile), "utf-8");

  const tableSchemasPath = tableSchemasFilePath(contentDir);
  const tableRaw = JSON.parse(readFileSync(tableSchemasPath, "utf-8")) as {
    version: number;
    tables: Record<string, { columns: Array<Record<string, unknown>> }>;
  };
  for (const [tableId, table] of Object.entries(tableRaw.tables)) {
    for (let i = 0; i < table.columns.length; i++) {
      const col = table.columns[i]!;
      if (col.type === "relation" && typeof col.association === "string") {
        col.association = remapAssociationRef(
          col.association,
          slugToUlid,
          `table-schemas.${tableId}.columns[${i}]`,
        );
      }
    }
  }
  writeFileSync(tableSchemasPath, `${JSON.stringify(tableRaw, null, 2)}\n`, "utf-8");
  writeFileSync(
    tableSchemasPath,
    serializeTableSchemasFile(parseTableSchemasFile(readFileSync(tableSchemasPath, "utf-8"))),
    "utf-8",
  );

  const presentationPath = tablePresentationFilePath(contentDir);
  const presentationRaw = JSON.parse(readFileSync(presentationPath, "utf-8")) as {
    version: number;
    compositions: Array<Record<string, unknown>>;
  };
  const layerAssociationFields: Array<[layer: string, field: string]> = [
    ["scope", "memberToScopeComposite"],
    ["groups", "memberToGroupComposite"],
    ["groups", "groupToScopeComposite"],
  ];
  for (const composition of presentationRaw.compositions) {
    for (const [layerKey, field] of layerAssociationFields) {
      const layer = composition[layerKey] as Record<string, unknown> | undefined;
      if (!layer || typeof layer[field] !== "string") continue;
      layer[field] = remapAssociationRef(
        layer[field] as string,
        slugToUlid,
        `table-presentation.${String(composition.id)}.${layerKey}.${field}`,
      );
    }
  }
  writeFileSync(presentationPath, `${JSON.stringify(presentationRaw, null, 2)}\n`, "utf-8");

  const dynamicPath = dynamicPropertiesFilePath(contentDir);
  const dynamicRaw = JSON.parse(readFileSync(dynamicPath, "utf-8")) as {
    version: number;
    properties?: Array<{ params?: Record<string, unknown> }>;
    columnSets?: Array<{ params?: Record<string, unknown> }>;
  };
  const compositeParamKeys = [
    "inspiration_feature_composite",
    "characters_scene_composite",
    "scene_product_composite",
  ];
  for (const entry of [...(dynamicRaw.properties ?? []), ...(dynamicRaw.columnSets ?? [])]) {
    if (!entry.params) continue;
    for (const key of compositeParamKeys) {
      const value = entry.params[key];
      if (typeof value === "string") {
        entry.params[key] = remapAssociationRef(value, slugToUlid, `dynamic-properties.${key}`);
      }
    }
  }
  writeFileSync(dynamicPath, `${JSON.stringify(dynamicRaw, null, 2)}\n`, "utf-8");

  console.log("Association slug → ULID map:");
  for (const [slug, ulid] of [...slugToUlid.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (slug !== ulid) console.log(`  ${slug} → ${ulid}`);
  }

  return {
    mapped: slugToUlid.size,
    relationships: relFile.relationships.length,
  };
}

function main(): void {
  if (!process.argv[2]) {
    console.error(
      "Usage: bun packages/tome-db/scripts/migrate-association-ids-to-ulid.ts <contentDir>",
    );
    process.exit(1);
  }
  const contentDir = resolve(process.argv[2]);
  const result = migrateAssociationIdsToUlid(contentDir);
  console.log(
    `Migrated ${result.mapped} associations; rewrote ${result.relationships} relationships.`,
  );
}

if (import.meta.main) main();
