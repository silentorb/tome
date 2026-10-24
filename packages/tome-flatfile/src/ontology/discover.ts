import {
  compileNodePredicates,
  type NodePredicateInput,
} from "tome-ontology";
import type { ImpGraph, PropertyValue } from "tome-graph-interfaces";
import { ContentStore } from "../content/store";
import { loadOntologyFileFromContent } from "./load";
import { parseImpGraph } from "./imp-graph";
import {
  activeOntologyMemberIds,
  loadAssociationsRegistry,
  setMembersFromEntries,
} from "./discover-shared";

const PREDICATE_PROPERTY_KEY = "predicate";

function nodeFilterFromProperties(
  properties: Record<string, PropertyValue>,
): ImpGraph | undefined {
  const raw = properties[PREDICATE_PROPERTY_KEY];
  if (raw === undefined || raw === null) return undefined;
  const graph = parseImpGraph(raw);
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

  const activeInOntology = activeOntologyMemberIds(ontologyTypeId, entries, registry);
  if (activeInOntology.size === 0) return [];

  const predicateCandidates = setMembersFromEntries(predicateTypeId, entries, registry);

  const inputs: NodePredicateInput[] = [];
  for (const predicateId of predicateCandidates) {
    if (!activeInOntology.has(predicateId)) continue;
    const node = store.readNode(predicateId);
    if (!node) continue;
    const nodeFilter = nodeFilterFromProperties(node.properties);
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
