import type { Properties } from "./graph";
import type { TomeWriteContext } from "./content/write-context";
import { syncAfterRelationshipsWrite } from "./content/write-context";
import { LinkResolutionError } from "./content/resolve-composite-for-link";
import { isTypeTableNode, nodeMatchesTargetTypes } from "./node-capabilities";
import { normalizeRelationshipType } from "./relation-type";
import { relationshipTypeRuleContext } from "./relationship-type-endpoints";
import { loadRelationshipTypesFromContent } from "./relationship-types/load";
import { stampOrderIfMissing } from "./ordered-relationships";
import { membershipPerspectivesForSet } from "./relationship-type-traits";

export type LinkOutgoingRelationshipError =
  | "source_not_found"
  | "target_not_found"
  | "duplicate"
  | "target_type_not_allowed"
  | "unresolvable_type";

export type UnlinkOutgoingRelationshipError = "not_found";

export type MoveRelationshipConnectionError =
  | "not_found"
  | LinkOutgoingRelationshipError;

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
  const outgoing = ctx.db.listRelationshipsFromSource(sourceId).filter((c) => c.type === type);
  if (outgoing.length === 0) return undefined;
  const ordinals = outgoing
    .map((c) => ordinalFromProperties(c.properties))
    .filter((v): v is number => v !== null);
  if (ordinals.length === 0) return undefined;
  return Math.max(...ordinals) + 1;
}

export interface LinkOutgoingRelationshipInput {
  sourceId: string;
  targetId: string;
  type: string;
  properties?: Properties;
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
    ctx.db,
    sourceId,
    normalizedType,
    ctx.store.contentDir,
  );
  if (
    ruleContext &&
    ruleContext.allowedTargetTypeIds.length > 0 &&
    !nodeMatchesTargetTypes(ctx.db, targetId, ruleContext.allowedTargetTypeIds, ctx.store.contentDir)
  ) {
    return "target_type_not_allowed";
  }

  let relProps: Properties = { ...properties };
  if (!("ordinal" in relProps)) {
    const nextOrdinal = nextOutgoingOrdinal(ctx, sourceId, normalizedType);
    if (nextOrdinal !== undefined) relProps.ordinal = nextOrdinal;
  }

  if (isTypeTableNode(ctx.db, targetId, ctx.store.contentDir)) {
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

export interface MoveRelationshipConnectionInput {
  type: string;
  oldSourceId: string;
  oldTargetId: string;
  newSourceId: string;
  newTargetId: string;
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
