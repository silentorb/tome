import type { Node, Properties } from "tome-graph-interfaces";
import { memberSetIds } from "./set-membership";
import { resolveContentPath } from "tome-flatfile";
import { loadAssociationsFromContent } from "tome-flatfile";
import { hasTableSchemaEntry, loadTableSchemasFromContent } from "tome-flatfile";
import { memberSideProjectionTypes, setSideProjectionTypes } from "tome-flatfile";
import {
  listRelationshipsFromSource,
  listRelationshipsToTarget,
  readStoreGetNode,
  readStoreListNodeIds,
  type RelationshipReadStore,
} from "./graph-store/relationship-read";

function titleFromProperties(properties: Record<string, unknown>): string {
  const title = properties.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const alias = properties.alias;
  if (typeof alias === "string" && alias.trim()) return alias.trim();
  return "Untitled";
}

export function hasIncomingIsA(
  store: RelationshipReadStore,
  nodeId: string,
  contentDir?: string,
): boolean {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadAssociationsFromContent(dir);
  for (const projection of memberSideProjectionTypes(registry)) {
    if (listRelationshipsToTarget(store, nodeId, projection).length > 0) return true;
  }
  for (const projection of setSideProjectionTypes(registry)) {
    if (listRelationshipsFromSource(store, nodeId, projection).length > 0) return true;
  }
  return false;
}

export function isTypeTableNode(
  store: RelationshipReadStore,
  nodeId: string,
  contentDir?: string,
): boolean {
  const dir = contentDir ?? resolveContentPath();
  if (hasTableSchemaEntry(dir, nodeId)) return true;
  return hasIncomingIsA(store, nodeId, dir);
}

export function typeIdsForInstance(
  store: RelationshipReadStore,
  nodeId: string,
  contentDir?: string,
): string[] {
  return memberSetIds(store, nodeId, contentDir);
}

/** Lexicographically first IS_A type title for an instance page, when any. */
export function primaryTypeTitleForInstance(
  store: RelationshipReadStore,
  nodeId: string,
): string | null {
  const titles: string[] = [];
  for (const typeId of typeIdsForInstance(store, nodeId)) {
    const typeNode = readStoreGetNode(store, typeId);
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
  store?: RelationshipReadStore,
  nodeId?: string,
  contentDir?: string,
): boolean {
  if (nodeId && hasTableSchemaEntry(contentDir ?? resolveContentPath(), nodeId)) {
    return true;
  }
  if (store && nodeId) return hasIncomingIsA(store, nodeId, contentDir);
  return false;
}

export function findTypeNodeByTitle(
  store: RelationshipReadStore,
  title: string,
  contentDir?: string,
): string | null {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return null;

  const dir = contentDir ?? resolveContentPath();
  const schemas = loadTableSchemasFromContent(dir);
  for (const typeId of Object.keys(schemas.tables)) {
    const node = readStoreGetNode(store, typeId);
    if (!node) continue;
    if (titleFromProperties(node.properties).toLowerCase() === normalized) return typeId;
  }

  for (const id of readStoreListNodeIds(store)) {
    const node = readStoreGetNode(store, id);
    if (!node) continue;
    if (!isTypeTableCandidate({ properties: node.properties }, store, id, dir)) {
      continue;
    }
    if (titleFromProperties(node.properties).trim().toLowerCase() === normalized) return id;
  }
  return null;
}

export function graphGroupForNode(store: RelationshipReadStore, nodeId: string): string {
  const node = readStoreGetNode(store, nodeId);
  if (!node) return "Unknown";

  if (isTypeTableNode(store, nodeId)) {
    const title = titleFromProperties(node.properties);
    return title === "Untitled" ? "TypeTable" : title;
  }

  const typeTitle = primaryTypeTitleForInstance(store, nodeId);
  if (typeTitle) return typeTitle;

  return "Node";
}

/** Labels for graph export / visualization (derived from IS_A type and node kind). */
export function graphLabelsForNode(store: RelationshipReadStore, nodeId: string): string[] {
  const node = readStoreGetNode(store, nodeId);
  if (!node) return ["Unknown"];

  if (isTypeTableNode(store, nodeId)) {
    return ["TypeTable"];
  }

  const typeTitle = primaryTypeTitleForInstance(store, nodeId);
  if (typeTitle) return [typeTitle];

  return ["Node"];
}

/** Minimal properties so tests and tooling can mark a node as a type table without labels. */
export function typeTableMarkerProperties(title: string): Properties {
  return { title };
}

export function nodeMatchesTargetTypes(
  store: RelationshipReadStore,
  targetNodeId: string,
  allowedTypeIds: readonly string[],
  contentDir?: string,
): boolean {
  if (allowedTypeIds.length === 0) return true;
  const targetTypes = typeIdsForInstance(store, targetNodeId, contentDir);
  return targetTypes.some((id) => allowedTypeIds.includes(id));
}
