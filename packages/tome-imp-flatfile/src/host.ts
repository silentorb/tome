import type { ExecutionHost, ExecutionRow } from "imp-execution";
import { expandAllRelationships } from "tome-flatfile";
import type { TomeGraphStoreBase } from "tome-graph-interfaces";

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

function nodeToRow(
  store: TomeGraphStoreBase,
  id: string,
  body?: string,
): ExecutionRow | null {
  const node = store.getNode(id);
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
    is_archived: store.isNodeArchived(id),
  };
}

function buildProjectionIndex(store: TomeGraphStoreBase): Map<string, ExecutionRow[]> {
  const associations = store.readAssociations();
  const entries: { a: string; b: string; type: string; properties?: Record<string, unknown> }[] =
    [];
  store.forEachRelationshipRecord((entry) => {
    entries.push(entry);
  });
  const { projections } = expandAllRelationships(entries, associations);

  const bySource = new Map<string, ExecutionRow[]>();
  for (const projection of projections) {
    const key = `${projection.sourceNodeId}\0${projection.type}`;
    const targetRow = nodeToRow(store, projection.targetNodeId);
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
export function createFlatfileExecutionHost(
  store: TomeGraphStoreBase,
  options: FlatfileExecutionHostOptions = {},
): ExecutionHost {
  const liveOnly = options.liveOnly ?? true;
  const corpusSet =
    options.corpusNodeIds && options.corpusNodeIds.length > 0
      ? new Set(options.corpusNodeIds)
      : null;

  let projectionIndex: Map<string, ExecutionRow[]> | null = null;

  function corpusAllows(id: string): boolean {
    if (corpusSet && !corpusSet.has(id)) return false;
    return true;
  }

  function liveAllows(id: string): boolean {
    if (!liveOnly) return true;
    return !store.isNodeArchived(id);
  }

  return {
    listInputRows(): ExecutionRow[] {
      const rows: ExecutionRow[] = [];
      for (const id of store.listNodeIds()) {
        if (!corpusAllows(id) || !liveAllows(id)) continue;
        const row = nodeToRow(store, id);
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
      if (!projectionIndex) {
        projectionIndex = buildProjectionIndex(store);
      }

      const out: ExecutionRow[] = [];
      const seen = new Set<string>();

      if (direction === 0) {
        const key = `${sourceId}\0${association}`;
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
        if (type !== association) continue;
        for (const row of targets) {
          if (row.id !== sourceId) continue;
          if (!corpusAllows(fromId) || !liveAllows(fromId)) continue;
          const sourceRow = nodeToRow(store, fromId);
          if (!sourceRow) continue;
          if (!matchesEdgeFilter(row.properties, edgeProperty ?? null, edgeEquals)) continue;
          if (seen.has(fromId)) continue;
          seen.add(fromId);
          out.push(sourceRow);
        }
      }
      return out;
    },
  };
}
