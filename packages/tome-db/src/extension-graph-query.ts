import type {
  ExtensionGraphQueryServices,
  GraphQueryEdge,
  GraphQueryNode,
} from "tome-interfaces/extension-services/graph-query";
import type { GraphDatabase, Node } from "./graph";
import { MEMBER_OF_TYPE, MEMBERS_TYPE } from "./labels";
import { setMemberIds } from "./set-membership";

function titleFromNode(node: Node | null): string {
  if (!node) return "Untitled";
  const title = node.properties.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const alias = node.properties.alias;
  if (typeof alias === "string" && alias.trim()) return alias.trim();
  return "Untitled";
}

function databaseMemberIds(db: GraphDatabase, databaseId: string): Set<string> {
  return new Set(setMemberIds(db, databaseId));
}

function listIncidentEdges(
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
    });
  }

  return edges;
}

export function createExtensionGraphQueryServices(db: GraphDatabase): ExtensionGraphQueryServices {
  return {
    listTypeMembers(typeId: string): GraphQueryNode[] {
      const members: GraphQueryNode[] = [];
      for (const memberId of databaseMemberIds(db, typeId)) {
        if (db.isNodeArchived(memberId)) continue;
        members.push({
          id: memberId,
          title: titleFromNode(db.getNode(memberId)),
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
        for (const edge of listIncidentEdges(db, nodeId, nodeIdSet, typeSet)) {
          if (seen.has(edge.id)) continue;
          seen.add(edge.id);
          edges.push(edge);
        }
      }

      return edges;
    },
  };
}
