/** Tome-only Imp corpus operator. Catalog + pre-SQL rewrite — not lowered by imp-sql. */

import type { Graph, Node, NodeLibrary, Port, SignalType } from "imp-core-types";

export const CORPUS_NODE_TYPE_ID = "corpus";
export const PAGE_CORPUS_SPEC = "page";
export const ALL_CORPORA_SPEC = "all";

const collection: SignalType = { id: "collection" };
const string: SignalType = { id: "string" };

function port(id: string, type: SignalType, defaultValue?: Port["defaultValue"]): Port {
  return defaultValue === undefined ? { id, type } : { id, type, defaultValue };
}

export const tomeCorpusLibrary: NodeLibrary = {
  id: "tome.corpus",
  types: {
    [CORPUS_NODE_TYPE_ID]: {
      id: CORPUS_NODE_TYPE_ID,
      inputs: {
        collection: port("collection", collection),
        id: port("id", string, PAGE_CORPUS_SPEC),
      },
      outputs: {
        collection: port("collection", collection),
      },
    },
  },
};

export interface TomeCorpusLookup {
  corpusIdForNode(nodeId: string): string | null;
  nodeIdsInCorpus(corpusId: string): readonly string[];
}

export interface ResolvedCorpusConstraint {
  /** Null means no extra id filter (`all` or no corpus node). */
  nodeIds: readonly string[] | null;
}

function inboundEdge(graph: Graph, nodeId: string, portId: string) {
  return Object.values(graph.edges).find((edge) => edge.to.node === nodeId && edge.to.port === portId);
}

function corpusSpecFromNode(graph: Graph, node: Node): string {
  const edge = inboundEdge(graph, node.id, "id");
  if (edge) {
    const from = graph.nodes[edge.from.node];
    if (from?.type === "literal" || from?.type === "parameter") {
      const value = from.inputs?.value;
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  const local = node.inputs?.id;
  if (typeof local === "string" && local.trim()) return local.trim();
  return PAGE_CORPUS_SPEC;
}

export function resolveCorpusConstraint(
  graph: Graph,
  options?: { pageNodeId?: string; corpus?: TomeCorpusLookup },
): ResolvedCorpusConstraint {
  const corpusNodes = Object.values(graph.nodes).filter((node) => node.type === CORPUS_NODE_TYPE_ID);
  if (corpusNodes.length === 0) {
    return { nodeIds: null };
  }

  const specs = corpusNodes.map((node) => corpusSpecFromNode(graph, node));
  const unique = [...new Set(specs)];
  if (unique.length > 1) {
    throw new Error(
      `Query has conflicting corpus operators (${unique.join(", ")}); v1 allows one resolved corpus`,
    );
  }
  const spec = unique[0]!;
  if (spec === ALL_CORPORA_SPEC) {
    return { nodeIds: null };
  }

  const lookup = options?.corpus;
  if (!lookup) {
    throw new Error("corpus operator requires host corpusQuery services");
  }

  let corpusId = spec;
  if (spec === PAGE_CORPUS_SPEC) {
    const pageNodeId = options?.pageNodeId?.trim();
    if (!pageNodeId) {
      throw new Error('corpus id "page" requires the page node id');
    }
    const resolved = lookup.corpusIdForNode(pageNodeId);
    if (!resolved) {
      throw new Error(`corpus id "page": no corpus owns node "${pageNodeId}"`);
    }
    corpusId = resolved;
  }

  return { nodeIds: [...lookup.nodeIdsInCorpus(corpusId)] };
}

function newEdgeId(edges: Graph["edges"], prefix: string): string {
  let i = 0;
  let id = prefix;
  while (edges[id]) {
    i += 1;
    id = `${prefix}_${i}`;
  }
  return id;
}

/** Remove corpus operators, rewiring collection through as a passthrough. */
export function spliceCorpusNodes(graph: Graph): Graph {
  const corpusIds = Object.values(graph.nodes)
    .filter((node) => node.type === CORPUS_NODE_TYPE_ID)
    .map((node) => node.id);
  if (corpusIds.length === 0) return graph;

  const nodes = { ...graph.nodes };
  const edges = { ...graph.edges };

  for (const corpusId of corpusIds) {
    const inbound = Object.entries(edges).filter(
      ([, edge]) => edge.to.node === corpusId && edge.to.port === "collection",
    );
    const outbound = Object.entries(edges).filter(
      ([, edge]) => edge.from.node === corpusId && edge.from.port === "collection",
    );
    const inboundCollection = inbound[0]?.[1];

    for (const [edgeId] of inbound) delete edges[edgeId];
    for (const [edgeId] of outbound) delete edges[edgeId];
    for (const [edgeId, edge] of Object.entries(edges)) {
      if (edge.from.node === corpusId || edge.to.node === corpusId) {
        delete edges[edgeId];
      }
    }
    delete nodes[corpusId];

    if (!inboundCollection) continue;
    for (const [, outEdge] of outbound) {
      const id = newEdgeId(edges, `e_splice_${corpusId}`);
      edges[id] = {
        from: inboundCollection.from,
        to: outEdge.to,
      };
    }
  }

  return { nodes, edges };
}

const SAFE_ID_RE = /^[\w.-]+$/;

function sqlStringLiteral(value: string): string {
  if (!SAFE_ID_RE.test(value)) {
    throw new Error(`Invalid node id for corpus constraint "${value}"`);
  }
  return `'${value.replace(/'/g, "''")}'`;
}

export function corpusIdPredicateSql(nodeIds: readonly string[]): string {
  if (nodeIds.length === 0) return "and 0";
  return `and "id" in (${nodeIds.map(sqlStringLiteral).join(", ")})`;
}
