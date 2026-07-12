import { generateNodeId } from "tome-flatfile/node-id";
import type { Properties } from "tome-sqlite";
import {
  associationIdFromTypeOrProjection,
  isMemberSideProjectionType,
  loadAssociationsFromContent,
  parseProjectionType,
  setRoleProjectionTypesForComposite,
  setRoleProjectionTypesForNode,
} from "tome-flatfile";
import type { TomeWriteContext } from "./content/write-context";
import { syncAfterNodeWrite, syncAfterRelationshipsWrite } from "./content/write-context";
import { isTypeTableNode } from "./node-capabilities";
import { stampOrderIfMissing } from "./ordered-relationships";
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
  const registry = loadAssociationsFromContent(ctx.store.contentDir);
  const composite = associationIdFromTypeOrProjection(registry, type);
  const parsed = parseProjectionType(type);
  const outgoing = ctx.cache.listRelationshipsFromSource(sourceId).filter((c) => {
    if (c.type === type) return true;
    if (composite && associationIdFromTypeOrProjection(registry, c.type) === composite) {
      if (!parsed) return true;
      const edgeParsed = parseProjectionType(c.type);
      return edgeParsed?.endpointIndex === parsed.endpointIndex;
    }
    return false;
  });
  if (outgoing.length === 0) return undefined;
  const ordinals = outgoing
    .map((c) => ordinalFromProperties(c.properties))
    .filter((v): v is number => v !== null);
  if (ordinals.length === 0) return undefined;
  return Math.max(...ordinals) + 1;
}

function memberProjectionForSetLink(
  ctx: TomeWriteContext,
  setId: string,
  typeOrProjection?: string,
): string {
  const dir = ctx.store.contentDir;
  const registry = loadAssociationsFromContent(dir);
  if (typeOrProjection) {
    if (isMemberSideProjectionType(registry, typeOrProjection)) return typeOrProjection;
    const composite = associationIdFromTypeOrProjection(registry, typeOrProjection);
    if (composite) return setRoleProjectionTypesForComposite(registry, composite)[1];
  }
  return setRoleProjectionTypesForNode(setId, dir)[1];
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
      !isTypeTableNode(ctx.cache, input.link.databaseId, ctx.store.contentDir)
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
    const { sourceId, type, properties: linkProps = {}, typeTableId, typeTablePerspective } =
      input.link;
    const relProps: Properties = { ...linkProps };
    const nextOrdinal = nextOutgoingOrdinal(ctx, sourceId, type);
    if (nextOrdinal !== undefined) relProps.ordinal = nextOrdinal;
    ctx.store.upsertRelationship(sourceId, id, type, relProps);
    if (typeTableId) {
      const memberProjection = memberProjectionForSetLink(
        ctx,
        typeTableId,
        typeTablePerspective,
      );
      const setProps = stampOrderIfMissing(ctx, typeTableId, id, {}, memberProjection);
      ctx.store.upsertRelationship(id, typeTableId, memberProjection, setProps);
    }
    syncAfterRelationshipsWrite(ctx);
  }

  if (input.link?.kind === "database-row") {
    const { databaseId, properties: rowProps = {}, perspective } = input.link;
    const memberProjection = memberProjectionForSetLink(ctx, databaseId, perspective);
    const relProps = stampOrderIfMissing(
      ctx,
      databaseId,
      id,
      { ...rowProps },
      memberProjection,
    );
    ctx.store.upsertRelationship(id, databaseId, memberProjection, relProps);
    syncAfterRelationshipsWrite(ctx);
  }

  return { id, title };
}
