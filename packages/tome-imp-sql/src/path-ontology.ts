/**
 * Host PathOntology for Imp semantic paths.
 * Relationship hops: relational role ULIDs (global) and table-schema column keys (type-scoped).
 * Properties: type-scoped column keys + promoted node fields.
 * Spec: imp-spec/docs/packages/imp-pathing/semantic-paths.md
 */

import type {
  BindSemanticPathOptions,
  BindSemanticPathResult,
  OntologyBinding,
  OntologyRelationshipBinding,
  PathOntology,
} from "imp-pathing";
import { bindSemanticPath, mapPathOntology } from "imp-pathing";
import type { RelationshipTypesFile, TableSchemasFile } from "tome-flatfile";
import {
  buildRoleIndex,
  normalizeRelationshipTypeId,
  targetTypeIdForRelationColumn,
} from "tome-flatfile";

/** Promoted / intrinsic node fields available on every type context. */
export const TOME_PATH_PROMOTED_PROPERTIES = [
  "id",
  "title",
  "alias",
  "body",
  "created_at",
  "modified_at",
  "is_archived",
] as const;

function propertyBinding(name: string): OntologyBinding {
  return { kind: "property", name };
}

function ensureTokenSlot(
  table: Record<string, OntologyBinding>,
  typeId: string,
  token: string,
  binding: OntologyBinding,
): void {
  const existing = table[token];
  if (!existing) {
    table[token] = binding;
    return;
  }
  if (existing.kind !== binding.kind) {
    throw new Error(
      `PathOntology integrity: token "${token}" in type "${typeId}" maps to both property and relationship`,
    );
  }
  if (existing.kind === "property" && binding.kind === "property") {
    if (existing.name !== binding.name) {
      throw new Error(
        `PathOntology integrity: token "${token}" in type "${typeId}" has conflicting property names`,
      );
    }
    return;
  }
  if (existing.kind === "relationship" && binding.kind === "relationship") {
    if (
      existing.association !== binding.association ||
      existing.direction !== binding.direction ||
      existing.nextType !== binding.nextType
    ) {
      throw new Error(
        `PathOntology integrity: token "${token}" in type "${typeId}" has conflicting relationship bindings`,
      );
    }
  }
}

function seedPromoted(table: Record<string, OntologyBinding>, typeId: string): void {
  for (const name of TOME_PATH_PROMOTED_PROPERTIES) {
    ensureTokenSlot(table, typeId, name, propertyBinding(name));
  }
}

/**
 * Build a PathOntology from associations + table-schemas.
 * Relational role ULIDs resolve globally (no relationship type at the call site).
 * Type-scoped relation column keys remain as a convenience bridge.
 */
export function createTomePathOntology(
  relationshipTypes: RelationshipTypesFile,
  tableSchemas: TableSchemasFile,
): PathOntology {
  const types: Record<string, Record<string, OntologyBinding>> = {};

  const ensureType = (typeId: string): Record<string, OntologyBinding> => {
    let table = types[typeId];
    if (!table) {
      table = {};
      types[typeId] = table;
      seedPromoted(table, typeId);
    }
    return table;
  };

  for (const typeId of Object.keys(tableSchemas.tables)) {
    ensureType(typeId);
  }

  for (const def of Object.values(relationshipTypes.relationshipTypes)) {
    const ends = def.endpoints;
    if (!ends) continue;
    if (ends[0].typeId) ensureType(ends[0].typeId);
    if (ends[1].typeId) ensureType(ends[1].typeId);
  }

  for (const [typeId, schema] of Object.entries(tableSchemas.tables)) {
    const table = ensureType(typeId);
    for (const col of schema.columns) {
      if (col.type === "relation") {
        const association = normalizeRelationshipTypeId(col.association);
        const nextType = targetTypeIdForRelationColumn(relationshipTypes, typeId, col);
        if (!nextType) {
          throw new Error(
            `PathOntology: relation column "${col.key}" on type "${typeId}" has no opposite endpoint typeId`,
          );
        }
        ensureType(nextType);
        ensureTokenSlot(table, typeId, col.key, {
          kind: "relationship",
          association,
          direction: col.endpoint,
          nextType,
        });
      } else {
        ensureTokenSlot(table, typeId, col.key, propertyBinding(col.key));
      }
    }
  }

  const roleIndex = buildRoleIndex(relationshipTypes);
  const roleBindings = new Map<string, OntologyRelationshipBinding>();
  for (const [roleId, res] of roleIndex) {
    const def = relationshipTypes.relationshipTypes[res.relationshipTypeId];
    if (!def) continue;
    const other: 0 | 1 = res.endpoint === 0 ? 1 : 0;
    const nextType = def.endpoints?.[other]?.typeId?.trim() || undefined;
    if (nextType) ensureType(nextType);
    roleBindings.set(roleId, {
      kind: "relationship",
      association: res.relationshipTypeId,
      direction: res.endpoint,
      ...(nextType ? { nextType } : {}),
    });
  }

  const scoped = mapPathOntology(types);

  return {
    resolve(typeId: string, token: string): OntologyBinding {
      const trimmed = token.trim();
      const roleBinding = roleBindings.get(trimmed);
      if (roleBinding) {
        const table = types[typeId];
        const local = table?.[trimmed];
        if (local?.kind === "property") {
          throw new Error(
            `PathOntology integrity: token "${trimmed}" in type "${typeId}" is both a property and a relational role`,
          );
        }
        return roleBinding;
      }
      return scoped.resolve(typeId, token);
    },
  };
}

export type BindTomeSemanticPathOptions = Omit<BindSemanticPathOptions, "ontology"> & {
  ontology: PathOntology;
};

/**
 * Resolve untagged Tome semantic tokens then desugar to traverse/project.
 * Prefer this over hand-wiring ordinary relation→field hop chains.
 */
export function bindTomeSemanticPath(
  tokens: readonly string[],
  options: BindTomeSemanticPathOptions,
): BindSemanticPathResult {
  return bindSemanticPath(tokens, options);
}
