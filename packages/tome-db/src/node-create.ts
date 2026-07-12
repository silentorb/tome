import { generateNodeId } from "tome-flatfile/node-id";
import type { Properties } from "tome-sqlite";
import { normalizeRelationshipType } from "tome-flatfile";
import { resolveAssociationId } from "tome-flatfile";
import { loadAssociationsFromContent } from "tome-flatfile";
import {
  isMemberSidePerspective,
  resolveSetTraitComposite,
  setRolePerspectivesForNode,
  setRolePerspectivesForComposite,
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
  const normalized = normalizeRelationshipType(type);
  const registry = loadAssociationsFromContent(ctx.store.contentDir);
  let composite: string | null = null;
  try {
    composite = resolveAssociationId(registry, normalized);
  } catch {
    composite = null;
  }
  const outgoing = ctx.cache.listRelationshipsFromSource(sourceId).filter((c) => {
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

function memberPerspectiveForSetLink(
  ctx: TomeWriteContext,
  setId: string,
  perspective?: string,
): string {
  const dir = ctx.store.contentDir;
  const registry = loadAssociationsFromContent(dir);
  if (perspective) {
    const normalized = normalizeRelationshipType(perspective);
    if (isMemberSidePerspective(registry, normalized)) return normalized;
    const composite = resolveSetTraitComposite(registry, normalized);
    if (composite) return setRolePerspectivesForComposite(registry, composite)[1];
  }
  return setRolePerspectivesForNode(setId, dir)[1];
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
      const memberPerspective = memberPerspectiveForSetLink(
        ctx,
        typeTableId,
        typeTablePerspective,
      );
      const setProps = stampOrderIfMissing(ctx, typeTableId, id, {}, memberPerspective);
      ctx.store.upsertRelationship(id, typeTableId, memberPerspective, setProps);
    }
    syncAfterRelationshipsWrite(ctx);
  }

  if (input.link?.kind === "database-row") {
    const { databaseId, properties: rowProps = {}, perspective } = input.link;
    const memberPerspective = memberPerspectiveForSetLink(ctx, databaseId, perspective);
    const relProps = stampOrderIfMissing(
      ctx,
      databaseId,
      id,
      { ...rowProps },
      memberPerspective,
    );
    ctx.store.upsertRelationship(id, databaseId, memberPerspective, relProps);
    syncAfterRelationshipsWrite(ctx);
  }

  return { id, title };
}
