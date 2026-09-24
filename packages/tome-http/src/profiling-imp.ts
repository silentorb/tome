/** Compile Imp collection graphs against the profiling spans SQLite table. */

import { coreNodeLibrary, type Graph } from "imp-core-types";
import { collectionTransformsLibrary } from "imp-collection-transforms";
import { createRegistry, loadLibrary } from "imp-registry";
import { compileSql, graphToKysely } from "imp-sql";
import {
  getProfilingStore,
  PROFILING_SPANS_TABLE,
  type ProfilingStore,
} from "tome-service-interfaces";

const PROFILING_SCHEMA = { table: PROFILING_SPANS_TABLE } as const;

let registryCache: ReturnType<typeof createRegistry> | null = null;

function profilingRegistry() {
  if (!registryCache) {
    registryCache = loadLibrary(
      loadLibrary(createRegistry(), coreNodeLibrary),
      collectionTransformsLibrary,
    );
  }
  return registryCache;
}

export type ProfilingImpResult = {
  columns: string[];
  rows: Record<string, unknown>[];
};

export function executeProfilingImp(
  graph: Graph,
  store: ProfilingStore | null = getProfilingStore(),
): ProfilingImpResult {
  if (!store) {
    throw new Error("Profiling store is not open");
  }
  const compiled = graphToKysely(graph, {
    registry: profilingRegistry(),
    schema: PROFILING_SCHEMA,
  });
  const { sql, parameters } = compileSql(compiled);
  const rows = store.queryAll(
    sql,
    parameters as readonly import("bun:sqlite").SQLQueryBindings[],
  );
  const columns = rows[0] ? Object.keys(rows[0]) : ["id"];
  return { columns, rows };
}
