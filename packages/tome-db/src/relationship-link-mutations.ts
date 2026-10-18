import type { Properties } from "tome-sqlite";
import type { TomeWriteContext } from "./content/write-context";
import { syncAfterRelationshipsWrite } from "./content/write-context";
import {
  LinkResolutionError,
  UnknownRelationshipTypeError,
  isRelationshipTypeId,
  isMemberSideProjectionType,
  loadRelationshipTypesFromContent,
  parseProjectionType,
} from "tome-flatfile";
import { isTypeTableNode, nodeMatchesTargetTypes } from "./node-capabilities";
import { relationshipTypeRuleContext } from "./relationship-type-endpoints";
import { stampOrderIfMissing } from "./ordered-relationships";
import { listRelationshipsFromSource } from "./graph-store/relationship-read";
import {
  writeStoreContentDir,
  writeStoreDeleteRelationship,
  writeStoreFindRelationship,
  writeStoreFindSetTraitRelationship,
  writeStoreGetNode,
  writeStoreUpsertRelationship,
} from "./graph-store/relationship-write";
import type {
  LinkOutgoingRelationshipError,
  LinkOutgoingRelationshipInput,
  MoveRelationshipConnectionError,
  MoveRelationshipConnectionInput,
  UnlinkOutgoingRelationshipError,
} from "tome-graph-interfaces";
import {
  hostsProjectionSpecForTypeTable,
  memberPredicateIdForTypeTable,
  UnevaluableMemberScopeError,
} from "./predicate-membership";
import { hostsProjectionType } from "tome-ontology";
import { setRoleProjectionTypesForNode } from "tome-flatfile";

export type {
  LinkOutgoingRelationshipError,
  LinkOutgoingRelationshipInput,
  MoveRelationshipConnectionError,
  MoveRelationshipConnectionInput,
  UnlinkOutgoingRelationshipError,
} from "tome-graph-interfaces";

export type RemoveDatabaseMemberError =
  | "not_found"
  | "unevaluable_member_scope"
  | UnlinkOutgoingRelationshipError;

/** Preserve ULID / projection type case; only trim. */
function normalizeLinkType(type: string): string {
  const trimmed = type.trim();
  if (parseProjectionType(trimmed) || isRelationshipTypeId(trimmed)) return trimmed;
  return trimmed;
}

function ordinalFromProperties(properties: Record<string, unknown>): number | null {
  const raw = properties.ordinal;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function nextOutgoingOrdinal(
  ctx: TomeWriteContext,
  sourceId: string,
  type: string,
): Promise<number | undefined> {
  const outgoing = await listRelationshipsFromSource(ctx.graphStore, sourceId, type);
  if (outgoing.length === 0) return undefined;
  const ordinals = outgoing
    .map((c) => ordinalFromProperties(c.properties))
    .filter((v): v is number => v !== null);
  if (ordinals.length === 0) return undefined;
  return Math.max(...ordinals) + 1;
}

export async function linkOutgoingRelationship(
  ctx: TomeWriteContext,
  input: LinkOutgoingRelationshipInput,
): Promise<LinkOutgoingRelationshipError | null> {
  const { sourceId, targetId, type, properties = {} } = input;
  const normalizedType = normalizeLinkType(type);
  const store = ctx.graphStore;
  const contentDir = writeStoreContentDir(store);

  if (!await writeStoreGetNode(store, sourceId)) return "source_not_found";
  if (!await writeStoreGetNode(store, targetId)) return "target_not_found";

  if (await writeStoreFindRelationship(store, sourceId, targetId, normalizedType)) {
    return "duplicate";
  }

  const registry = loadRelationshipTypesFromContent(contentDir);
  const ruleContext = await relationshipTypeRuleContext(
    registry,
    store,
    sourceId,
    normalizedType,
    contentDir,
  );
  if (
    ruleContext &&
    ruleContext.allowedTargetTypeIds.length > 0 &&
    !(await nodeMatchesTargetTypes(store, targetId, ruleContext.allowedTargetTypeIds, contentDir))
  ) {
    return "target_type_not_allowed";
  }

  let relProps: Properties = { ...properties };
  if (!("ordinal" in relProps)) {
    const nextOrdinal = await nextOutgoingOrdinal(ctx, sourceId, normalizedType);
    if (nextOrdinal !== undefined) relProps.ordinal = nextOrdinal;
  }

  if (await isTypeTableNode(store, targetId, contentDir)) {
    if (isMemberSideProjectionType(registry, normalizedType)) {
      relProps = await stampOrderIfMissing(ctx, targetId, sourceId, relProps, normalizedType);
    }
  }

  try {
    await writeStoreUpsertRelationship(store, sourceId, targetId, normalizedType, relProps);
  } catch (err) {
    if (err instanceof LinkResolutionError || err instanceof UnknownRelationshipTypeError) {
      return "unresolvable_type";
    }
    throw err;
  }
  await syncAfterRelationshipsWrite(ctx);
  return null;
}

export async function unlinkOutgoingRelationship(
  ctx: TomeWriteContext,
  sourceId: string,
  targetId: string,
  type: string,
): Promise<UnlinkOutgoingRelationshipError | null> {
  const normalizedType = normalizeLinkType(type);
  const store = ctx.graphStore;
  const registry = loadRelationshipTypesFromContent(writeStoreContentDir(store));
  const existing = await writeStoreFindSetTraitRelationship(
    store,
    registry,
    sourceId,
    targetId,
    normalizedType,
  );
  if (!existing) return "not_found";
  await writeStoreDeleteRelationship(store, sourceId, targetId, existing.type);
  await syncAfterRelationshipsWrite(ctx);
  return null;
}

/**
 * Remove a member from a type-table Members list.
 * Scoped hubs: delete defining hosts_projection edges (break predicate membership).
 * Plain hubs: unlink the set-trait membership edge.
 */
export async function removeDatabaseMember(
  ctx: TomeWriteContext,
  databaseId: string,
  memberId: string,
): Promise<RemoveDatabaseMemberError | null> {
  const store = ctx.graphStore;
  const contentDir = writeStoreContentDir(store);
  if (!await writeStoreGetNode(store, memberId) || !await writeStoreGetNode(store, databaseId)) {
    return "not_found";
  }

  if (memberPredicateIdForTypeTable(databaseId, contentDir)) {
    try {
      const hosts = hostsProjectionSpecForTypeTable(databaseId, contentDir);
      if (!hosts) return "not_found";
      const projection = hostsProjectionType(hosts);
      const edges = await listRelationshipsFromSource(store, memberId, projection);
      if (edges.length === 0) {
        // Also try bare relationship type id (some writers store ULID only).
        const bare = await listRelationshipsFromSource(
          store,
          memberId,
          hosts.relationshipTypeId,
        );
        if (bare.length === 0) return "not_found";
        for (const edge of bare) {
          await writeStoreDeleteRelationship(
            store,
            edge.sourceNodeId,
            edge.targetNodeId,
            edge.type,
          );
        }
      } else {
        for (const edge of edges) {
          await writeStoreDeleteRelationship(
            store,
            edge.sourceNodeId,
            edge.targetNodeId,
            edge.type,
          );
        }
      }
      await syncAfterRelationshipsWrite(ctx);
      return null;
    } catch (err) {
      if (err instanceof UnevaluableMemberScopeError) return "unevaluable_member_scope";
      throw err;
    }
  }

  const [, memberPerspective] = setRoleProjectionTypesForNode(databaseId, contentDir);
  return unlinkOutgoingRelationship(ctx, memberId, databaseId, memberPerspective);
}

export async function moveRelationshipConnection(
  ctx: TomeWriteContext,
  input: MoveRelationshipConnectionInput,
): Promise<MoveRelationshipConnectionError | null> {
  const { type, oldSourceId, oldTargetId, newSourceId, newTargetId } = input;
  const normalizedType = normalizeLinkType(type);
  const store = ctx.graphStore;
  const registry = loadRelationshipTypesFromContent(writeStoreContentDir(store));

  const existing = await writeStoreFindSetTraitRelationship(
    store,
    registry,
    oldSourceId,
    oldTargetId,
    normalizedType,
  );
  if (!existing) return "not_found";

  const linkError = await linkOutgoingRelationship(ctx, {
    sourceId: newSourceId,
    targetId: newTargetId,
    type: existing.type,
    properties: { ...existing.properties },
  });
  if (linkError) return linkError;

  await writeStoreDeleteRelationship(store, oldSourceId, oldTargetId, existing.type);
  await syncAfterRelationshipsWrite(ctx);
  return null;
}
