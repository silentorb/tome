import { resolve } from "node:path";
import type { ExtensionGraphQueryServices } from "tome-interfaces/extension-services/graph-query";
import type { ExtensionSqlQueryServices } from "tome-interfaces/extension-services/sql-query";
import type { ReactFlowGraph } from "imp-react-flow";
import { projectionType } from "tome-imp-sql";
import type { DependsConstraint, SequencingProblem } from "tome-sequencing-interfaces";
import { resolve as resolveSequence } from "tome-sequencing-resolution";
import { compileReactFlowQuery } from "tome-query/execute";
import { loadSchemaFromContent } from "tome-flatfile/schema-load";
import {
  bindGraphParameters,
  resolveGraphParameterValues,
  type GraphParameterValue,
} from "tome-query/parameters";
import { bindPageNodeId, parseSequencingBlockData } from "./config";
import { buildTimelineLayoutFromResolved, type TimelineLayout } from "./layout";
import { loadTableSequencingConfig } from "./sequencing-file";

function contentDirFromEnv(): string {
  const fromEnv = process.env.TOME_CONTENT_PATH;
  if (fromEnv && fromEnv.trim()) return resolve(fromEnv);
  throw new Error("TOME_CONTENT_PATH is required to load sequencing.json");
}

function schemaFromContentDir(contentDir?: string) {
  if (contentDir) return loadSchemaFromContent(contentDir);
  const fromEnv = process.env.TOME_CONTENT_PATH;
  if (fromEnv?.trim()) return loadSchemaFromContent(resolve(fromEnv.trim()));
  return undefined;
}

export async function runEventQuery(input: {
  sqlQuery: ExtensionSqlQueryServices;
  reactFlow: ReactFlowGraph;
  pageNodeId: string;
  parameters?: Record<string, GraphParameterValue>;
  contentDir?: string;
}): Promise<Record<string, unknown>[]> {
  const values = resolveGraphParameterValues(input.reactFlow, input.parameters);
  const withParams = bindGraphParameters(input.reactFlow, values);
  const bound = bindPageNodeId(withParams, input.pageNodeId);
  const schema = schemaFromContentDir(input.contentDir);
  const { sql, parameters } = compileReactFlowQuery(bound, { schema });
  return input.sqlQuery.queryAll(sql, parameters);
}

async function dependsFromGraphEdgesAsync(
  graphQuery: ExtensionGraphQueryServices,
  eventIds: string[],
  dependsAssociation: string,
): Promise<DependsConstraint[]> {
  // Direction 0 projections are a→b (prerequisite→dependent for Arcs data).
  const type0 = projectionType(dependsAssociation, 0);
  const edges = await Promise.resolve(
    graphQuery.listEdges({
      nodeIds: eventIds,
      types: [type0],
    }),
  );
  const idSet = new Set(eventIds);
  const depends: DependsConstraint[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    if (!idSet.has(edge.sourceId) || !idSet.has(edge.targetId)) continue;
    const key = `${edge.sourceId}\0${edge.targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    depends.push({
      prerequisiteId: edge.sourceId,
      dependentId: edge.targetId,
    });
  }
  return depends;
}

function propertiesFromRow(row: Record<string, unknown>): Record<string, unknown> {
  const props = row.properties;
  if (props && typeof props === "object" && !Array.isArray(props)) {
    return props as Record<string, unknown>;
  }
  if (typeof props === "string") {
    try {
      const parsed = JSON.parse(props) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* ignore */
    }
  }
  return {};
}

function titleFromRow(row: Record<string, unknown>, id: string): string {
  if (typeof row.title === "string" && row.title.trim()) return row.title.trim();
  const props = propertiesFromRow(row);
  if (typeof props.title === "string" && props.title.trim()) return props.title.trim();
  return id;
}

export async function arrangeTimeline(input: {
  pageNodeId: string;
  blockData: unknown;
  sqlQuery: ExtensionSqlQueryServices;
  graphQuery?: ExtensionGraphQueryServices;
  contentDir?: string;
  parameters?: Record<string, GraphParameterValue>;
}): Promise<TimelineLayout> {
  const contentDir = input.contentDir ?? contentDirFromEnv();
  const config = loadTableSequencingConfig(input.pageNodeId, contentDir);
  if (!config) {
    throw new Error(`No sequencing.json entry for table "${input.pageNodeId}"`);
  }
  if (!input.graphQuery) {
    throw new Error("graphQuery host service is required for depends edges");
  }

  const parsed = parseSequencingBlockData(input.blockData);
  const rows = await runEventQuery({
    sqlQuery: input.sqlQuery,
    reactFlow: parsed.reactFlow,
    pageNodeId: input.pageNodeId,
    parameters: input.parameters,
    contentDir,
  });

  const titles = new Map<string, string>();
  const eventIds: string[] = [];
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id : null;
    if (!id) continue;
    eventIds.push(id);
    titles.set(id, titleFromRow(row, id));
  }

  const depends = await dependsFromGraphEdgesAsync(
    input.graphQuery,
    eventIds,
    config.dependsAssociation,
  );

  const problem: SequencingProblem = {
    events: eventIds.map((id) => ({ id })),
    depends,
    defaultDuration: config.defaultDuration,
  };

  const resolved = resolveSequence(problem);
  if (!resolved.ok) {
    throw new Error(resolved.error.message);
  }

  return buildTimelineLayoutFromResolved({
    resolved: resolved.events,
    titles,
    depends,
  });
}
