import { randomUUID } from "node:crypto";
import type { Properties } from "./graph";
import { INCLUDES_TYPE, isIncludesPerspectiveSlug } from "./includes-relationship";
import { IS_A_TYPE } from "./labels";
import { normalizeRelationshipType } from "./relation-type";
import type { TomeWriteContext } from "./content/write-context";
import { syncAfterNodeWrite, syncAfterRelationshipsWrite } from "./content/write-context";
import { isTypeTableNode } from "./node-capabilities";

export type CreateNodeError = "invalid_title" | "source_not_found" | "database_not_found";

export type CreateNodeLink =
  | {
      kind: "outgoing";
      sourceId: string;
      type: string;
      properties?: Properties;
      /** When set, also create IS_A membership on the new node to this type. */
      membershipTypeId?: string;
    }
  | { kind: "database-row"; databaseId: string; view?: string; properties?: Properties };

export interface CreateNodeInput {
  title: string;
  body?: string;
  link?: CreateNodeLink;
}

export interface CreateNodeResult {
  id: string;
  title: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function generateNodeId(): string {
  return randomUUID().replace(/-/g, "");
}

function allocateNodeId(ctx: TomeWriteContext): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = generateNodeId();
    if (!ctx.store.readNode(id)) return id;
  }
  return generateNodeId();
}

function ordinalFromProperties(properties: Record<string, unknown>): number | null {
  const raw = properties.ordinal;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function nextOutgoingOrdinal(ctx: TomeWriteContext, sourceId: string, type: string): number | undefined {
  const normalized = normalizeRelationshipType(type);
  const outgoing = ctx.db.listRelationshipsFromSource(sourceId).filter((c) => {
    const edgeType = normalizeRelationshipType(c.type);
    if (edgeType === normalized) return true;
    return isIncludesPerspectiveSlug(normalized) && edgeType === INCLUDES_TYPE;
  });
  if (outgoing.length === 0) return undefined;
  const ordinals = outgoing
    .map((c) => ordinalFromProperties(c.properties))
    .filter((v): v is number => v !== null);
  if (ordinals.length === 0) return undefined;
  return Math.max(...ordinals) + 1;
}

function nextDatabaseRowIndex(ctx: TomeWriteContext, databaseId: string): number {
  const incoming = ctx.db.listRelationshipsToTarget(databaseId).filter((c) => c.type === IS_A_TYPE);
  let max = -1;
  for (const connection of incoming) {
    const raw = connection.properties.row_index;
    const index =
      typeof raw === "number" && Number.isFinite(raw)
        ? raw
        : Number.parseInt(String(raw ?? ""), 10);
    if (Number.isFinite(index) && index > max) max = index;
  }
  return max + 1;
}

export function createNode(
  ctx: TomeWriteContext,
  input: CreateNodeInput,
): CreateNodeResult | CreateNodeError {
  const title = input.title.trim();
  if (!title) return "invalid_title";

  if (input.link?.kind === "outgoing") {
    if (!ctx.store.readNode(input.link.sourceId)) return "source_not_found";
  }
  if (input.link?.kind === "database-row") {
    const database = ctx.store.readNode(input.link.databaseId);
    if (
      !database ||
      !isTypeTableNode(ctx.db, input.link.databaseId, ctx.store.contentDir)
    ) {
      return "database_not_found";
    }
  }

  const id = allocateNodeId(ctx);
  const timestamp = nowIso();
  const body = input.body ?? "";

  ctx.store.writeNode(
    {
      id,
      properties: {
        title,
        created_at: timestamp,
        modified_at: timestamp,
      },
    },
    body,
  );
  syncAfterNodeWrite(ctx, id);

  if (input.link?.kind === "outgoing") {
    const { sourceId, type, properties = {}, membershipTypeId } = input.link;
    const relProps: Properties = { ...properties };
    const nextOrdinal = nextOutgoingOrdinal(ctx, sourceId, type);
    if (nextOrdinal !== undefined) relProps.ordinal = nextOrdinal;
    ctx.store.upsertRelationship(sourceId, id, type, relProps);
    if (membershipTypeId) {
      ctx.store.upsertRelationship(id, membershipTypeId, IS_A_TYPE, {});
    }
    syncAfterRelationshipsWrite(ctx);
  }

  if (input.link?.kind === "database-row") {
    const { databaseId, view, properties = {} } = input.link;
    const relProps: Properties = {
      ...properties,
      row_index: nextDatabaseRowIndex(ctx, databaseId),
      view: view ?? properties.view ?? "default",
    };
    ctx.store.upsertRelationship(id, databaseId, IS_A_TYPE, relProps);
    syncAfterRelationshipsWrite(ctx);
  }

  return { id, title };
}
