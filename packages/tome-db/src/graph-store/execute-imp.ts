import { executeGraph } from "imp-execution";
import type { Graph } from "imp-spec";
import {
  compileImpGraphToTomeSql,
  createTomeImpRegistry,
  resolveCorpusConstraint,
  spliceCorpusNodes,
  type TomeCorpusLookup,
} from "tome-imp-sql";
import { createFlatfileExecutionHost } from "tome-imp-flatfile";
import type {
  ExecuteImpContext,
  ImpCollectionResult,
  ImpExecutionBackend,
  ImpGraph,
  TomeGraphStoreBase,
} from "tome-graph-interfaces";
import type { GraphDatabase } from "tome-sqlite";
import { loadSchemaFromContent } from "tome-flatfile";

export interface RunExecuteImpOptions {
  backend: ImpExecutionBackend;
  store: TomeGraphStoreBase;
  graph: ImpGraph;
  context?: ExecuteImpContext;
  cache?: GraphDatabase;
  corpus?: TomeCorpusLookup;
}

function impGraphToGraph(graph: ImpGraph): Graph {
  return graph as Graph;
}

function applyParameters(graph: Graph, parameters?: Record<string, unknown>): Graph {
  if (!parameters || Object.keys(parameters).length === 0) return graph;
  const nodes = { ...graph.nodes };
  for (const node of Object.values(nodes)) {
    if (node.type !== "parameter") continue;
    const label = node.inputs?.label;
    if (typeof label !== "string" || !(label in parameters)) continue;
    nodes[node.id] = {
      ...node,
      inputs: { ...node.inputs, value: parameters[label] as string | number | boolean | null },
    };
  }
  return { ...graph, nodes };
}

function corpusLookupFromStore(store: TomeGraphStoreBase): TomeCorpusLookup {
  return {
    corpusIdForNode(nodeId: string): string | null {
      return store.locateNode(nodeId);
    },
    nodeIdsInCorpus(corpusId: string): readonly string[] {
      return store.listNodeIds().filter((id) => store.locateNode(id) === corpusId);
    },
  };
}

function filterRowsByCorpus(
  result: ImpCollectionResult,
  nodeIds: readonly string[] | null,
): ImpCollectionResult {
  if (nodeIds === null) return result;
  const allowed = new Set(nodeIds);
  return {
    columns: result.columns,
    rows: result.rows.filter((row) => typeof row.id === "string" && allowed.has(row.id)),
  };
}

/** Execute an Imp graph via SQL lowering or imp-execution over flatfile. */
export async function runExecuteImp(options: RunExecuteImpOptions): Promise<ImpCollectionResult> {
  const corpus = options.corpus ?? corpusLookupFromStore(options.store);
  let graph = applyParameters(impGraphToGraph(options.graph), options.context?.parameters);
  const constraint = resolveCorpusConstraint(graph, {
    pageNodeId: options.context?.pageNodeId,
    corpus,
  });
  graph = spliceCorpusNodes(graph);

  if (options.backend === "sql") {
    if (!options.cache) {
      throw new Error("SQL executeImp backend requires a query cache");
    }
    const contentDir = options.store.contentDir;
    const compiled = compileImpGraphToTomeSql(graph, {
      schema: loadSchemaFromContent(contentDir),
      pageNodeId: options.context?.pageNodeId,
      corpus,
    });
    const rows = options.cache.queryAll(compiled.sql, ...compiled.parameters);
    return filterRowsByCorpus({ columns: rows[0] ? Object.keys(rows[0]) : ["id"], rows }, constraint.nodeIds);
  }

  const host = createFlatfileExecutionHost(options.store, {
    liveOnly: true,
    corpusNodeIds: constraint.nodeIds,
  });
  const executed = await executeGraph(graph, {
    registry: createTomeImpRegistry(),
    host,
  });
  return filterRowsByCorpus(executed, constraint.nodeIds);
}

/** Synchronous SQL-only execute when backend is known to be sql. */
export function runExecuteImpSql(
  store: TomeGraphStoreBase,
  cache: GraphDatabase,
  graph: ImpGraph,
  context?: ExecuteImpContext,
): ImpCollectionResult {
  const corpus = corpusLookupFromStore(store);
  let impGraph = applyParameters(impGraphToGraph(graph), context?.parameters);
  resolveCorpusConstraint(impGraph, { pageNodeId: context?.pageNodeId, corpus });
  impGraph = spliceCorpusNodes(impGraph);
  const compiled = compileImpGraphToTomeSql(impGraph, {
    schema: loadSchemaFromContent(store.contentDir),
    pageNodeId: context?.pageNodeId,
    corpus,
  });
  const rows = cache.queryAll(compiled.sql, ...compiled.parameters);
  return { columns: rows[0] ? Object.keys(rows[0]) : ["id"], rows };
}
