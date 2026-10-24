import type { PropertyFieldSection } from "tome-graph-interfaces";
import type { RelationshipReadStore } from "./graph-store/relationship-read";
import {
  listRelationshipsFromSource,
  readStoreGetNode,
} from "./graph-store/relationship-read";
import { typeIdsForInstance } from "./node-capabilities";
import { loadTableSchemaForDatabase } from "./database-column-defs";
import {
  columnStorage,
  loadRelationshipTypesFromContent,
  memberSideProjectionTypes,
  resolveContentPath,
  structuredColumns,
} from "tome-flatfile";

function structuredValueFromBag(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof value === "object") return value;
  return null;
}

async function edgePropertiesForHub(
  db: RelationshipReadStore,
  nodeId: string,
  databaseId: string,
  contentDir: string,
): Promise<Record<string, unknown> | null> {
  const registry = loadRelationshipTypesFromContent(contentDir);
  for (const type of memberSideProjectionTypes(registry)) {
    const connections = await listRelationshipsFromSource(db, nodeId, type);
    const toHub = connections.find((c) => c.targetNodeId === databaseId);
    if (toHub) return toHub.properties as Record<string, unknown>;
  }
  return null;
}

/**
 * Build below-body property sections for structured columns (`imp_graph`, `json`)
 * declared on type tables the instance belongs to. Presentation inference is by
 * column type (data nature), not a schema layout flag.
 */
export async function buildPropertyFieldSections(
  db: RelationshipReadStore,
  nodeId: string,
  contentDir?: string,
): Promise<PropertyFieldSection[]> {
  const dir = contentDir ?? resolveContentPath();
  const typeIds = await typeIdsForInstance(db, nodeId, dir);
  if (typeIds.length === 0) return [];

  const node = await readStoreGetNode(db, nodeId);
  if (!node) return [];

  const sections: PropertyFieldSection[] = [];
  const seenKeys = new Set<string>();

  for (const databaseId of typeIds.slice().sort((a, b) => a.localeCompare(b))) {
    const schema = loadTableSchemaForDatabase(databaseId, dir);
    if (!schema) continue;
    const cols = structuredColumns(schema);
    if (cols.length === 0) continue;

    let edgeProps: Record<string, unknown> | null | undefined;

    for (const col of cols) {
      if (seenKeys.has(col.key)) continue;
      seenKeys.add(col.key);
      const storage = columnStorage(col);
      let value: unknown = null;
      if (storage === "node") {
        value = structuredValueFromBag(node.properties[col.key]);
      } else {
        if (edgeProps === undefined) {
          edgeProps = await edgePropertiesForHub(db, nodeId, databaseId, dir);
        }
        value = structuredValueFromBag(edgeProps?.[col.key]);
      }
      sections.push({
        type: "property",
        key: col.key,
        title: col.name,
        columnType: col.type,
        storage,
        databaseId,
        value,
      });
    }
  }

  return sections;
}

export type { PropertyFieldSection };
