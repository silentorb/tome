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
import { findSetEdge, setMemberIds } from "./set-membership";
import {
  getQueryCache,
  listRelationshipsFromSource,
  listSourceNodeIdsForProjectionType,
  readStoreGetNode,
  readStoreListNodeIds,
  type RelationshipReadStore,
} from "./graph-store/relationship-read";

/** Member-scope is active but the predicate has no loadable selection filter. */
export class UnevaluableMemberScopeError extends Error {
  readonly code = "unevaluable_member_scope" as const;

  constructor(
    readonly typeTableId: string,
    readonly predicateId: string,
    message?: string,
  ) {
    super(
      message ??
        `Member-scope for type table ${typeTableId} references predicate ${predicateId} with no loadable selection filter`,
    );
    this.name = "UnevaluableMemberScopeError";
  }
}

async function listHostsProjectionSourceIds(
  store: RelationshipReadStore,
  spec: HostsProjectionSpec,
  contentDir: string,
): Promise<string[]> {
  const projection = hostsProjectionType(spec);
  const fromStore = await listSourceNodeIdsForProjectionType(store, projection);
  // Hydrated composed sessions: empty means no hosts, not "unsynced — scan flatfile".
  if (fromStore.length > 0 || getQueryCache(store) !== null) return fromStore;

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

/** Type-table ids that have an active member-scope binding. */
export function scopedTypeTableIds(contentDir?: string): Set<string> {
  const dir = contentDir ?? resolveContentPath();
  return new Set(loadMemberScopesFromContent(dir).map((s) => s.typeTableId));
}

function requireLoadablePredicateFilter(
  typeTableId: string,
  predicateId: string,
  contentDir: string,
): ImpGraph {
  const runtime = loadRelationshipRuntimeFromContent(contentDir);
  const pred = runtime.predicates.get(predicateId.trim());
  if (!pred?.nodeFilter) {
    throw new UnevaluableMemberScopeError(typeTableId, predicateId);
  }
  return pred.nodeFilter;
}

/**
 * Member node ids for a type table via member-scope predicate.
 * `null` = no member-scope. Throws if scope is present but filter cannot load.
 * Empty array = filter applied and matched nobody.
 */
export async function predicateScopedMemberIds(
  store: RelationshipReadStore,
  typeTableId: string,
  contentDir?: string,
): Promise<string[] | null> {
  const dir = contentDir ?? resolveContentPath();
  const predicateId = memberPredicateIdForTypeTable(typeTableId, dir);
  if (!predicateId) return null;
  requireLoadablePredicateFilter(typeTableId, predicateId, dir);
  return nodesMatchingPredicate(store, predicateId, dir);
}

/** hosts_projection spec for a scoped type table, when the filter is that shape. */
export function hostsProjectionSpecForTypeTable(
  typeTableId: string,
  contentDir?: string,
): HostsProjectionSpec | null {
  const dir = contentDir ?? resolveContentPath();
  const predicateId = memberPredicateIdForTypeTable(typeTableId, dir);
  if (!predicateId) return null;
  const filter = requireLoadablePredicateFilter(typeTableId, predicateId, dir);
  return parseHostsProjectionFilter(filter);
}

/**
 * Unified membership: predicate when scoped, else set edge.
 * Throws UnevaluableMemberScopeError when the scope cannot evaluate.
 */
export async function isMemberOfTypeTable(
  store: RelationshipReadStore,
  nodeId: string,
  typeTableId: string,
  contentDir?: string,
): Promise<boolean> {
  const dir = contentDir ?? resolveContentPath();
  const predicateId = memberPredicateIdForTypeTable(typeTableId, dir);
  if (predicateId) {
    requireLoadablePredicateFilter(typeTableId, predicateId, dir);
    return predicateSelectsNodeInStore(store, predicateId, nodeId, dir);
  }
  return (await findSetEdge(store, nodeId, typeTableId, dir)) !== null;
}

/** All member ids of a type table (predicate or set). */
export async function typeTableMemberIds(
  store: RelationshipReadStore,
  typeTableId: string,
  contentDir?: string,
): Promise<string[]> {
  const dir = contentDir ?? resolveContentPath();
  const scoped = await predicateScopedMemberIds(store, typeTableId, dir);
  if (scoped !== null) return scoped;
  return setMemberIds(store, typeTableId, dir);
}

/**
 * Type-table hubs that select this node via an active member-scope predicate.
 * Skips scopes whose predicate filter is not loadable (those hubs error on listing).
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
