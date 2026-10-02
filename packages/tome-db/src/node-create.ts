import { generateNodeId } from "tome-flatfile/node-id";
import type { Properties } from "tome-sqlite";
import {
  relationshipTypeIdFromTypeOrProjection,
  isMemberSideProjectionType,
  loadRelationshipTypesFromContent,
  parseProjectionType,
  setRoleProjectionTypesForComposite,
  setRoleProjectionTypesForNode,
} from "tome-flatfile";
import type { TomeWriteContext } from "./content/write-context";
import {
  contentDirForGraphStore,
  primaryCorpusIdFromGraphStore,
  syncAfterNodeWrite,
  syncAfterRelationshipsWrite,
} from "./content/write-context";
import { isTypeTableNode } from "./node-capabilities";
import { stampOrderIfMissing } from "./ordered-relationships";
import {
  listRelationshipsFromSource,
  listRelationshipsToTarget,
} from "./graph-store/relationship-read";
import {
  writeStoreGetNode,
  writeStoreListCorpora,
  writeStoreLocateNode,
  writeStoreUpsertNodeToCorpus,
  writeStoreUpsertRelationship,
} from "./graph-store/relationship-write";
import {
  isPersistableNodeTitle,
  type CreateNodeError,
  type CreateNodeInput,
  type CreateNodeLink,
  type CreateNodeResult,
} from "tome-graph-interfaces";
import { CorpusReadonlyError } from "tome-flatfile";

export type {
  CreateNodeError,
  CreateNodeInput,
  CreateNodeLink,
  CreateNodeResult,
} from "tome-graph-interfaces";

function nowIso(): string {
  return new Date().toISOString();
}

async function allocateNodeId(ctx: TomeWriteContext): Promise<string> {
  const store = ctx.graphStore;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = generateNodeId();
    if (!await writeStoreGetNode(store, id)) return id;
  }
  return generateNodeId();
}

function resolveCreateCorpusId(ctx: TomeWriteContext, input: CreateNodeInput): string | "corpus_not_found" {
  const store = ctx.graphStore;
  if (input.corpus?.trim()) {
    const id = input.corpus.trim();
    if (!writeStoreListCorpora(store).some((c) => c.id === id)) return "corpus_not_found";
    return id;
  }
  if (input.link?.kind === "outgoing") {
    const fromSource = writeStoreLocateNode(store, input.link.sourceId);
    if (fromSource) return fromSource;
  }
  if (input.link?.kind === "database-row") {
    const fromDb = writeStoreLocateNode(store, input.link.databaseId);
    if (fromDb) return fromDb;
  }
  return primaryCorpusIdFromGraphStore(store);
}

function ordinalFromProperties(properties: Record<string, unknown>): number | null {
  const raw = properties.ordinal;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function nextOutgoingOrdinal(ctx: TomeWriteContext, sourceId: string, type: string): Promise<number | undefined> {
  const store = ctx.graphStore;
  const dir = contentDirForGraphStore(store, sourceId);
  const registry = loadRelationshipTypesFromContent(dir);
  const composite = relationshipTypeIdFromTypeOrProjection(registry, type);
  const parsed = parseProjectionType(type);
  const outgoing = (await listRelationshipsFromSource(store, sourceId)).filter((c) => {
    if (c.type === type) return true;
    if (composite && relationshipTypeIdFromTypeOrProjection(registry, c.type) === composite) {
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
  const store = ctx.graphStore;
  const dir = contentDirForGraphStore(store, setId);
  const registry = loadRelationshipTypesFromContent(dir);
  if (typeOrProjection) {
    if (isMemberSideProjectionType(registry, typeOrProjection)) return typeOrProjection;
    const composite = relationshipTypeIdFromTypeOrProjection(registry, typeOrProjection);
    if (composite) return setRoleProjectionTypesForComposite(registry, composite)[1];
  }
  return setRoleProjectionTypesForNode(setId, dir)[1];
}

export async function createNode(
  ctx: TomeWriteContext,
  input: CreateNodeInput,
): Promise<CreateNodeResult | CreateNodeError> {
  const store = ctx.graphStore;
  const title = input.title.trim();
  if (!isPersistableNodeTitle(title)) return "invalid_title";

  if (input.link?.kind === "outgoing") {
    if (!await writeStoreGetNode(store, input.link.sourceId)) return "source_not_found";
  }
  if (input.link?.kind === "database-row") {
    const database = await writeStoreGetNode(store, input.link.databaseId);
    const dbDir = contentDirForGraphStore(store, input.link.databaseId);
    if (!database || !await isTypeTableNode(store, input.link.databaseId, dbDir)) {
      return "database_not_found";
    }
  }

  const corpusId = resolveCreateCorpusId(ctx, input);
  if (corpusId === "corpus_not_found") return corpusId;

  const id = await allocateNodeId(ctx);
  const timestamp = nowIso();
  const body = input.body ?? "";

  try {
    await writeStoreUpsertNodeToCorpus(
      store,
      corpusId,
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
  } catch (err) {
    if (err instanceof CorpusReadonlyError) return "corpus_readonly";
    throw err;
  }
  await syncAfterNodeWrite(ctx, id);

  if (input.link?.kind === "outgoing") {
    const { sourceId, type, properties: linkProps = {}, typeTableId, typeTablePerspective } =
      input.link;
    const relProps: Properties = { ...linkProps };
    const nextOrdinal = await nextOutgoingOrdinal(ctx, sourceId, type);
    if (nextOrdinal !== undefined) relProps.ordinal = nextOrdinal;
    await writeStoreUpsertRelationship(store, sourceId, id, type, relProps);
    if (typeTableId) {
      const memberProjection = memberProjectionForSetLink(
        ctx,
        typeTableId,
        typeTablePerspective,
      );
      const setProps = await stampOrderIfMissing(ctx, typeTableId, id, {}, memberProjection);
      await writeStoreUpsertRelationship(store, id, typeTableId, memberProjection, setProps);
    }
    await syncAfterRelationshipsWrite(ctx);
  }

  if (input.link?.kind === "database-row") {
    const {
      databaseId,
      properties: rowProps = {},
      perspective,
      relations = [],
      orderScopeRelations = [],
    } = input.link;
    const memberProjection = memberProjectionForSetLink(ctx, databaseId, perspective);

    let memberFilter: Set<string> | null = null;
    if (orderScopeRelations.length > 0) {
      memberFilter = new Set<string>();
      for (const edge of await listRelationshipsToTarget(store, databaseId, memberProjection)) {
        const memberId = edge.sourceNodeId;
        let matches = true;
        for (const scopeRel of orderScopeRelations) {
          const rels = await listRelationshipsFromSource(store, memberId, scopeRel.type);
          if (!rels.some((rel) => rel.targetNodeId === scopeRel.targetId)) {
            matches = false;
            break;
          }
        }
        if (matches) memberFilter.add(memberId);
      }
    }

    const relProps = await stampOrderIfMissing(
      ctx,
      databaseId,
      id,
      { ...rowProps },
      memberProjection,
      memberFilter,
    );
    await writeStoreUpsertRelationship(store, id, databaseId, memberProjection, relProps);

    for (const relation of relations) {
      const nextOrdinal = await nextOutgoingOrdinal(ctx, id, relation.type);
      const linkProps: Properties = { ...(relation.properties ?? {}) };
      if (nextOrdinal !== undefined && linkProps.ordinal === undefined) {
        linkProps.ordinal = nextOrdinal;
      }
      await writeStoreUpsertRelationship(store, id, relation.targetId, relation.type, linkProps);
    }

    await syncAfterRelationshipsWrite(ctx);
  }

  return { id, title };
}
