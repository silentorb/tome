import type { RelationshipTypesFile } from "tome-graph-interfaces";
import type { Pattern, Predicate, RelationshipRuntime } from "./types";

/** Stable pattern id derived from an associations.json relationship type id. */
export function patternIdFromAssociationType(relationshipTypeId: string): string {
  return `ac:${relationshipTypeId}`;
}

/**
 * Compile associations.json (AC) into the predicate/pattern runtime (BR).
 * One predicate + one predicate-wide pattern per registry entry; traits and
 * endpoints attach to the pattern, not the predicate.
 */
export function compileAssociationConfig(
  file: RelationshipTypesFile,
): RelationshipRuntime {
  const predicates = new Map<string, Predicate>();
  const patterns: Pattern[] = [];

  for (const [id, def] of Object.entries(file.relationshipTypes)) {
    predicates.set(id, {
      id,
      perspectives: def.perspectives,
    });
    patterns.push({
      id: patternIdFromAssociationType(id),
      match: { predicateId: id },
      traits: def.traits ? [...def.traits] : [],
      linkExisting: def.linkExisting,
      endpoints: def.endpoints
        ? {
            0: { typeId: def.endpoints[0].typeId },
            1: { typeId: def.endpoints[1].typeId },
          }
        : undefined,
    });
  }

  return { predicates, patterns };
}

export function emptyRelationshipRuntime(): RelationshipRuntime {
  return { predicates: new Map(), patterns: [] };
}
