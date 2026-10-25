import type { PropertyValue } from "tome-graph-interfaces";
import { ContentStore } from "../content/store";
import {
  emptyRelationshipTypesFile,
  RELATIONSHIP_TYPES_FILE_VERSION,
  tryParseRelationshipTypeDefinition,
  type RelationshipTypesFile,
} from "../content/relationship-types-file";
import { loadOntologyFileFromContent } from "./load";
import {
  activeOntologyMemberIds,
  loadAssociationsRegistry,
  setMembersFromEntries,
} from "./discover-shared";

export const RELATIONSHIP_TYPE_PROPERTY_KEY = "relationshipType";

function definitionFromProperties(
  typeId: string,
  properties: Record<string, PropertyValue>,
) {
  return tryParseRelationshipTypeDefinition(
    properties[RELATIONSHIP_TYPE_PROPERTY_KEY],
    typeId,
  );
}

/**
 * Discover active relationship-type nodes:
 * members of types.relationshipType that are also members of ≥1 ontology instance,
 * with a valid `relationshipType` node property (associations-entry shape).
 * Node id is the relationship type id (preserve config ULIDs when porting from JSON).
 */
export function discoverActiveRelationshipTypes(
  contentDir: string,
): RelationshipTypesFile {
  const ontology = loadOntologyFileFromContent(contentDir);
  const ontologyTypeId = ontology.types.ontology;
  const relationshipTypeTypeId = ontology.types.relationshipType;
  if (!ontologyTypeId || !relationshipTypeTypeId) {
    return emptyRelationshipTypesFile();
  }

  const store = new ContentStore(contentDir);
  const entries = store.readRelationshipsFile().relationships;
  // File-only registry — avoid overlay recursion while discovering set membership.
  const registry = loadAssociationsRegistry(contentDir);

  const activeInOntology = activeOntologyMemberIds(ontologyTypeId, entries, registry);
  if (activeInOntology.size === 0) return emptyRelationshipTypesFile();

  const candidates = setMembersFromEntries(relationshipTypeTypeId, entries, registry);
  const relationshipTypes: RelationshipTypesFile["relationshipTypes"] = {};
  for (const typeId of candidates) {
    if (!activeInOntology.has(typeId)) continue;
    const node = store.readNode(typeId);
    if (!node) continue;
    const def = definitionFromProperties(typeId, node.properties);
    if (!def) continue;
    relationshipTypes[typeId] = def;
  }

  return {
    version: RELATIONSHIP_TYPES_FILE_VERSION,
    relationshipTypes,
  };
}
