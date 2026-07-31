import type { Graph } from "imp-spec";
import { compileSql, graphToKysely } from "imp-sql";
import { createTomeImpRegistry } from "./registry";
import { applyLiveNodesConstraint, tomeLiveNodesSchema } from "./schema";

export interface CompiledTomeImpSql {
  sql: string;
  parameters: unknown[];
}

/** Lower an Imp graph against the Tome cache schema (live nodes + projections). */
export function compileImpGraphToTomeSql(graph: Graph): CompiledTomeImpSql {
  const compiled = graphToKysely(graph, {
    registry: createTomeImpRegistry(),
    schema: tomeLiveNodesSchema,
  });
  const { sql, parameters } = compileSql(compiled);
  return applyLiveNodesConstraint(sql, parameters);
}
