import type { Properties } from "tome-sqlite";
import type { TomeWriteContext } from "./content/write-context";
import { syncAfterRelationshipsWrite } from "./content/write-context";
import {
  LinkResolutionError,
  UnknownAssociationError,
  connectsEndpoints,
  isAssociationId,
  isMemberSideProjectionType,
  isSetTraitComposite,
  isSetTraitProjectionType,
  loadAssociationsFromContent,
  parseProjectionType,
} from "tome-flatfile";
import { isTypeTableNode, nodeMatchesTargetTypes } from "./node-capabilities";
import { associationRuleContext } from "./association-endpoints";
import { stampOrderIfMissing } from "./ordered-relationships";
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
  const outgoing = ctx.cache.listRelationshipsFromSource(sourceId).filter((c) => c.type === type);
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

  if (!ctx.store.readNode(sourceId)) return "source_not_found";
  if (!ctx.store.readNode(targetId)) return "target_not_found";

  if (ctx.store.findRelationship(sourceId, targetId, normalizedType)) {
    return "duplicate";
  }

  const registry = loadAssociationsFromContent(ctx.store.contentDir);
  const ruleContext = associationRuleContext(
    registry,
    ctx.cache,
    sourceId,
    normalizedType,
    ctx.store.contentDir,
  );
  if (
    ruleContext &&
    ruleContext.allowedTargetTypeIds.length > 0 &&
    !nodeMatchesTargetTypes(ctx.cache, targetId, ruleContext.allowedTargetTypeIds, ctx.store.contentDir)
  ) {
    return "target_type_not_allowed";
  }

  let relProps: Properties = { ...properties };
  if (!("ordinal" in relProps)) {
    const nextOrdinal = nextOutgoingOrdinal(ctx, sourceId, normalizedType);
    if (nextOrdinal !== undefined) relProps.ordinal = nextOrdinal;
  }

  if (isTypeTableNode(ctx.cache, targetId, ctx.store.contentDir)) {
    if (isMemberSideProjectionType(registry, normalizedType)) {
      relProps = stampOrderIfMissing(ctx, targetId, sourceId, relProps, normalizedType);
    }
  }

  try {
    ctx.store.upsertRelationship(sourceId, targetId, normalizedType, relProps);
  } catch (err) {
    if (err instanceof LinkResolutionError || err instanceof UnknownAssociationError) {
      return "unresolvable_type";
    }
    throw err;
  }
  syncAfterRelationshipsWrite(ctx);
  return null;
}

/**
 * Members tables list every set-trait edge, while unlink/move often pass the
 * view-resolved member projection. When those differ, find any set-trait edge
 * connecting the same pair.
 */
function findRelationshipForUnlink(
  ctx: TomeWriteContext,
  sourceId: string,
  targetId: string,
  type: string,
) {
  const found = ctx.store.findRelationship(sourceId, targetId, type);
  if (found) return found;

  const registry = loadAssociationsFromContent(ctx.store.contentDir);
  if (!isSetTraitProjectionType(registry, type)) return null;

  for (const entry of ctx.store.readRelationshipsFile().relationships) {
    if (!connectsEndpoints(entry, sourceId, targetId)) continue;
    if (!isSetTraitComposite(registry, entry.type)) continue;
    return ctx.store.findRelationship(sourceId, targetId, entry.type);
  }
  return null;
}

export function unlinkOutgoingRelationship(
  ctx: TomeWriteContext,
  sourceId: string,
  targetId: string,
  type: string,
): UnlinkOutgoingRelationshipError | null {
  const normalizedType = normalizeLinkType(type);
  const existing = findRelationshipForUnlink(ctx, sourceId, targetId, normalizedType);
  if (!existing) return "not_found";
  ctx.store.deleteRelationship(sourceId, targetId, existing.type);
  syncAfterRelationshipsWrite(ctx);
  return null;
}

export function moveRelationshipConnection(
  ctx: TomeWriteContext,
  input: MoveRelationshipConnectionInput,
): MoveRelationshipConnectionError | null {
  const { type, oldSourceId, oldTargetId, newSourceId, newTargetId } = input;
  const normalizedType = normalizeLinkType(type);

  const existing = findRelationshipForUnlink(ctx, oldSourceId, oldTargetId, normalizedType);
  if (!existing) return "not_found";

  const linkError = linkOutgoingRelationship(ctx, {
    sourceId: newSourceId,
    targetId: newTargetId,
    type: existing.type,
    properties: { ...existing.properties },
  });
  if (linkError) return linkError;

  ctx.store.deleteRelationship(oldSourceId, oldTargetId, existing.type);
  syncAfterRelationshipsWrite(ctx);
  return null;
}
