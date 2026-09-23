import type { Properties } from "tome-sqlite";
import type { TomeWriteContext } from "../content/write-context";
import { syncAfterRelationshipsWrite } from "../content/write-context";
import { listRelationshipsForComposite } from "../relationship-traverse";
import { applySparseSequenceRewrite } from "../ordered-relationships";
import type { DatabaseViewDetail, RewriteDatabaseSequenceParams } from "tome-graph-interfaces";
import { UNASSIGNED_GROUP_ID } from "tome-graph-interfaces";
import { getCompositionForDatabase } from "./load";
import { memberLinkPerspective } from "./helpers";
import { getDatabaseViewDetail } from "../database-view";
import { DEFAULT_TABLE_ROW_LIMIT } from "../table-rows-window";
import {
  writeStoreContentDir,
  writeStoreDeleteRelationship,
  writeStoreUpsertRelationship,
} from "../graph-store/relationship-write";

/**
 * Rewrite intrinsic edge sequence for the given row ids, optionally changing
 * one row's group relation using the database's relation-groups presentation layer.
 */
export function rewriteDatabaseSequence(
  ctx: TomeWriteContext,
  databaseId: string,
  params: RewriteDatabaseSequenceParams,
): DatabaseViewDetail | null {
  const store = ctx.graphStore;
  const contentDir = writeStoreContentDir(store);
  const composition = getCompositionForDatabase(databaseId, contentDir);

  applySparseSequenceRewrite(ctx, databaseId, params.orderedRowIds);

  if (params.groupChange && composition?.groups) {
    const { rowId, targetGroupId } = params.groupChange;
    const groupConfig = composition.groups;
    const existing = listRelationshipsForComposite(
      store,
      rowId,
      groupConfig.memberToGroupComposite,
    );
    for (const connection of existing) {
      writeStoreDeleteRelationship(
        store,
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
      writeStoreUpsertRelationship(
        store,
        rowId,
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

  return getDatabaseViewDetail(store, databaseId, params.tabId, contentDir, {
    limit: DEFAULT_TABLE_ROW_LIMIT,
    offset: 0,
  });
}
