import type { Properties } from "tome-sqlite";
import type { TomeWriteContext } from "./content/write-context";
import { syncAfterRelationshipsWrite } from "./content/write-context";
import {
  LinkResolutionError,
  UnknownAssociationError,
  isAssociationId,
  isMemberSideProjectionType,
  loadAssociationsFromContent,
  parseProjectionType,
} from "tome-flatfile";
import { isTypeTableNode, nodeMatchesTargetTypes } from "./node-capabilities";
import { associationRuleContext } from "./association-endpoints";
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

export type {
  LinkOutgoingRelationshipError,
  LinkOutgoingRelationshipInput,
  MoveRelationshipConnectionError,
  MoveRelationshipConnectionInput,
  UnlinkOutgoingRelationshipError,
} from "tome-graph-interfaces";

/** Preserve ULID / projection type case; only trim. */
function normalizeLinkType(type: string): string {
  const trimmed = type.trim();
  if (parseProjectionType(trimmed) || isAssociationId(trimmed)) return trimmed;
  return trimmed;
}

function ordinalFromProperties(properties: Record<string, unknown>): number | null {
  const raw = properties.ordinal;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function nextOutgoingOrdinal(
  ctx: TomeWriteContext,
  sourceId: string,
  type: string,
): number | undefined {
  const outgoing = listRelationshipsFromSource(ctx.graphStore, sourceId, type);
  if (outgoing.length === 0) return undefined;
  const ordinals = outgoing
    .map((c) => ordinalFromProperties(c.properties))
    .filter((v): v is number => v !== null);
  if (ordinals.length === 0) return undefined;
  return Math.max(...ordinals) + 1;
}

export function linkOutgoingRelationship(
  ctx: TomeWriteContext,
  input: LinkOutgoingRelationshipInput,
): LinkOutgoingRelationshipError | null {
  const { sourceId, targetId, type, properties = {} } = input;
  const normalizedType = normalizeLinkType(type);
  const store = ctx.graphStore;
  const contentDir = writeStoreContentDir(store);

  if (!writeStoreGetNode(store, sourceId)) return "source_not_found";
  if (!writeStoreGetNode(store, targetId)) return "target_not_found";

  if (writeStoreFindRelationship(store, sourceId, targetId, normalizedType)) {
    return "duplicate";
  }

  const registry = loadAssociationsFromContent(contentDir);
  const ruleContext = associationRuleContext(
    registry,
    store,
    sourceId,
    normalizedType,
    contentDir,
  );
  if (
    ruleContext &&
    ruleContext.allowedTargetTypeIds.length > 0 &&
    !nodeMatchesTargetTypes(store, targetId, ruleContext.allowedTargetTypeIds, contentDir)
  ) {
    return "target_type_not_allowed";
  }

  let relProps: Properties = { ...properties };
  if (!("ordinal" in relProps)) {
    const nextOrdinal = nextOutgoingOrdinal(ctx, sourceId, normalizedType);
    if (nextOrdinal !== undefined) relProps.ordinal = nextOrdinal;
  }

  if (isTypeTableNode(store, targetId, contentDir)) {
    if (isMemberSideProjectionType(registry, normalizedType)) {
      relProps = stampOrderIfMissing(ctx, targetId, sourceId, relProps, normalizedType);
    }
  }

  try {
    writeStoreUpsertRelationship(store, sourceId, targetId, normalizedType, relProps);
  } catch (err) {
    if (err instanceof LinkResolutionError || err instanceof UnknownAssociationError) {
      return "unresolvable_type";
    }
    throw err;
  }
  syncAfterRelationshipsWrite(ctx);
  return null;
}

export function unlinkOutgoingRelationship(
  ctx: TomeWriteContext,
  sourceId: string,
  targetId: string,
  type: string,
): UnlinkOutgoingRelationshipError | null {
  const normalizedType = normalizeLinkType(type);
  const store = ctx.graphStore;
  const registry = loadAssociationsFromContent(writeStoreContentDir(store));
  const existing = writeStoreFindSetTraitRelationship(
    store,
    registry,
    sourceId,
    targetId,
    normalizedType,
  );
  if (!existing) return "not_found";
  writeStoreDeleteRelationship(store, sourceId, targetId, existing.type);
  syncAfterRelationshipsWrite(ctx);
  return null;
}

export function moveRelationshipConnection(
  ctx: TomeWriteContext,
  input: MoveRelationshipConnectionInput,
): MoveRelationshipConnectionError | null {
  const { type, oldSourceId, oldTargetId, newSourceId, newTargetId } = input;
  const normalizedType = normalizeLinkType(type);
  const store = ctx.graphStore;
  const registry = loadAssociationsFromContent(writeStoreContentDir(store));

  const existing = writeStoreFindSetTraitRelationship(
    store,
    registry,
    oldSourceId,
    oldTargetId,
    normalizedType,
  );
  if (!existing) return "not_found";

  const linkError = linkOutgoingRelationship(ctx, {
    sourceId: newSourceId,
    targetId: newTargetId,
    type: existing.type,
    properties: { ...existing.properties },
  });
  if (linkError) return linkError;

  writeStoreDeleteRelationship(store, oldSourceId, oldTargetId, existing.type);
  syncAfterRelationshipsWrite(ctx);
  return null;
}
