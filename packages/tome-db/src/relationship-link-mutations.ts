import type { Properties } from "tome-cache-sqlite";
import type { TomeWriteContext } from "./content/write-context";
import { syncAfterRelationshipsWrite } from "./content/write-context";
import { LinkResolutionError } from "tome-store-flatfile";
import { isTypeTableNode, nodeMatchesTargetTypes } from "./node-capabilities";
import { normalizeRelationshipType } from "tome-store-flatfile";
import { relationshipTypeRuleContext } from "./relationship-type-endpoints";
import { loadRelationshipTypesFromContent } from "tome-store-flatfile";
import { stampOrderIfMissing } from "./ordered-relationships";
import { membershipPerspectivesForSet } from "tome-store-flatfile";
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
  const normalizedType = normalizeRelationshipType(type);

  if (!ctx.store.readNode(sourceId)) return "source_not_found";
  if (!ctx.store.readNode(targetId)) return "target_not_found";

  if (ctx.store.findRelationship(sourceId, targetId, normalizedType)) {
    return "duplicate";
  }

  const registry = loadRelationshipTypesFromContent(ctx.store.contentDir);
  const ruleContext = relationshipTypeRuleContext(
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
    const [, memberPerspective] = membershipPerspectivesForSet(targetId, ctx.store.contentDir);
    if (normalizedType === memberPerspective) {
      relProps = stampOrderIfMissing(ctx, targetId, sourceId, relProps);
    }
  }

  try {
    ctx.store.upsertRelationship(sourceId, targetId, normalizedType, relProps);
  } catch (err) {
    if (err instanceof LinkResolutionError) return "unresolvable_type";
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
  const normalizedType = normalizeRelationshipType(type);
  if (!ctx.store.findRelationship(sourceId, targetId, normalizedType)) {
    return "not_found";
  }
  ctx.store.deleteRelationship(sourceId, targetId, normalizedType);
  syncAfterRelationshipsWrite(ctx);
  return null;
}

export function moveRelationshipConnection(
  ctx: TomeWriteContext,
  input: MoveRelationshipConnectionInput,
): MoveRelationshipConnectionError | null {
  const { type, oldSourceId, oldTargetId, newSourceId, newTargetId } = input;
  const normalizedType = normalizeRelationshipType(type);

  const existing = ctx.store.findRelationship(oldSourceId, oldTargetId, normalizedType);
  if (!existing) return "not_found";

  const linkError = linkOutgoingRelationship(ctx, {
    sourceId: newSourceId,
    targetId: newTargetId,
    type: normalizedType,
    properties: { ...existing.properties },
  });
  if (linkError) return linkError;

  ctx.store.deleteRelationship(oldSourceId, oldTargetId, normalizedType);
  syncAfterRelationshipsWrite(ctx);
  return null;
}
