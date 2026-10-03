import type { Properties } from "tome-sqlite";
import type { TomeWriteContext } from "../content/write-context";
import { syncAfterRelationshipsWrite } from "../content/write-context";
import { listRelationshipsForComposite } from "../relationship-traverse";
import { applySparseSequenceRewrite } from "../ordered-relationships";
import type { DatabaseViewDetail, RewriteDatabaseSequenceParams } from "tome-graph-interfaces";
import { UNASSIGNED_GROUP_ID } from "tome-graph-interfaces";
import type { MemberPageQuery } from "tome-service-interfaces";
import { getCompositionForDatabase } from "./load";
import { memberLinkPerspective } from "./helpers";
import { getDatabaseViewDetail } from "../database-view";
import { DEFAULT_TABLE_ROW_LIMIT } from "../table-rows-window";
import { listSetMemberProjectionPairs } from "../set-membership";
import { listMemberPageNodeIds } from "../graph-store/relationship-read";
import {
  writeStoreContentDir,
  writeStoreDeleteRelationship,
  writeStoreUpsertRelationship,
} from "../graph-store/relationship-write";

/**
 * Merge a rearranged loaded prefix into the full scoped member sequence.
 * `submitted` must be a permutation of `fullScopeIds.slice(0, submitted.length)`.
 */
export function mergeScopedSequencePrefix(
  fullScopeIds: readonly string[],
  submitted: readonly string[],
): string[] {
  if (submitted.length === 0) return [...fullScopeIds];
  if (submitted.length > fullScopeIds.length) {
    throw new Error(
      `orderedRowIds length (${submitted.length}) exceeds scoped member count (${fullScopeIds.length})`,
    );
  }
  const submittedSet = new Set(submitted);
  if (submittedSet.size !== submitted.length) {
    throw new Error("orderedRowIds must not contain duplicates");
  }
  const prefix = fullScopeIds.slice(0, submitted.length);
  const prefixSet = new Set(prefix);
  for (const id of submittedSet) {
    if (!prefixSet.has(id)) {
      throw new Error(
        "orderedRowIds must be a rearrangement of the loaded scope prefix",
      );
    }
  }
  const remainder = fullScopeIds.filter((id) => !submittedSet.has(id));
  return [...submitted, ...remainder];
}

async function loadScopedMemberSequence(
  ctx: TomeWriteContext,
  databaseId: string,
  tabId: string | undefined,
  contentDir: string,
): Promise<string[] | null> {
  const composition = getCompositionForDatabase(databaseId, contentDir);
  if (!composition?.sequence) return null;

  const projections = listSetMemberProjectionPairs(contentDir);
  const activeScopeId = tabId?.trim() || undefined;
  const scopeFilter =
    composition.scope && activeScopeId
      ? {
          projectionType: memberLinkPerspective(
            databaseId,
            composition.scope.memberToScopeComposite,
            contentDir,
            `table-presentation "${composition.id}" scope`,
          ),
          scopeNodeId: activeScopeId,
        }
      : undefined;

  const groupsQuery = composition.groups
    ? {
        memberToGroupProjectionType: memberLinkPerspective(
          databaseId,
          composition.groups.memberToGroupComposite,
          contentDir,
          `table-presentation "${composition.id}" groups`,
        ),
        groupTypeDatabaseId: composition.groups.groupTypeDatabaseId,
        groupSetProjections: projections,
        groupToScopeProjectionType: composition.groups.groupToScopeComposite
          ? memberLinkPerspective(
              composition.groups.groupTypeDatabaseId,
              composition.groups.groupToScopeComposite,
              contentDir,
              `table-presentation "${composition.id}" groupToScope`,
            )
          : undefined,
        scopeNodeId: activeScopeId,
        canonicalGroupByTitle: composition.groups.canonicalGroupByTitle !== false,
      }
    : undefined;

  const query: MemberPageQuery = {
    projections,
    scope: scopeFilter,
    groups: groupsQuery,
    intrinsicSequence: true,
    limit: null,
    offset: 0,
  };

  return listMemberPageNodeIds(ctx.graphStore, databaseId, query);
}

/**
 * Rewrite intrinsic edge sequence for the given row ids, optionally changing
 * one row's group relation using the database's relation-groups presentation layer.
 *
 * When a scoped/sequenced composition is present, the client may submit only the
 * loaded window prefix; this expands to the full scoped member list before renumbering.
 */
export async function rewriteDatabaseSequence(
  ctx: TomeWriteContext,
  databaseId: string,
  params: RewriteDatabaseSequenceParams,
): Promise<DatabaseViewDetail | null> {
  const store = ctx.graphStore;
  const contentDir = writeStoreContentDir(store);
  const composition = getCompositionForDatabase(databaseId, contentDir);

  let orderedRowIds = params.orderedRowIds;
  const fullScopeIds = await loadScopedMemberSequence(
    ctx,
    databaseId,
    params.tabId,
    contentDir,
  );
  if (fullScopeIds) {
    orderedRowIds = mergeScopedSequencePrefix(fullScopeIds, params.orderedRowIds);
  }

  await applySparseSequenceRewrite(ctx, databaseId, orderedRowIds);

  if (params.groupChange && composition?.groups) {
    const { rowId, targetGroupId } = params.groupChange;
    const groupConfig = composition.groups;
    const existing = await listRelationshipsForComposite(
      store,
      rowId,
      groupConfig.memberToGroupComposite,
    );
    for (const connection of existing) {
      await writeStoreDeleteRelationship(
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
      await writeStoreUpsertRelationship(
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

  await syncAfterRelationshipsWrite(ctx);

  return getDatabaseViewDetail(store, databaseId, params.tabId, contentDir, {
    limit: DEFAULT_TABLE_ROW_LIMIT,
    offset: 0,
  });
}
