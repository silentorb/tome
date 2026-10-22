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
  definitions: [
    {
      id: CORPUS_NODE_TYPE_ID,
      inputs: {
        collection: port("collection", collection),
        id: port("id", string, PAGE_CORPUS_SPEC),
      },
      outputs: {
        collection: port("collection", collection),
      },
    },
  ],
};

export interface TomeCorpusLookup {
  corpusIdForNode(nodeId: string): string | null | Promise<string | null>;
  nodeIdsInCorpus(corpusId: string): readonly string[] | Promise<readonly string[]>;
}

export interface ResolvedCorpusConstraint {
  /**
   * Resolved corpus slug, or null when there is no corpus filter (`all` / no corpus node).
   * SQL hosts prefer `corpusColumnPredicateSql(corpusId)` over materializing ids.
   */
  corpusId: string | null;
  /**
   * Optional id list for flatfile hosts. Null when unused (SQL column predicate) or no filter.
   */
  nodeIds: readonly string[] | null;
}

export type ResolveCorpusConstraintOptions = {
  pageNodeId?: string;
  corpus?: TomeCorpusLookup;
  /**
   * When true, call `nodeIdsInCorpus` after resolving the corpus id (flatfile execute hosts).
   * SQL compile leaves this false and filters with `nodes.corpus_id`.
   */
  materializeNodeIds?: boolean;
};

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

export async function resolveCorpusConstraint(
  graph: Graph,
  options?: ResolveCorpusConstraintOptions,
): Promise<ResolvedCorpusConstraint> {
  const corpusNodes = Object.values(graph.nodes).filter((node) => node.type === CORPUS_NODE_TYPE_ID);
  if (corpusNodes.length === 0) {
    return { corpusId: null, nodeIds: null };
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
    return { corpusId: null, nodeIds: null };
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
    const resolved = await lookup.corpusIdForNode(pageNodeId);
    if (!resolved) {
      throw new Error(`corpus id "page": no corpus owns node "${pageNodeId}"`);
    }
    corpusId = resolved;
  }

  if (options?.materializeNodeIds) {
    return { corpusId, nodeIds: [...(await lookup.nodeIdsInCorpus(corpusId))] };
  }
  return { corpusId, nodeIds: null };
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

/** Live-nodes filter by owning corpus column (preferred on SQLite hosts). */
export function corpusColumnPredicateSql(corpusId: string): string {
  return `and "corpus_id" = ${sqlStringLiteral(corpusId)}`;
}

/** Live-nodes filter by explicit id set (flatfile / legacy materialization). */
export function corpusNodeIdsPredicateSql(nodeIds: readonly string[]): string {
  if (nodeIds.length === 0) return "and 0";
  return `and "id" in (${nodeIds.map(sqlStringLiteral).join(", ")})`;
}

/**
 * @deprecated Use {@link corpusNodeIdsPredicateSql} or {@link corpusColumnPredicateSql}.
 * Kept as an alias of the id-list form for older call sites during migration.
 */
export const corpusIdPredicateSql = corpusNodeIdsPredicateSql;
