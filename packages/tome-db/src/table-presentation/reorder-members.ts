import type { Properties } from "tome-sqlite";
import type { TomeWriteContext } from "../content/write-context";
import { syncAfterRelationshipsWrite } from "../content/write-context";
import { listRelationshipsForComposite } from "../relationship-traverse";
import { listSetMemberRowConnections } from "../set-membership";
import { applySparseOrderRewrite } from "../ordered-relationships";
import type { DatabaseViewDetail, ReorderDatabaseMembersParams } from "tome-graph-interfaces";
import { UNASSIGNED_GROUP_ID } from "tome-graph-interfaces";
import { getCompositionForDatabase } from "./load";
import { memberLinkPerspective } from "./helpers";
import { getDatabaseViewDetail } from "../database-view";
import { DEFAULT_TABLE_ROW_LIMIT } from "../table-rows-window";

/**
 * Rewrite membership order for the given member sequence, optionally changing
 * one member's group relation using the database's relation-groups presentation layer.
 */
export function reorderDatabaseMembers(
  ctx: TomeWriteContext,
  databaseId: string,
  params: ReorderDatabaseMembersParams,
): DatabaseViewDetail | null {
  const contentDir = ctx.store.contentDir;
  const composition = getCompositionForDatabase(databaseId, contentDir);
  const memberIds = new Set(params.orderedMemberIds);
  const edges = listSetMemberRowConnections(ctx.cache, databaseId, contentDir).filter((edge) =>
    memberIds.has(edge.sourceNodeId),
  );

  applySparseOrderRewrite(
    ctx,
    databaseId,
    edges.map((edge) => ({
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      type: edge.type,
      properties: edge.properties,
    })),
    params.orderedMemberIds,
  );

  if (params.groupChange && composition?.groups) {
    const { memberId, targetGroupId } = params.groupChange;
    const groupConfig = composition.groups;
    const existing = listRelationshipsForComposite(
      ctx.cache,
      memberId,
      groupConfig.memberToGroupComposite,
    );
    for (const connection of existing) {
      ctx.store.deleteRelationship(
        connection.sourceNodeId,
        connection.targetNodeId,
        connection.type,
      );
    }

    if (targetGroupId !== UNASSIGNED_GROUP_ID) {
      const templateProps = existing[0]?.properties ?? {};
      const props: Properties = {};
      for (const [key, value] of Object.entries(templateProps)) {
        if (key === "ordinal") continue;
        props[key] = value;
      }
      ctx.store.upsertRelationship(
        memberId,
        targetGroupId,
        memberLinkPerspective(
          databaseId,
          groupConfig.memberToGroupComposite,
          contentDir,
          `table-presentation "${composition.id}" groups`,
        ),
        props,
      );
    }
  }

  syncAfterRelationshipsWrite(ctx);

  return getDatabaseViewDetail(ctx.cache, databaseId, params.tabId, contentDir, {
    limit: DEFAULT_TABLE_ROW_LIMIT,
    offset: 0,
  });
}
