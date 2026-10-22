import type { Graph } from "imp-core-types";
import type { SchemaFile } from "tome-flatfile/schema-file";
import { compileSql, compileSqlite } from "imp-sql";
import { createTomeImpRegistry } from "./registry";
import { applyLiveNodesConstraint, createTomeLiveNodesSchema } from "./schema";
import {
  corpusColumnPredicateSql,
  corpusNodeIdsPredicateSql,
  resolveCorpusConstraint,
  spliceCorpusNodes,
  type TomeCorpusLookup,
} from "./corpus";

export interface CompiledTomeImpSql {
  sql: string;
  parameters: unknown[];
}

export interface CompileImpGraphToTomeSqlOptions {
  schema?: SchemaFile;
  pageNodeId?: string;
  corpus?: TomeCorpusLookup;
  /**
   * When true, materialize corpus membership as `id IN (…)` (flatfile hosts).
   * Default false — prefer indexed `corpus_id` column predicate on SQLite.
   */
  materializeCorpusNodeIds?: boolean;
}

/** Lower an Imp graph against the Tome cache schema (live nodes + projections). */
export async function compileImpGraphToTomeSql(
  graph: Graph,
  options?: CompileImpGraphToTomeSqlOptions,
): Promise<CompiledTomeImpSql> {
  const constraint = await resolveCorpusConstraint(graph, {
    pageNodeId: options?.pageNodeId,
    corpus: options?.corpus,
    materializeNodeIds: options?.materializeCorpusNodeIds === true,
  });
  const lowered = spliceCorpusNodes(graph);
  const compiled = compileSqlite(lowered, {
    registry: createTomeImpRegistry(),
    schema: createTomeLiveNodesSchema(options?.schema),
  });
  const { sql, parameters } = compileSql(compiled);
  let corpusPredicate: string | undefined;
  if (constraint.corpusId != null) {
    corpusPredicate =
      constraint.nodeIds != null
        ? corpusNodeIdsPredicateSql(constraint.nodeIds)
        : corpusColumnPredicateSql(constraint.corpusId);
  }
  return applyLiveNodesConstraint(sql, parameters, corpusPredicate);
}
