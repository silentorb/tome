import { existsSync, readFileSync } from "node:fs";
import {
  childNodeId,
  isSetTraitEntry,
  parentNodeId,
} from "../relationship-type-traits";
import { relationshipTypesFilePath } from "../content/paths";
import {
  emptyRelationshipTypesFile,
  parseRelationshipTypesFile,
  type RelationshipTypesFile,
} from "../content/relationship-types-file";
import type { RelationshipEntry } from "../content/relationships-file";

/** Associations registry only — must not call loadRelationshipTypesFromContent (overlay recursion). */
export function loadAssociationsRegistry(contentDir: string): RelationshipTypesFile {
  const path = relationshipTypesFilePath(contentDir);
  if (!existsSync(path)) return emptyRelationshipTypesFile();
  return parseRelationshipTypesFile(readFileSync(path, "utf-8"));
}

export function setMembersFromEntries(
  setId: string,
  entries: readonly RelationshipEntry[],
  registry: RelationshipTypesFile,
): string[] {
  const members = new Set<string>();
  for (const entry of entries) {
    if (!isSetTraitEntry(registry, entry)) continue;
    const def = registry.relationshipTypes[entry.type];
    const parent = parentNodeId(def, entry);
    const child = childNodeId(def, entry);
    if (parent === setId) members.add(child);
  }
  return [...members];
}

/** Union of set members of each ontology instance under types.ontology. */
export function activeOntologyMemberIds(
  ontologyTypeId: string,
  entries: readonly RelationshipEntry[],
  registry: RelationshipTypesFile,
): Set<string> {
  const ontologyInstances = new Set(setMembersFromEntries(ontologyTypeId, entries, registry));
  const active = new Set<string>();
  for (const ontologyId of ontologyInstances) {
    for (const memberId of setMembersFromEntries(ontologyId, entries, registry)) {
      active.add(memberId);
    }
  }
  return active;
}
