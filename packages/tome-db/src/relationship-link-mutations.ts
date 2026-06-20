import type { Properties } from "./graph";
import type { TomeWriteContext } from "./content/write-context";
import { syncAfterRelationshipsWrite } from "./content/write-context";
import { nodeMatchesTargetTypes } from "./node-capabilities";
import { normalizeRelationshipType } from "./relation-type";
import { relationshipRuleContextForType } from "./schema-rules/resolve";
import type { SchemaFile } from "./schema-rules/schema-file";

export type LinkOutgoingRelationshipError =
  | "source_not_found"
  | "target_not_found"
  | "duplicate"
  | "target_type_not_allowed";

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
  schema?: SchemaFile | null;
}

export function linkOutgoingRelationship(
  ctx: TomeWriteContext,
  input: LinkOutgoingRelationshipInput,
): LinkOutgoingRelationshipError | null {
  const { sourceId, targetId, type, properties = {}, schema } = input;
  const normalizedType = normalizeRelationshipType(type);

  if (!ctx.store.readNode(sourceId)) return "source_not_found";
  if (!ctx.store.readNode(targetId)) return "target_not_found";

  if (ctx.store.findRelationship(sourceId, targetId, normalizedType)) {
    return "duplicate";
  }

  if (schema) {
    const ruleContext = relationshipRuleContextForType(schema, ctx.db, sourceId, normalizedType);
    if (
      ruleContext &&
      ruleContext.allowedTargetTypeIds.length > 0 &&
      !nodeMatchesTargetTypes(ctx.db, targetId, ruleContext.allowedTargetTypeIds)
    ) {
      return "target_type_not_allowed";
    }
  }

  const relProps: Properties = { ...properties };
  if (!("ordinal" in relProps)) {
    const nextOrdinal = nextOutgoingOrdinal(ctx, sourceId, normalizedType);
    if (nextOrdinal !== undefined) relProps.ordinal = nextOrdinal;
  }

  ctx.store.upsertRelationship(sourceId, targetId, normalizedType, relProps);
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
  schema?: SchemaFile | null;
}

export function moveRelationshipConnection(
  ctx: TomeWriteContext,
  input: MoveRelationshipConnectionInput,
): MoveRelationshipConnectionError | null {
  const { type, oldSourceId, oldTargetId, newSourceId, newTargetId, schema } = input;
  const normalizedType = normalizeRelationshipType(type);

  const existing = ctx.store.findRelationship(oldSourceId, oldTargetId, normalizedType);
  if (!existing) return "not_found";

  const linkError = linkOutgoingRelationship(ctx, {
    sourceId: newSourceId,
    targetId: newTargetId,
    type: normalizedType,
    properties: { ...existing.properties },
    schema,
  });
  if (linkError) return linkError;

  ctx.store.deleteRelationship(oldSourceId, oldTargetId, normalizedType);
  syncAfterRelationshipsWrite(ctx);
  return null;
}
