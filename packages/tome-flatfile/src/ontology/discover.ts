import {
  NODE_FILTER_BLOCK_ROLE,
  extractStructuredProperties,
} from "tome-interfaces/page-block";
import {
  compileNodePredicates,
  type NodePredicateInput,
} from "tome-ontology";
import type { ImpGraph } from "tome-graph-interfaces";
import { ContentStore } from "../content/store";
import { bodyFromNode } from "../content/node-file";
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
import { loadOntologyFileFromContent } from "./load";
import { parseImpGraph } from "./imp-graph";
import type { RelationshipEntry } from "../content/relationships-file";

const PREDICATE_PROPERTY_KEY = "predicate";

/** Associations registry only — must not call loadRelationshipTypesFromContent (overlay recursion). */
function loadAssociationsRegistry(contentDir: string): RelationshipTypesFile {
  const path = relationshipTypesFilePath(contentDir);
  if (!existsSync(path)) return emptyRelationshipTypesFile();
  return parseRelationshipTypesFile(readFileSync(path, "utf-8"));
}

function setMembersFromEntries(
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

function nodeFilterFromBody(body: string): ImpGraph | undefined {
  const props = extractStructuredProperties(body, NODE_FILTER_BLOCK_ROLE);
  const payload = props.get(PREDICATE_PROPERTY_KEY);
  if (!payload) return undefined;
  const graph = parseImpGraph(payload.data);
  return graph ?? undefined;
}

/**
 * Discover active ontology predicates for a corpus:
 * members of types.predicate that are also members of at least one
 * types.ontology instance.
 */
export function discoverActiveNodePredicates(contentDir: string): NodePredicateInput[] {
  const ontology = loadOntologyFileFromContent(contentDir);
  const ontologyTypeId = ontology.types.ontology;
  const predicateTypeId = ontology.types.predicate;
  if (!ontologyTypeId || !predicateTypeId) return [];

  const store = new ContentStore(contentDir);
  const entries = store.readRelationshipsFile().relationships;
  const registry = loadAssociationsRegistry(contentDir);

  const ontologyInstances = new Set(setMembersFromEntries(ontologyTypeId, entries, registry));
  if (ontologyInstances.size === 0) return [];

  const predicateCandidates = setMembersFromEntries(predicateTypeId, entries, registry);
  const activeInOntology = new Set<string>();
  for (const ontologyId of ontologyInstances) {
    for (const memberId of setMembersFromEntries(ontologyId, entries, registry)) {
      activeInOntology.add(memberId);
    }
  }

  const inputs: NodePredicateInput[] = [];
  for (const predicateId of predicateCandidates) {
    if (!activeInOntology.has(predicateId)) continue;
    const node = store.readNode(predicateId);
    if (!node) continue;
    const body = bodyFromNode(node);
    const nodeFilter = nodeFilterFromBody(body);
    if (!nodeFilter) {
      // Skip incomplete predicate nodes (no valid filter) per plan.
      continue;
    }
    const title =
      typeof node.properties.title === "string" ? node.properties.title : undefined;
    inputs.push({ id: predicateId, title, nodeFilter });
  }
  return inputs;
}

export function compileDiscoveredNodePredicates(contentDir: string) {
  return compileNodePredicates(discoverActiveNodePredicates(contentDir));
}
