import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExtensionGraphQueryServices } from "tome-interfaces/extension-services/graph-query";
import type { ExtensionSqlQueryServices } from "tome-interfaces/extension-services/sql-query";
import type { ReactFlowGraph } from "imp-react-flow";
import { projectionType } from "tome-imp-sql";
import type { DependsConstraint, SequencingProblem } from "tome-sequencing-interfaces";
import { resolve as resolveSequence } from "tome-sequencing-resolution";
import { compileReactFlowQuery } from "tome-query/execute";
import { bindPageNodeId, parseSequencingBlockData } from "./config";
import { buildTimelineLayout, type TimelineLayout } from "./layout";
import { loadTableSequencingConfig } from "./sequencing-file";

function loadEnumOptions(
  contentDir: string,
  enumId: string,
): string[] | null {
  const path = resolve(contentDir, "model", "schema.json");
  if (!existsSync(path)) return null;
  try {
    const schema = JSON.parse(readFileSync(path, "utf-8")) as {
      enums?: Record<string, { options?: string[] }>;
    };
    const options = schema.enums?.[enumId]?.options;
    return Array.isArray(options) ? options.filter((o): o is string => typeof o === "string") : null;
  } catch {
    return null;
  }
}

function decodeTrackValue(
  value: unknown,
  enumOptions: string[] | null,
): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && enumOptions && enumOptions[value] !== undefined) {
    return enumOptions[value]!;
  }
  return null;
}

function contentDirFromEnv(): string {
  const fromEnv = process.env.TOME_CONTENT_PATH;
  if (fromEnv && fromEnv.trim()) return resolve(fromEnv);
  throw new Error("TOME_CONTENT_PATH is required to load sequencing.json");
}

export async function runEventQuery(input: {
  sqlQuery: ExtensionSqlQueryServices;
  reactFlow: ReactFlowGraph;
  pageNodeId: string;
}): Promise<Record<string, unknown>[]> {
  const bound = bindPageNodeId(input.reactFlow, input.pageNodeId);
  const { sql, parameters } = compileReactFlowQuery(bound);
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

function trackFromRow(
  row: Record<string, unknown>,
  trackProperty: string | null | undefined,
  enumOptions: string[] | null = null,
): string {
  if (!trackProperty) return "default";
  const direct = decodeTrackValue(row[trackProperty], enumOptions);
  if (direct) return direct;
  const props = propertiesFromRow(row);
  return decodeTrackValue(props[trackProperty], enumOptions) ?? "default";
}

export async function arrangeTimeline(input: {
  pageNodeId: string;
  blockData: unknown;
  sqlQuery: ExtensionSqlQueryServices;
  graphQuery?: ExtensionGraphQueryServices;
  contentDir?: string;
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
  });

  const trackEnumOptions = config.trackProperty
    ? loadEnumOptions(contentDir, config.trackProperty)
    : null;

  const titles = new Map<string, string>();
  const trackById = new Map<string, string>();
  const eventIds: string[] = [];
  for (const row of rows) {
    const id = typeof row.id === "string" ? row.id : null;
    if (!id) continue;
    eventIds.push(id);
    titles.set(id, titleFromRow(row, id));
    trackById.set(id, trackFromRow(row, config.trackProperty, trackEnumOptions));
  }

  // Prefer track values from membership-edge properties when configured (e.g. Arcs `layer`).
  if (config.trackProperty && config.membershipAssociation) {
    const type0 = projectionType(config.membershipAssociation, 0);
    const membershipRows = await input.sqlQuery.queryAll(
      `select target_node_id as id, properties from relationship_projections
       where source_node_id = ? and type = ?`,
      [input.pageNodeId, type0],
    );
    for (const m of membershipRows) {
      const id = typeof m.id === "string" ? m.id : null;
      if (!id || !trackById.has(id)) continue;
      const track = trackFromRow(m, config.trackProperty, trackEnumOptions);
      if (track !== "default") trackById.set(id, track);
    }
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

  return buildTimelineLayout({
    resolved: resolved.events,
    titles,
    trackById,
    depends,
  });
}
