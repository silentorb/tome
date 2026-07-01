import type {
  SchemaQueryRelationshipRule,
  SchemaQueryTypeTable,
} from "tome-interfaces/extension-services/schema-query";
import type { SchemaDiagramConfig } from "./config";

export interface SchemaDiagramSnapshot {
  typeTables: SchemaQueryTypeTable[];
  relationshipRules: SchemaQueryRelationshipRule[];
}

export interface BuildErDiagramMermaidResult {
  source: string;
  entityCount: number;
  edgeCount: number;
}

function escapeMermaidLabel(value: string): string {
  return value.replace(/"/g, '\\"');
}

function entityAlias(typeId: string, title: string, used: Map<string, string>): string {
  let base = title
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  if (!base || !/^[a-zA-Z]/.test(base)) {
    base = `Type_${typeId.slice(0, 8)}`;
  }
  let alias = base;
  let suffix = 2;
  while (used.has(alias) && used.get(alias) !== typeId) {
    alias = `${base}_${suffix}`;
    suffix += 1;
  }
  used.set(alias, typeId);
  return alias;
}

function filterSnapshot(
  snapshot: SchemaDiagramSnapshot,
  config: SchemaDiagramConfig,
): SchemaDiagramSnapshot {
  const typeIdSet = config.typeIds ? new Set(config.typeIds) : null;
  const typeTables = typeIdSet
    ? snapshot.typeTables.filter((table) => typeIdSet.has(table.id))
    : snapshot.typeTables;

  const allowedTypeIds = new Set(typeTables.map((table) => table.id));
  const relationshipTypeSet = config.relationshipTypes
    ? new Set(config.relationshipTypes)
    : null;

  const relationshipRules = snapshot.relationshipRules.filter((rule) => {
    if (relationshipTypeSet && !relationshipTypeSet.has(rule.type)) return false;
    if (!allowedTypeIds.has(rule.sourceTypeId)) return false;
    return rule.allowedTargetTypeIds.some((targetId) => allowedTypeIds.has(targetId));
  });

  return { typeTables, relationshipRules };
}

export function buildErDiagramMermaid(
  snapshot: SchemaDiagramSnapshot,
  config: SchemaDiagramConfig,
): BuildErDiagramMermaidResult {
  const filtered = filterSnapshot(snapshot, config);
  const aliasByTypeId = new Map<string, string>();
  const usedAliases = new Map<string, string>();

  for (const table of filtered.typeTables) {
    const alias = entityAlias(table.id, table.title, usedAliases);
    aliasByTypeId.set(table.id, alias);
  }

  const lines: string[] = ["erDiagram"];
  if (config.direction) {
    lines.push(`    direction ${config.direction}`);
  }

  for (const table of filtered.typeTables) {
    const alias = aliasByTypeId.get(table.id)!;
    lines.push(`    ${alias} {`);
    lines.push("        string type");
    lines.push("    }");
  }

  let edgeCount = 0;
  for (const rule of filtered.relationshipRules) {
    const sourceAlias = aliasByTypeId.get(rule.sourceTypeId);
    if (!sourceAlias) continue;
    const label = escapeMermaidLabel(rule.type);
    for (const targetId of rule.allowedTargetTypeIds) {
      const targetAlias = aliasByTypeId.get(targetId);
      if (!targetAlias) continue;
      lines.push(`    ${sourceAlias} ||--o{ ${targetAlias} : "${label}"`);
      edgeCount += 1;
    }
  }

  return {
    source: lines.join("\n"),
    entityCount: filtered.typeTables.length,
    edgeCount,
  };
}
