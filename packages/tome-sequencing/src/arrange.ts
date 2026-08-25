import { resolve } from "node:path";
import type { ExtensionGraphQueryServices } from "tome-interfaces/extension-services/graph-query";
import type { ExtensionExecuteImpServices } from "tome-interfaces/extension-services/execute-imp";
import type { ReactFlowGraph } from "imp-react-flow";
import { projectionType } from "tome-imp-sql";
import type { DependsConstraint, SequencingProblem } from "tome-sequencing-interfaces";
import { resolve as resolveSequence } from "tome-sequencing-resolution";
import type { ResolvedEvent } from "tome-sequencing-resolution";
import {
  buildQueryImpGraph,
  findTerminalGroupSpecFromReactFlow,
  partitionRowsIntoGroups,
} from "tome-query/execute";
import { loadSchemaFromContent } from "tome-flatfile/schema-load";
import {
  bindGraphParameters,
  resolveGraphParameterValues,
  type GraphParameterValue,
} from "tome-query/parameters";
import { bindPageNodeId, parseSequencingBlockData } from "./config";
import { expandDependsConstraints } from "./depends-endpoints";
import {
  buildTimelineLayoutFromGroupedResolved,
  buildTimelineLayoutFromResolved,
  type TimelineLayout,
} from "./layout";
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

function bindEventQuery(input: {
  reactFlow: ReactFlowGraph;
  pageNodeId: string;
  parameters?: Record<string, GraphParameterValue>;
  contentDir?: string;
}) {
  const values = resolveGraphParameterValues(input.reactFlow, input.parameters);
  const withParams = bindGraphParameters(input.reactFlow, values);
  const bound = bindPageNodeId(withParams, input.pageNodeId);
  const schema = schemaFromContentDir(input.contentDir);
  return { bound, schema };
}

export async function runEventQuery(input: {
  executeImp: ExtensionExecuteImpServices;
  reactFlow: ReactFlowGraph;
  pageNodeId: string;
  parameters?: Record<string, GraphParameterValue>;
  contentDir?: string;
}): Promise<Record<string, unknown>[]> {
  const { bound, schema } = bindEventQuery(input);
  const graph = buildQueryImpGraph(bound, { schema, pageNodeId: input.pageNodeId });
  const executed = await Promise.resolve(
    input.executeImp.executeImp(graph, {
      pageNodeId: input.pageNodeId,
      parameters: input.parameters,
    }),
  );
  return executed.rows;
}

export async function loadDependsEdges(
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
  const seenRows = new Set<string>();
  for (const edge of edges) {
    if (!idSet.has(edge.sourceId) || !idSet.has(edge.targetId)) continue;
    const rowKey = `${edge.sourceId}\0${edge.targetId}`;
    if (seenRows.has(rowKey)) continue;
    seenRows.add(rowKey);
    const expanded = expandDependsConstraints(edge.sourceId, edge.targetId, edge.properties);
    if (!expanded) {
      throw new Error(
        `Depends edge ${edge.sourceId} → ${edge.targetId} is missing start/end endpoints`,
      );
    }
    depends.push(...expanded);
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

function eventsFromRows(rows: Record<string, unknown>[]): {
  eventIds: string[];
  titles: Map<string, string>;
} {
  const titles = new Map<string, string>();
  const eventIds: string[] = [];
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id : null;
    if (!id) continue;
    eventIds.push(id);
    titles.set(id, titleFromRow(row, id));
  }
  return { eventIds, titles };
}

function layoutResolvedGroup(input: {
  eventIds: string[];
  titles: Map<string, string>;
  depends: DependsConstraint[];
  defaultDuration: number;
}): { resolved: ResolvedEvent[]; titles: Map<string, string> } {
  const idSet = new Set(input.eventIds);
  const groupDepends = input.depends.filter(
    (edge) => idSet.has(edge.prerequisiteId) && idSet.has(edge.dependentId),
  );
  const problem: SequencingProblem = {
    events: input.eventIds.map((id) => ({ id })),
    depends: groupDepends,
    defaultDuration: input.defaultDuration,
  };
  const resolved = resolveSequence(problem);
  if (!resolved.ok) {
    throw new Error(resolved.error.message);
  }
  return { resolved: resolved.events, titles: input.titles };
}

export async function arrangeTimeline(input: {
  pageNodeId: string;
  blockData: unknown;
  executeImp: ExtensionExecuteImpServices;
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
    executeImp: input.executeImp,
    reactFlow: parsed.reactFlow,
    pageNodeId: input.pageNodeId,
    parameters: input.parameters,
    contentDir,
  });
  const { eventIds, titles } = eventsFromRows(rows);

  const depends = await loadDependsEdges(
    input.graphQuery,
    eventIds,
    config.dependsAssociation,
  );

  const boundQuery = bindEventQuery({
    reactFlow: parsed.reactFlow,
    pageNodeId: input.pageNodeId,
    parameters: input.parameters,
    contentDir,
  });
  const groupSpec = findTerminalGroupSpecFromReactFlow(boundQuery.bound);
  if (!groupSpec) {
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

  const grouped = partitionRowsIntoGroups(rows, groupSpec, boundQuery.schema);
  const groups = grouped.groups
    .map((group) => eventsFromRows(group.rows))
    .filter((group) => group.eventIds.length > 0)
    .map((group) =>
      layoutResolvedGroup({
        eventIds: group.eventIds,
        titles: group.titles,
        depends,
        defaultDuration: config.defaultDuration,
      }),
    );

  return buildTimelineLayoutFromGroupedResolved({ groups, depends });
}
