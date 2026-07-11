import type { GraphDatabase, Node, Properties } from "./graph";
import { memberSetIds } from "./set-membership";
import { resolveContentPath } from "./content/paths";
import { loadRelationshipTypesFromContent } from "./relationship-types/load";
import { hasTableSchemaEntry, loadTableSchemasFromContent } from "./table-schemas/load";
import { memberSidePerspectives, setSidePerspectives } from "./relationship-type-traits";

function titleFromProperties(properties: Record<string, unknown>): string {
  const title = properties.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const alias = properties.alias;
  if (typeof alias === "string" && alias.trim()) return alias.trim();
  return "Untitled";
}

export function hasIncomingIsA(db: GraphDatabase, nodeId: string, contentDir?: string): boolean {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadRelationshipTypesFromContent(dir);
  for (const perspective of memberSidePerspectives(registry)) {
    if (db.listRelationshipsToTarget(nodeId, perspective).length > 0) return true;
  }
  for (const perspective of setSidePerspectives(registry)) {
    if (db.listRelationshipsFromSource(nodeId, perspective).length > 0) return true;
  }
  return false;
}

export function isTypeTableNode(
  db: GraphDatabase,
  nodeId: string,
  contentDir?: string,
): boolean {
  const dir = contentDir ?? resolveContentPath();
  if (hasTableSchemaEntry(dir, nodeId)) return true;
  return hasIncomingIsA(db, nodeId, dir);
}

export function typeIdsForInstance(
  db: GraphDatabase,
  nodeId: string,
  contentDir?: string,
): string[] {
  return memberSetIds(db, nodeId, contentDir);
}

/** Lexicographically first IS_A type title for an instance page, when any. */
export function primaryTypeTitleForInstance(
  db: GraphDatabase,
  nodeId: string,
): string | null {
  const titles: string[] = [];
  for (const typeId of typeIdsForInstance(db, nodeId)) {
    const typeNode = db.getNode(typeId);
    if (!typeNode) continue;
    const title = titleFromProperties(typeNode.properties);
    if (title !== "Untitled") titles.push(title);
  }
  if (titles.length === 0) return null;
  titles.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return titles[0]!;
}

export function isTypeTableCandidate(
  node: Pick<Node, "properties"> & { id?: string },
  db?: GraphDatabase,
  nodeId?: string,
  contentDir?: string,
): boolean {
  if (nodeId && hasTableSchemaEntry(contentDir ?? resolveContentPath(), nodeId)) {
    return true;
  }
  if (db && nodeId) return hasIncomingIsA(db, nodeId, contentDir);
  return false;
}

export function findTypeNodeByTitle(
  db: GraphDatabase,
  title: string,
  contentDir?: string,
): string | null {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return null;

  const dir = contentDir ?? resolveContentPath();
  const schemas = loadTableSchemasFromContent(dir);
  for (const typeId of Object.keys(schemas.tables)) {
    const node = db.getNode(typeId);
    if (!node) continue;
    if (titleFromProperties(node.properties).toLowerCase() === normalized) return typeId;
  }

  for (const row of db.listNodesForGraphExport()) {
    if (!isTypeTableCandidate({ properties: db.getNode(row.id)?.properties ?? {} }, db, row.id, dir)) {
      continue;
    }
    if (row.title.trim().toLowerCase() === normalized) return row.id;
  }
  return null;
}

export function graphGroupForNode(db: GraphDatabase, nodeId: string): string {
  const node = db.getNode(nodeId);
  if (!node) return "Unknown";

  if (isTypeTableNode(db, nodeId)) {
    const title = titleFromProperties(node.properties);
    return title === "Untitled" ? "TypeTable" : title;
  }

  const typeTitle = primaryTypeTitleForInstance(db, nodeId);
  if (typeTitle) return typeTitle;

  return "Node";
}

/** Labels for graph export / visualization (derived from IS_A type and node kind). */
export function graphLabelsForNode(db: GraphDatabase, nodeId: string): string[] {
  const node = db.getNode(nodeId);
  if (!node) return ["Unknown"];

  if (isTypeTableNode(db, nodeId)) {
    return ["TypeTable"];
  }

  const typeTitle = primaryTypeTitleForInstance(db, nodeId);
  if (typeTitle) return [typeTitle];

  return ["Node"];
}

/** Minimal properties so tests and tooling can mark a node as a type table without labels. */
export function typeTableMarkerProperties(title: string): Properties {
  return { title };
}

export function nodeMatchesTargetTypes(
  db: GraphDatabase,
  targetNodeId: string,
  allowedTypeIds: readonly string[],
  contentDir?: string,
): boolean {
  if (allowedTypeIds.length === 0) return true;
  const targetTypes = typeIdsForInstance(db, targetNodeId, contentDir);
  return targetTypes.some((id) => allowedTypeIds.includes(id));
}
