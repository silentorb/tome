import type { Graph } from "imp-spec";
import type { SchemaFile } from "tome-flatfile/schema-file";
import { compileSql, graphToKysely } from "imp-sql";
import { createTomeImpRegistry } from "./registry";
import { applyLiveNodesConstraint, createTomeLiveNodesSchema } from "./schema";
import {
  corpusIdPredicateSql,
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
}

/** Lower an Imp graph against the Tome cache schema (live nodes + projections). */
export function compileImpGraphToTomeSql(
  graph: Graph,
  options?: CompileImpGraphToTomeSqlOptions,
): CompiledTomeImpSql {
  const constraint = resolveCorpusConstraint(graph, options);
  const lowered = spliceCorpusNodes(graph);
  const compiled = graphToKysely(lowered, {
    registry: createTomeImpRegistry(),
    schema: createTomeLiveNodesSchema(options?.schema),
  });
  const { sql, parameters } = compileSql(compiled);
  const corpusPredicate =
    constraint.nodeIds === null ? undefined : corpusIdPredicateSql(constraint.nodeIds);
  return applyLiveNodesConstraint(sql, parameters, corpusPredicate);
}
