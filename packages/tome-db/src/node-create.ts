import { generateNodeId } from "./node-id";
import type { Properties } from "./graph";
import { normalizeRelationshipType } from "./relation-type";
import { resolveCompositeType } from "./content/relationship-types-file";
import { loadRelationshipTypesFromContent } from "./relationship-types/load";
import type { TomeWriteContext } from "./content/write-context";
import { syncAfterNodeWrite, syncAfterRelationshipsWrite } from "./content/write-context";
import { isTypeTableNode } from "./node-capabilities";
import { stampOrderIfMissing } from "./ordered-relationships";
import {
  membershipCompositeForSet,
  membershipPerspectivesForSet,
} from "./relationship-type-traits";
import type {
  CreateNodeError,
  CreateNodeInput,
  CreateNodeLink,
  CreateNodeResult,
} from "tome-graph-interfaces";

export type {
  CreateNodeError,
  CreateNodeInput,
  CreateNodeLink,
  CreateNodeResult,
} from "tome-graph-interfaces";


function nowIso(): string {
  return new Date().toISOString();
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
  const registry = loadRelationshipTypesFromContent(ctx.store.contentDir);
  const composite = resolveCompositeType(registry, normalized);
  const outgoing = ctx.db.listRelationshipsFromSource(sourceId).filter((c) => {
    const edgeType = normalizeRelationshipType(c.type);
    return edgeType === composite || edgeType === normalized;
  });
  if (outgoing.length === 0) return undefined;
  const ordinals = outgoing
    .map((c) => ordinalFromProperties(c.properties))
    .filter((v): v is number => v !== null);
  if (ordinals.length === 0) return undefined;
  return Math.max(...ordinals) + 1;
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
      const [, memberPerspective] = membershipPerspectivesForSet(
        membershipTypeId,
        ctx.store.contentDir,
      );
      const membershipProps = stampOrderIfMissing(
        ctx,
        membershipTypeId,
        id,
        {},
      );
      ctx.store.upsertRelationship(id, membershipTypeId, memberPerspective, membershipProps);
    }
    syncAfterRelationshipsWrite(ctx);
  }

  if (input.link?.kind === "database-row") {
    const { databaseId, properties = {} } = input.link;
    const [, memberPerspective] = membershipPerspectivesForSet(databaseId, ctx.store.contentDir);
    const relProps = stampOrderIfMissing(ctx, databaseId, id, { ...properties });
    ctx.store.upsertRelationship(id, databaseId, memberPerspective, relProps);
    syncAfterRelationshipsWrite(ctx);
  }

  return { id, title };
}
