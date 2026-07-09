import type { GraphDatabase } from "../graph";
import { typeIdsForInstance } from "../node-capabilities";
import { normalizeRelationshipType } from "../relation-type";
import {
  allowedTargetTypeIdsForPerspective,
  relationshipTypeRuleContext,
} from "../relationship-type-endpoints";
import { loadRelationshipTypesFromContent } from "../relationship-types/load";
import { resolveContentPath } from "../content/paths";
import type { RelationshipRuleEntry, SchemaFile } from "./schema-file";

export function allowedTargetTypeIdsForRule(rule: RelationshipRuleEntry): string[] {
  return [...rule.allowedTargetTypeIds];
}

/** @deprecated relationshipRules removed from schema.json; use relationship-types endpoints. */
export function resolveRelationshipRule(
  schema: SchemaFile,
  db: GraphDatabase,
  sourceNodeId: string,
  type: string,
  contentDir?: string,
): RelationshipRuleEntry | null {
  void schema;
  const dir = contentDir ?? resolveContentPath();
  const registry = loadRelationshipTypesFromContent(dir);
  const ctx = relationshipTypeRuleContext(registry, db, sourceNodeId, type, dir);
  if (!ctx) return null;
  return {
    id: ctx.compositeType,
    sourceTypeId: typeIdsForInstance(db, sourceNodeId, dir)[0] ?? "",
    type: ctx.type,
    allowedTargetTypeIds: ctx.allowedTargetTypeIds,
  };
}

/** @deprecated relationshipRules removed from schema.json. */
export function resolveRelationshipRulesForSource(
  schema: SchemaFile,
  db: GraphDatabase,
  sourceNodeId: string,
  contentDir?: string,
): RelationshipRuleEntry[] {
  void schema;
  const dir = contentDir ?? resolveContentPath();
  const sourceTypes = typeIdsForInstance(db, sourceNodeId, dir);
  if (sourceTypes.length === 0) return [];

  const registry = loadRelationshipTypesFromContent(dir);
  const rules: RelationshipRuleEntry[] = [];
  for (const [composite, def] of Object.entries(registry.types)) {
    if (!def.endpoints) continue;
    for (const sourceTypeId of sourceTypes) {
      const hostIndex =
        def.endpoints[0].typeId === sourceTypeId
          ? 0
          : def.endpoints[1].typeId === sourceTypeId
            ? 1
            : null;
      if (hostIndex === null) continue;
      const perspective = def.perspectives[hostIndex];
      rules.push({
        id: composite,
        sourceTypeId,
        type: perspective,
        allowedTargetTypeIds: allowedTargetTypeIdsForPerspective(registry, composite, perspective),
      });
    }
  }
  return rules;
}

export interface RelationshipRuleContext {
  ruleId: string;
  type: string;
  allowedTargetTypeIds: string[];
}

export function relationshipRuleContextForType(
  schema: SchemaFile,
  db: GraphDatabase,
  sourceNodeId: string,
  type: string,
  contentDir?: string,
): RelationshipRuleContext | null {
  void schema;
  const dir = contentDir ?? resolveContentPath();
  const registry = loadRelationshipTypesFromContent(dir);
  const ctx = relationshipTypeRuleContext(registry, db, sourceNodeId, type, dir);
  if (!ctx) return null;
  return {
    ruleId: ctx.compositeType,
    type: ctx.type,
    allowedTargetTypeIds: ctx.allowedTargetTypeIds,
  };
}

/** @deprecated Use relationshipRuleContextForType */
export const relationshipRuleContextForLabel = relationshipRuleContextForType;
