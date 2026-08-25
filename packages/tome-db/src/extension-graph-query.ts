import type {
  ExtensionGraphQueryServices,
  GraphQueryEdge,
  GraphQueryNode,
} from "tome-interfaces/extension-services/graph-query";
import type { TomeGraphStoreQueryable } from "tome-graph-interfaces";
import {
  expandAllRelationships,
  loadAssociationsFromContent,
  setSideProjectionType,
  typesWithTrait,
  SET_TRAIT,
} from "tome-flatfile";
import type { GraphDatabase } from "tome-sqlite";
import { setMemberIds } from "./set-membership";
import { typeMembersGraph } from "./graph-store/standard-graphs";

function titleFromProperties(properties: Record<string, unknown>): string {
  const title = properties.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const alias = properties.alias;
  if (typeof alias === "string" && alias.trim()) return alias.trim();
  return "Untitled";
}

function titleFromStore(store: TomeGraphStoreQueryable, id: string): string {
  return titleFromProperties(store.getNode(id)?.properties ?? {});
}

function listTypeMembersFromStore(
  store: TomeGraphStoreQueryable,
  typeId: string,
  contentDir?: string,
): GraphQueryNode[] {
  const dir = contentDir ?? store.contentDir;
  const registry = loadAssociationsFromContent(dir);
  const memberIds = new Set<string>();

  for (const composite of typesWithTrait(registry, SET_TRAIT)) {
    const projection = setSideProjectionType(registry, composite);
    const executed = store.executeImp(typeMembersGraph(typeId, projection));
    if (executed instanceof Promise) {
      throw new Error("ExtensionGraphQueryServices requires synchronous executeImp");
    }
    for (const row of executed.rows) {
      memberIds.add(String(row.id));
    }
  }

  const members: GraphQueryNode[] = [];
  for (const memberId of memberIds) {
    if (store.isNodeArchived(memberId)) continue;
    members.push({ id: memberId, title: titleFromStore(store, memberId) });
  }
  members.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  return members;
}

function listEdgesFromStore(
  store: TomeGraphStoreQueryable,
  options: { nodeIds: readonly string[]; types?: readonly string[] },
): GraphQueryEdge[] {
  const nodeIdSet = new Set(options.nodeIds);
  const typeSet = options.types?.length ? new Set(options.types) : null;
  const associations = store.readAssociations();
  const entries: { a: string; b: string; type: string; properties?: Record<string, unknown> }[] =
    [];
  store.forEachRelationshipRecord((entry) => entries.push(entry));
  const { projections } = expandAllRelationships(entries, associations);

  const seen = new Set<string>();
  const edges: GraphQueryEdge[] = [];
  for (const projection of projections) {
    if (!nodeIdSet.has(projection.sourceNodeId) && !nodeIdSet.has(projection.targetNodeId)) {
      continue;
    }
    if (!nodeIdSet.has(projection.sourceNodeId) || !nodeIdSet.has(projection.targetNodeId)) {
      continue;
    }
    if (typeSet && !typeSet.has(projection.type)) continue;
    if (seen.has(projection.id)) continue;
    seen.add(projection.id);
    edges.push({
      id: projection.id,
      sourceId: projection.sourceNodeId,
      targetId: projection.targetNodeId,
      type: projection.type,
      properties: projection.properties,
    });
  }
  return edges;
}

function listIncidentEdgesFromCache(
  db: GraphDatabase,
  nodeId: string,
  nodeIdSet: Set<string>,
  typeSet: Set<string> | null,
): GraphQueryEdge[] {
  const incident = [
    ...db.listRelationshipsFromSource(nodeId),
    ...db.listRelationshipsToTarget(nodeId),
  ];
  const seen = new Set<string>();
  const edges: GraphQueryEdge[] = [];

  for (const relationship of incident) {
    if (seen.has(relationship.id)) continue;
    seen.add(relationship.id);

    const sourceId = relationship.sourceNodeId;
    const targetId = relationship.targetNodeId;
    if (!nodeIdSet.has(sourceId) || !nodeIdSet.has(targetId)) continue;
    if (typeSet && !typeSet.has(relationship.type)) continue;

    edges.push({
      id: relationship.id,
      sourceId,
      targetId,
      type: relationship.type,
      properties: relationship.properties,
    });
  }

  return edges;
}

/** @deprecated Pass TomeGraphStoreQueryable — cache-only overload for tests. */
export function createExtensionGraphQueryServices(
  db: GraphDatabase,
  contentDir?: string,
): ExtensionGraphQueryServices;

export function createExtensionGraphQueryServices(
  graphStore: TomeGraphStoreQueryable,
  contentDir?: string,
): ExtensionGraphQueryServices;

export function createExtensionGraphQueryServices(
  storeOrCache: TomeGraphStoreQueryable | GraphDatabase,
  contentDir?: string,
): ExtensionGraphQueryServices {
  if ("capabilities" in storeOrCache && storeOrCache.capabilities.queryable) {
    const store = storeOrCache;
    return {
      listTypeMembers(typeId: string) {
        return listTypeMembersFromStore(store, typeId, contentDir);
      },
      listEdges(options) {
        return listEdgesFromStore(store, options);
      },
    };
  }

  const db = storeOrCache as GraphDatabase;
  return {
    listTypeMembers(typeId: string): GraphQueryNode[] {
      const members: GraphQueryNode[] = [];
      for (const memberId of setMemberIds(db, typeId, contentDir)) {
        if (db.isNodeArchived(memberId)) continue;
        members.push({
          id: memberId,
          title: titleFromProperties(db.getNode(memberId)?.properties ?? {}),
        });
      }
      members.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
      return members;
    },

    listEdges(options: {
      nodeIds: readonly string[];
      types?: readonly string[];
    }): GraphQueryEdge[] {
      const nodeIdSet = new Set(options.nodeIds);
      const typeSet = options.types?.length ? new Set(options.types) : null;
      const seen = new Set<string>();
      const edges: GraphQueryEdge[] = [];

      for (const nodeId of options.nodeIds) {
        for (const edge of listIncidentEdgesFromCache(db, nodeId, nodeIdSet, typeSet)) {
          if (seen.has(edge.id)) continue;
          seen.add(edge.id);
          edges.push(edge);
        }
      }

      return edges;
    },
  };
}
