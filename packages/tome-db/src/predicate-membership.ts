import type { ImpGraph, Relationship } from "tome-graph-interfaces";
import {
  hostsProjectionType,
  memberPredicateForTypeTable,
  parseHostsProjectionFilter,
  parseLiteralBooleanFilter,
  predicateSelectsNode,
  type HostsProjectionSpec,
  type NodeFilterEvaluator,
} from "tome-ontology";
import {
  ContentStore,
  expandRelationshipEntry,
  loadMemberScopesFromContent,
  loadRelationshipRuntimeFromContent,
  loadRelationshipTypesFromContent,
  memberSideProjectionTypes,
  resolveContentPath,
} from "tome-flatfile";
import {
  listRelationshipsFromSource,
  listSourceNodeIdsForProjectionType,
  readStoreGetNode,
  readStoreListNodeIds,
  type RelationshipReadStore,
} from "./graph-store/relationship-read";

async function listHostsProjectionSourceIds(
  store: RelationshipReadStore,
  spec: HostsProjectionSpec,
  contentDir: string,
): Promise<string[]> {
  const projection = hostsProjectionType(spec);
  const fromStore = await listSourceNodeIdsForProjectionType(store, projection);
  if (fromStore.length > 0) return fromStore;

  // Flatfile-only / unsynced stores: expand content relationships directly.
  const content = new ContentStore(contentDir);
  const registry = loadRelationshipTypesFromContent(contentDir);
  const ids = new Set<string>();
  for (const entry of content.readRelationshipsFile().relationships) {
    if (entry.type !== spec.relationshipTypeId) continue;
    const { projections } = expandRelationshipEntry(entry, registry);
    for (const row of projections) {
      if (row.type === projection) ids.add(row.sourceNodeId);
    }
  }
  return [...ids];
}

/**
 * Evaluate a node-filter Imp graph for a single node.
 * Supports: boolean literal, hosts_projection (Tome convention), else false.
 */
export function createNodeFilterEvaluator(
  store: RelationshipReadStore,
  contentDir?: string,
): NodeFilterEvaluator {
  const dir = contentDir ?? resolveContentPath();
  return async (graph: ImpGraph, nodeId: string) => {
    const literal = parseLiteralBooleanFilter(graph);
    if (literal !== null) return literal;

    const hosts = parseHostsProjectionFilter(graph);
    if (hosts) {
      const sources = await listHostsProjectionSourceIds(store, hosts, dir);
      return sources.includes(nodeId);
    }

    // Full Imp collection pipelines are not wired as node→boolean yet.
    return false;
  };
}

/** All node ids selected by a predicate's node-filter (bulk). */
export async function nodesMatchingPredicate(
  store: RelationshipReadStore,
  predicateId: string,
  contentDir?: string,
): Promise<string[]> {
  const dir = contentDir ?? resolveContentPath();
  const runtime = loadRelationshipRuntimeFromContent(dir);
  const pred = runtime.predicates.get(predicateId.trim());
  if (!pred?.nodeFilter) return [];

  const graph = pred.nodeFilter;
  const literal = parseLiteralBooleanFilter(graph);
  if (literal === true) {
    return readStoreListNodeIds(store);
  }
  if (literal === false) return [];

  const hosts = parseHostsProjectionFilter(graph);
  if (hosts) {
    return listHostsProjectionSourceIds(store, hosts, dir);
  }

  const evaluate = createNodeFilterEvaluator(store, dir);
  const allIds = await readStoreListNodeIds(store);
  const matched: string[] = [];
  for (const id of allIds) {
    if (await predicateSelectsNode(runtime, predicateId, id, evaluate)) {
      matched.push(id);
    }
  }
  return matched;
}

export async function predicateSelectsNodeInStore(
  store: RelationshipReadStore,
  predicateId: string,
  nodeId: string,
  contentDir?: string,
): Promise<boolean> {
  const dir = contentDir ?? resolveContentPath();
  const runtime = loadRelationshipRuntimeFromContent(dir);
  return predicateSelectsNode(
    runtime,
    predicateId,
    nodeId,
    createNodeFilterEvaluator(store, dir),
  );
}

/** Predicate id for a type table from active member-scopes, if any. */
export function memberPredicateIdForTypeTable(
  typeTableId: string,
  contentDir?: string,
): string | undefined {
  const dir = contentDir ?? resolveContentPath();
  const scopes = loadMemberScopesFromContent(dir);
  return memberPredicateForTypeTable(scopes, typeTableId);
}

/** Member node ids for a type table via member-scope predicate (empty if none). */
export async function predicateScopedMemberIds(
  store: RelationshipReadStore,
  typeTableId: string,
  contentDir?: string,
): Promise<string[] | null> {
  const predicateId = memberPredicateIdForTypeTable(typeTableId, contentDir);
  if (!predicateId) return null;
  return nodesMatchingPredicate(store, predicateId, contentDir);
}

/**
 * Type-table hubs that select this node via an active member-scope predicate.
 */
export async function predicateScopedTypeIdsForInstance(
  store: RelationshipReadStore,
  nodeId: string,
  contentDir?: string,
): Promise<string[]> {
  const dir = contentDir ?? resolveContentPath();
  const scopes = loadMemberScopesFromContent(dir);
  if (scopes.length === 0) return [];

  const runtime = loadRelationshipRuntimeFromContent(dir);
  const evaluate = createNodeFilterEvaluator(store, dir);
  const hubs = new Set<string>();

  // Group by predicate to avoid re-evaluating the same filter.
  const byPredicate = new Map<string, string[]>();
  for (const scope of scopes) {
    const list = byPredicate.get(scope.predicateId) ?? [];
    list.push(scope.typeTableId);
    byPredicate.set(scope.predicateId, list);
  }

  for (const [predicateId, typeTableIds] of byPredicate) {
    const pred = runtime.predicates.get(predicateId);
    if (!pred?.nodeFilter) continue;

    const hosts = parseHostsProjectionFilter(pred.nodeFilter);
    if (hosts) {
      const sources = await listHostsProjectionSourceIds(store, hosts, dir);
      if (sources.includes(nodeId)) {
        for (const hub of typeTableIds) hubs.add(hub);
      }
      continue;
    }

    if (await predicateSelectsNode(runtime, predicateId, nodeId, evaluate)) {
      for (const hub of typeTableIds) hubs.add(hub);
    }
  }
  return [...hubs];
}

/**
 * Membership-like connections for predicate-scoped hub rows:
 * reuse set-edge properties when present; otherwise synthesize empty edges.
 */
export async function listPredicateScopedMemberConnections(
  store: RelationshipReadStore,
  typeTableId: string,
  memberIds: readonly string[],
  contentDir?: string,
): Promise<Relationship[]> {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadRelationshipTypesFromContent(dir);
  const memberProjections = memberSideProjectionTypes(registry);
  const memberSet = new Set(memberIds);
  const byMember = new Map<string, Relationship>();

  for (const projection of memberProjections) {
    for (const memberId of memberSet) {
      if (byMember.has(memberId)) continue;
      const edges = await listRelationshipsFromSource(store, memberId, projection);
      const toHub = edges.find((e) => e.targetNodeId === typeTableId);
      if (toHub) byMember.set(memberId, toHub);
    }
  }

  const out: Relationship[] = [];
  for (const memberId of memberIds) {
    const existing = byMember.get(memberId);
    if (existing) {
      out.push(existing);
      continue;
    }
    const node = await readStoreGetNode(store, memberId);
    if (!node) continue;
    out.push({
      id: `predicate-scope:${typeTableId}:${memberId}`,
      sourceNodeId: memberId,
      targetNodeId: typeTableId,
      type: memberProjections[0] ?? "membership:1",
      properties: {},
    });
  }
  return out;
}
