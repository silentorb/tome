import type { Graph } from "imp-spec";
import type { ExecuteImpContext, ImpCollectionResult, ImpGraph } from "tome-graph-interfaces";
import type { GraphDatabase } from "tome-sqlite";
import type { TomeGraphStoreBase } from "tome-graph-interfaces";
import { performTomeTextSearch } from "../search-text";

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

/** Execute Imp graphs that contain a host-delegated `search` transform (sync SQL path). */
export function runSearchImpGraphSql(
  _store: TomeGraphStoreBase,
  cache: GraphDatabase,
  graph: ImpGraph,
  context?: ExecuteImpContext,
): ImpCollectionResult {
  const query = resolveSearchQueryFromGraph(graph, context);
  const limit = resolveLimitFromGraph(graph, 20);
  const allowedTypeIds = context?.allowedTypeIds;
  const summaries = performTomeTextSearch(cache, query, limit, allowedTypeIds);
  return {
    columns: ["id", "title"],
    rows: summaries.map((row) => ({
      id: row.id,
      title: row.title,
      ...(row.matchPreview ? { matchPreview: row.matchPreview } : {}),
    })),
  };
}
