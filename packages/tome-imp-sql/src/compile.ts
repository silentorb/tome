import type { Graph } from "imp-spec";
import type { SchemaFile } from "tome-flatfile/schema-file";
import { compileSql, graphToKysely } from "imp-sql";
import { createTomeImpRegistry } from "./registry";
import { applyLiveNodesConstraint, createTomeLiveNodesSchema } from "./schema";

export interface CompiledTomeImpSql {
  sql: string;
  parameters: unknown[];
}

export interface CompileImpGraphToTomeSqlOptions {
  schema?: SchemaFile;
}

/** Lower an Imp graph against the Tome cache schema (live nodes + projections). */
export function compileImpGraphToTomeSql(
  graph: Graph,
  options?: CompileImpGraphToTomeSqlOptions,
): CompiledTomeImpSql {
  const compiled = graphToKysely(graph, {
    registry: createTomeImpRegistry(),
    schema: createTomeLiveNodesSchema(options?.schema),
  });
  const { sql, parameters } = compileSql(compiled);
  return applyLiveNodesConstraint(sql, parameters);
}
