import type { Node, Properties } from "tome-graph-interfaces";
import { memberSetIds } from "./set-membership";
import { resolveContentPath } from "tome-flatfile";
import { loadRelationshipTypesFromContent } from "tome-flatfile";
import { hasTableSchemaEntry } from "tome-flatfile";
import { memberSideProjectionTypes, setSideProjectionTypes } from "tome-flatfile";
import {
  listRelationshipsFromSource,
  listRelationshipsToTarget,
  readStoreGetNode,
  type RelationshipReadStore,
} from "./graph-store/relationship-read";

function titleFromProperties(properties: Record<string, unknown>): string {
  const title = properties.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const alias = properties.alias;
  if (typeof alias === "string" && alias.trim()) return alias.trim();
  return "Untitled";
}

export async function hasIncomingIsA(
  store: RelationshipReadStore,
  nodeId: string,
  contentDir?: string,
): Promise<boolean> {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadRelationshipTypesFromContent(dir);
  for (const projection of memberSideProjectionTypes(registry)) {
    if ((await listRelationshipsToTarget(store, nodeId, projection)).length > 0) return true;
  }
  for (const projection of setSideProjectionTypes(registry)) {
    if ((await listRelationshipsFromSource(store, nodeId, projection)).length > 0) return true;
  }
  return false;
}

export async function isTypeTableNode(
  store: RelationshipReadStore,
  nodeId: string,
  contentDir?: string,
): Promise<boolean> {
  const dir = contentDir ?? resolveContentPath();
  if (hasTableSchemaEntry(dir, nodeId)) return true;
  return hasIncomingIsA(store, nodeId, dir);
}

export async function typeIdsForInstance(
  store: RelationshipReadStore,
  nodeId: string,
  contentDir?: string,
): Promise<string[]> {
  return memberSetIds(store, nodeId, contentDir);
}

/** Lexicographically first IS_A type title for an instance page, when any. */
export async function primaryTypeTitleForInstance(
  store: RelationshipReadStore,
  nodeId: string,
): Promise<string | null> {
  const titles: string[] = [];
  for (const typeId of await typeIdsForInstance(store, nodeId)) {
    const typeNode = await readStoreGetNode(store, typeId);
    if (!typeNode) continue;
    const title = titleFromProperties(typeNode.properties);
    if (title !== "Untitled") titles.push(title);
  }
  if (titles.length === 0) return null;
  titles.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return titles[0]!;
}

export async function isTypeTableCandidate(
  node: Pick<Node, "properties"> & { id?: string },
  store?: RelationshipReadStore,
  nodeId?: string,
  contentDir?: string,
): Promise<boolean> {
  if (nodeId && hasTableSchemaEntry(contentDir ?? resolveContentPath(), nodeId)) {
    return true;
  }
  if (store && nodeId) return hasIncomingIsA(store, nodeId, contentDir);
  return false;
}

export async function graphGroupForNode(store: RelationshipReadStore, nodeId: string): Promise<string> {
  const node = await readStoreGetNode(store, nodeId);
  if (!node) return "Unknown";

  if (await isTypeTableNode(store, nodeId)) {
    const title = titleFromProperties(node.properties);
    return title === "Untitled" ? "TypeTable" : title;
  }

  const typeTitle = await primaryTypeTitleForInstance(store, nodeId);
  if (typeTitle) return typeTitle;

  return "Node";
}

/** Labels for graph export / visualization (derived from IS_A type and node kind). */
export async function graphLabelsForNode(store: RelationshipReadStore, nodeId: string): Promise<string[]> {
  const node = await readStoreGetNode(store, nodeId);
  if (!node) return ["Unknown"];

  if (await isTypeTableNode(store, nodeId)) {
    return ["TypeTable"];
  }

  const typeTitle = await primaryTypeTitleForInstance(store, nodeId);
  if (typeTitle) return [typeTitle];

  return ["Node"];
}

/** Minimal properties so tests and tooling can mark a node as a type table without labels. */
export function typeTableMarkerProperties(title: string): Properties {
  return { title };
}

export async function nodeMatchesTargetTypes(
  store: RelationshipReadStore,
  targetNodeId: string,
  allowedTypeIds: readonly string[],
  contentDir?: string,
): Promise<boolean> {
  if (allowedTypeIds.length === 0) return true;
  const targetTypes = await typeIdsForInstance(store, targetNodeId, contentDir);
  return targetTypes.some((id) => allowedTypeIds.includes(id));
}
