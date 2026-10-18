import {
  NODE_FILTER_BLOCK_ROLE,
  extractStructuredProperties,
  parsePageBlockFences,
} from "tome-interfaces/page-block";
import {
  compileNodePredicates,
  type NodePredicateInput,
} from "tome-ontology";
import type { ImpGraph } from "tome-graph-interfaces";
import { ContentStore } from "../content/store";
import { bodyFromNode } from "../content/node-file";
import { loadOntologyFileFromContent } from "./load";
import { parseImpGraph } from "./imp-graph";
import {
  activeOntologyMemberIds,
  loadAssociationsRegistry,
  setMembersFromEntries,
} from "./discover-shared";

const PREDICATE_PROPERTY_KEY = "predicate";

function nodeFilterFromBody(body: string): ImpGraph | undefined {
  const props = extractStructuredProperties(body, NODE_FILTER_BLOCK_ROLE);
  const keyed = props.get(PREDICATE_PROPERTY_KEY);
  if (keyed) {
    const graph = parseImpGraph(keyed.data);
    return graph ?? undefined;
  }

  // Resilience: sole node-filter fence without {#predicate} still counts as
  // the selection property (legacy / incomplete authoring).
  const { segments } = parsePageBlockFences(body);
  const filters = segments.filter(
    (s) => s.type === "block" && s.payload.blockType === NODE_FILTER_BLOCK_ROLE,
  );
  if (filters.length !== 1) return undefined;
  const sole = filters[0]!;
  if (sole.type !== "block") return undefined;
  if (sole.payload.propertyId && sole.payload.propertyId !== PREDICATE_PROPERTY_KEY) {
    return undefined;
  }
  const graph = parseImpGraph(sole.payload.data);
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
