import type { ExecutionHost, ExecutionRow } from "imp-execution";
import { expandAllRelationships, projectionTypeForEndpoint } from "tome-flatfile";
import type { RelationshipRecordRef, TomeGraphStoreBase } from "tome-graph-interfaces";

export interface FlatfileExecutionHostOptions {
  /** When set, only live (non-archived) nodes are returned. Default true. */
  liveOnly?: boolean;
  /** When set, restrict rows to these node ids (corpus constraint). */
  corpusNodeIds?: readonly string[] | null;
}

function titleFromProperties(properties: Record<string, unknown>): string {
  const title = properties.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const alias = properties.alias;
  if (typeof alias === "string" && alias.trim()) return alias.trim();
  return "Untitled";
}

function nodeToRowFromMaps(
  nodes: Map<string, { id: string; properties: Record<string, unknown> }>,
  archived: Set<string>,
  id: string,
  body?: string,
): ExecutionRow | null {
  const node = nodes.get(id);
  if (!node) return null;
  const properties: Record<string, unknown> = { ...node.properties };
  if (body !== undefined) {
    properties.body = body;
  } else {
    const existingBody = node.properties.body;
    if (typeof existingBody === "string") {
      properties.body = existingBody;
    }
  }
  properties.title = titleFromProperties(properties);
  return {
    id: node.id,
    properties,
    is_archived: archived.has(id),
  };
}

async function loadNodeMaps(
  store: TomeGraphStoreBase,
): Promise<{
  nodes: Map<string, { id: string; properties: Record<string, unknown> }>;
  archived: Set<string>;
  nodeIds: string[];
}> {
  const nodeIds = await store.listNodeIds();
  const nodes = new Map<string, { id: string; properties: Record<string, unknown> }>();
  const archived = new Set<string>();
  for (const id of nodeIds) {
    const node = await store.getNode(id);
    if (!node) continue;
    nodes.set(id, { id: node.id, properties: { ...node.properties } });
    if (await store.isNodeArchived(id)) archived.add(id);
  }
  return { nodes, archived, nodeIds };
}

async function buildProjectionIndex(
  store: TomeGraphStoreBase,
  nodes: Map<string, { id: string; properties: Record<string, unknown> }>,
  archived: Set<string>,
): Promise<Map<string, ExecutionRow[]>> {
  const relationshipTypes = await store.readRelationshipTypes();
  const entries: RelationshipRecordRef[] = [];
  await store.forEachRelationshipRecord((entry) => {
    entries.push(entry);
  });
  const { projections } = expandAllRelationships(entries, relationshipTypes);

  const bySource = new Map<string, ExecutionRow[]>();
  for (const projection of projections) {
    const key = `${projection.sourceNodeId}\0${projection.type}`;
    const targetRow = nodeToRowFromMaps(nodes, archived, projection.targetNodeId);
    if (!targetRow) continue;
    const list = bySource.get(key) ?? [];
    list.push({
      ...targetRow,
      properties: {
        ...targetRow.properties,
        ...projection.properties,
      },
    });
    bySource.set(key, list);
  }
  return bySource;
}

function matchesEdgeFilter(
  properties: Record<string, unknown>,
  edgeProperty: string | null,
  edgeEquals: unknown,
): boolean {
  if (edgeProperty == null) return true;
  const actual = properties[edgeProperty];
  return actual === edgeEquals;
}

/** Read-only ExecutionHost over a Base-tier flatfile graph store. */
export async function createFlatfileExecutionHost(
  store: TomeGraphStoreBase,
  options: FlatfileExecutionHostOptions = {},
): Promise<ExecutionHost> {
  const liveOnly = options.liveOnly ?? true;
  const corpusSet =
    options.corpusNodeIds && options.corpusNodeIds.length > 0
      ? new Set(options.corpusNodeIds)
      : null;

  const { nodes, archived, nodeIds } = await loadNodeMaps(store);
  const projectionIndex = await buildProjectionIndex(store, nodes, archived);

  function corpusAllows(id: string): boolean {
    if (corpusSet && !corpusSet.has(id)) return false;
    return true;
  }

  function liveAllows(id: string): boolean {
    if (!liveOnly) return true;
    return !archived.has(id);
  }

  return {
    listInputRows(): ExecutionRow[] {
      const rows: ExecutionRow[] = [];
      for (const id of nodeIds) {
        if (!corpusAllows(id) || !liveAllows(id)) continue;
        const row = nodeToRowFromMaps(nodes, archived, id);
        if (row) rows.push(row);
      }
      return rows;
    },

    traverse(
      sourceId: string,
      association: string,
      direction: 0 | 1,
      edgeProperty?: string | null,
      edgeEquals?: unknown,
    ): ExecutionRow[] {
      // Pack at the host boundary — Imp graphs keep association + direction separate.
      const projectionType = projectionTypeForEndpoint(association, direction);
      const out: ExecutionRow[] = [];
      const seen = new Set<string>();

      if (direction === 0) {
        const key = `${sourceId}\0${projectionType}`;
        for (const row of projectionIndex.get(key) ?? []) {
          if (!corpusAllows(row.id) || !liveAllows(row.id)) continue;
          if (!matchesEdgeFilter(row.properties, edgeProperty ?? null, edgeEquals)) continue;
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          out.push(row);
        }
        return out;
      }

      for (const [key, targets] of projectionIndex) {
        const [fromId, type] = key.split("\0");
        if (type !== projectionType) continue;
        for (const row of targets) {
          if (row.id !== sourceId) continue;
          if (!corpusAllows(fromId) || !liveAllows(fromId)) continue;
          const sourceRow = nodeToRowFromMaps(nodes, archived, fromId);
          if (!sourceRow) continue;
          if (!matchesEdgeFilter(row.properties, edgeProperty ?? null, edgeEquals)) continue;
          if (seen.has(fromId)) continue;
          seen.add(fromId);
          out.push(sourceRow);
        }
      }
      return out;
    },

    textSearch(rows: ExecutionRow[], query: string): ExecutionRow[] {
      const trimmed = query.trim().toLowerCase();
      if (!trimmed) return rows;

      const titleHits: ExecutionRow[] = [];
      const bodyHits: ExecutionRow[] = [];
      const seen = new Set<string>();

      for (const row of rows) {
        const title = String(row.properties.title ?? "");
        const body = String(row.properties.body ?? "");
        const titleMatch = title.toLowerCase().includes(trimmed);
        const bodyMatch = body.toLowerCase().includes(trimmed);
        if (titleMatch) {
          if (!seen.has(row.id)) {
            seen.add(row.id);
            titleHits.push(row);
          }
          continue;
        }
        if (bodyMatch && !seen.has(row.id)) {
          seen.add(row.id);
          bodyHits.push(row);
        }
      }

      return [...titleHits, ...bodyHits];
    },
  };
}
