import type { Graph } from "imp-core-types";
import type { ExecuteImpContext, ImpCollectionResult, ImpGraph } from "tome-graph-interfaces";
import type { TomeQueryCache } from "tome-service-interfaces";
import type { TomeGraphStoreBase } from "tome-graph-interfaces";
import { onlyActiveHostProjectionType, resolveContentPath } from "tome-flatfile";
import type { TomeSearch } from "tome-interfaces/search";
import { predicateScopedMemberIds } from "../predicate-membership";
import type { RelationshipReadStore } from "./relationship-read";

function inboundEdge(graph: Graph, nodeId: string, port: string) {
  return Object.values(graph.edges).find((edge) => edge.to.node === nodeId && edge.to.port === port);
}

function literalFromPort(graph: Graph, nodeId: string, port: string): unknown {
  const edge = inboundEdge(graph, nodeId, port);
  if (edge) {
    const from = graph.nodes[edge.from.node];
    if (!from) return undefined;
    if (from.type === "literal" || from.type === "parameter") {
      return from.inputs?.value;
    }
  }
  const node = graph.nodes[nodeId];
  return node?.inputs?.[port];
}

export function graphHasSearchNode(graph: Graph): boolean {
  return Object.values(graph.nodes).some((node) => node.type === "search");
}

export function resolveSearchQueryFromGraph(
  graph: Graph,
  context?: ExecuteImpContext,
): string {
  const searchNode = Object.values(graph.nodes).find((node) => node.type === "search");
  if (!searchNode) return "";
  const local = literalFromPort(graph, searchNode.id, "query");
  if (typeof local === "string" && local.trim()) return local;
  const paramNode = Object.values(graph.nodes).find(
    (node) =>
      node.type === "parameter" &&
      typeof node.inputs?.label === "string" &&
      context?.parameters &&
      node.inputs.label in context.parameters,
  );
  if (paramNode && context?.parameters) {
    const label = String(paramNode.inputs?.label);
    const value = context.parameters[label];
    return typeof value === "string" ? value : "";
  }
  return "";
}

function resolveLimitFromGraph(graph: Graph, fallback: number): number {
  const limitNode = Object.values(graph.nodes).find((node) => node.type === "limit");
  if (!limitNode) return fallback;
  const count = literalFromPort(graph, limitNode.id, "count");
  if (typeof count === "number" && Number.isFinite(count)) {
    return Math.max(1, Math.min(count, 5000));
  }
  return fallback;
}

export type RunSearchImpOptions = {
  store: TomeGraphStoreBase;
  cache: TomeQueryCache;
  graph: ImpGraph;
  context?: ExecuteImpContext;
  /** Injected searcher; null/undefined → empty results for non-empty queries. */
  search?: TomeSearch | null;
};

/** Execute Imp graphs that contain a host-delegated `search` transform (SQL path). */
export async function runSearchImpGraphSql(
  store: TomeGraphStoreBase,
  cache: TomeQueryCache,
  graph: ImpGraph,
  context?: ExecuteImpContext,
  search?: TomeSearch | null,
): Promise<ImpCollectionResult> {
  const query = resolveSearchQueryFromGraph(graph, context);
  const limit = resolveLimitFromGraph(graph, 20);
  let allowedTypeIds = context?.allowedTypeIds;
  const selectedProjection = context?.participatesInProjectionType?.trim();
  const pickingRole = context?.onlyActivePickingRole === "source" ? "source" : "target";
  const hostProjection = selectedProjection
    ? onlyActiveHostProjectionType(selectedProjection, pickingRole)
    : null;
  let allowedNodeIds = hostProjection
    ? new Set(await cache.listSourceNodeIdsForProjectionType(hostProjection))
    : undefined;

  // Expand predicate-scoped type tables into node ids (set-membership EXISTS would miss them).
  if (allowedTypeIds && allowedTypeIds.length > 0) {
    const contentDir = store.contentDir ?? resolveContentPath();
    const remainingTypes: string[] = [];
    const predicateMembers = new Set<string>();
    let sawPredicateScope = false;
    for (const typeId of allowedTypeIds) {
      const members = await predicateScopedMemberIds(
        store as RelationshipReadStore,
        typeId,
        contentDir,
      );
      if (members) {
        sawPredicateScope = true;
        for (const id of members) predicateMembers.add(id);
      } else {
        remainingTypes.push(typeId);
      }
    }
    if (sawPredicateScope) {
      allowedNodeIds = allowedNodeIds ?? new Set();
      for (const id of predicateMembers) allowedNodeIds.add(id);
      // When every type id was predicate-scoped, filter by node ids only.
      allowedTypeIds = remainingTypes.length > 0 ? remainingTypes : undefined;
    }
  }

  const trimmed = query.trim();
  if (!trimmed) {
    if (allowedNodeIds && allowedNodeIds.size === 0) {
      return { columns: ["id", "title"], rows: [] };
    }
    const cap = Math.max(1, Math.min(limit, 100));
    const rows = await cache.listNodesByTitle(cap, allowedTypeIds, allowedNodeIds);
    return {
      columns: ["id", "title"],
      rows: rows.map((row) => ({ id: row.id, title: row.title })),
    };
  }

  if (!search) {
    return { columns: ["id", "title"], rows: [] };
  }

  const hits = await Promise.resolve(
    search.search({
      query: trimmed,
      limit,
      allowedTypeIds,
      allowedNodeIds,
    }),
  );
  return {
    columns: ["id", "title"],
    rows: hits.map((row) => ({
      id: row.id,
      title: row.title,
      ...(row.matchPreview ? { matchPreview: row.matchPreview } : {}),
    })),
  };
}
