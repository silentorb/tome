import type { Graph } from "imp-core-types";
import type { ExecuteImpContext, ImpCollectionResult, ImpGraph } from "tome-graph-interfaces";
import type { GraphDatabase } from "tome-sqlite";
import type { TomeGraphStoreBase } from "tome-graph-interfaces";
import { onlyActiveHostProjectionType } from "tome-flatfile";
import type { TomeSearch } from "tome-interfaces/search";
import { listRecentNodes } from "../search-text";

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
  cache: GraphDatabase;
  graph: ImpGraph;
  context?: ExecuteImpContext;
  /** Injected searcher; null/undefined → empty results for non-empty queries. */
  search?: TomeSearch | null;
};

/** Execute Imp graphs that contain a host-delegated `search` transform (sync SQL path). */
export function runSearchImpGraphSql(
  _store: TomeGraphStoreBase,
  cache: GraphDatabase,
  graph: ImpGraph,
  context?: ExecuteImpContext,
  search?: TomeSearch | null,
): ImpCollectionResult {
  const query = resolveSearchQueryFromGraph(graph, context);
  const limit = resolveLimitFromGraph(graph, 20);
  const allowedTypeIds = context?.allowedTypeIds;
  const selectedProjection = context?.participatesInProjectionType?.trim();
  const pickingRole = context?.onlyActivePickingRole === "source" ? "source" : "target";
  const hostProjection = selectedProjection
    ? onlyActiveHostProjectionType(selectedProjection, pickingRole)
    : null;
  const allowedNodeIds = hostProjection
    ? new Set(cache.listSourceNodeIdsForProjectionType(hostProjection))
    : undefined;

  const trimmed = query.trim();
  if (!trimmed) {
    const summaries = listRecentNodes(cache, limit, allowedTypeIds, allowedNodeIds);
    return {
      columns: ["id", "title"],
      rows: summaries.map((row) => ({ id: row.id, title: row.title })),
    };
  }

  if (!search) {
    return { columns: ["id", "title"], rows: [] };
  }

  const hitsOrPromise = search.search({
    query: trimmed,
    limit,
    allowedTypeIds,
    allowedNodeIds,
  });
  if (hitsOrPromise instanceof Promise) {
    throw new Error("Async TomeSearch is not supported on the sync Imp SQL path");
  }
  return {
    columns: ["id", "title"],
    rows: hitsOrPromise.map((row) => ({
      id: row.id,
      title: row.title,
      ...(row.matchPreview ? { matchPreview: row.matchPreview } : {}),
    })),
  };
}
