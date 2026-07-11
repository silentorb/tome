import { readFileSync, writeFileSync } from "node:fs";
import {
  parseRelationshipsFile,
  serializeRelationshipsFile,
  RELATIONSHIPS_FILE_VERSION,
  type RelationshipEntry,
  type RelationshipsFile,
} from "../content/relationships-file";
import {
  parseRelationshipTypesFile,
  type RelationshipTypesFile,
} from "../content/relationship-types-file";
import { parseTableSchemasFile } from "../content/table-schemas-file";
import {
  perspectiveForRelationColumn,
  targetTypeIdForRelationColumn,
} from "../table-relation-column";
import { parseWorkspaceFile } from "../workspace/workspace-file";
import { normalizeRelationshipType } from "../relation-type";
import {
  relationshipsFilePath,
  relationshipTypesFilePath,
  tableSchemasFilePath,
  workspaceFilePath,
} from "../content/paths";

/**
 * Step 1 content migration: reorder each `relationships.json` tuple into a
 * *meaningful* order so relative semantics come from the tuple position, then
 * bump the file to version {@link RELATIONSHIPS_FILE_VERSION}.
 *
 * Prior to this, endpoints were stored lexicographically sorted with no stored
 * direction; `member_of` direction was re-derived at cache time from set
 * membership, and asymmetric composites bound `perspectives[0]` to the
 * lexicographically-smaller node. Now the SQLite expander binds strictly by
 * tuple order, so the authored order must carry the intent.
 *
 * Orientation source of truth (in priority):
 *   - **"member_of"**: parent (set) at index 0, child (member) at index 1.
 *   - **asymmetric cross-type**: place the endpoint whose node type owns the
 *     `perspectives[0]` relation column (targeting the other endpoint's type) at
 *     index 0, derived from `table-schemas.json`.
 *   - **symmetric** (perspectives repeat): order is irrelevant, left as-is.
 *   - **ambiguous** (same-type asymmetric like parents_children, or missing node
 *     types): left in their current order and reported for manual review.
 */

const TRIPLE_SEP = "\u0000";

export interface RelationshipOrderContext {
  registry: RelationshipTypesFile;
  /** node id -> type-table ids it is a member of (derived from "member_of" edges). */
  nodeTypes: Map<string, Set<string>>;
  /** Type-table ids plus the archive hub id. */
  setNodeIds: Set<string>;
  /** `${ownerTypeId}\0${perspective}\0${targetTypeId}` for every relation column. */
  relationTriples: Set<string>;
}

export interface RelationshipOrderReport {
  total: number;
  reordered: number;
  unchanged: number;
  ambiguous: Array<{ type: string; a: string; b: string; reason: string }>;
}

function typesOf(nodeId: string, ctx: RelationshipOrderContext): Set<string> {
  const out = new Set(ctx.nodeTypes.get(nodeId) ?? []);
  if (ctx.setNodeIds.has(nodeId)) out.add(nodeId);
  return out;
}

function ownsPerspective(
  ctx: RelationshipOrderContext,
  ownerTypes: Set<string>,
  perspective: string,
  targetTypes: Set<string>,
): boolean {
  for (const owner of ownerTypes) {
    for (const target of targetTypes) {
      if (ctx.relationTriples.has(`${owner}${TRIPLE_SEP}${perspective}${TRIPLE_SEP}${target}`)) {
        return true;
      }
    }
  }
  return false;
}

/** Orient a `member_of` tuple as (parent/set, child/member). Returns null when undecidable. */
function orientMemberOf(
  entry: RelationshipEntry,
  ctx: RelationshipOrderContext,
): { a: string; b: string } | null {
  const aIsSet = ctx.setNodeIds.has(entry.a);
  const bIsSet = ctx.setNodeIds.has(entry.b);
  if (aIsSet && !bIsSet) return { a: entry.a, b: entry.b };
  if (bIsSet && !aIsSet) return { a: entry.b, b: entry.a };
  return null;
}

/** Orient an asymmetric composite so index 0 owns `perspectives[0]`. Null when undecidable. */
function orientAsymmetric(
  entry: RelationshipEntry,
  perspectives: readonly [string, string],
  ctx: RelationshipOrderContext,
): { a: string; b: string; reason?: string } | null {
  const tA = typesOf(entry.a, ctx);
  const tB = typesOf(entry.b, ctx);
  if (tA.size === 0 || tB.size === 0) {
    return { a: entry.a, b: entry.b, reason: "endpoint has no resolvable node type" };
  }
  const p0 = perspectives[0];
  const aOwnsP0 = ownsPerspective(ctx, tA, p0, tB);
  const bOwnsP0 = ownsPerspective(ctx, tB, p0, tA);
  if (aOwnsP0 && !bOwnsP0) return { a: entry.a, b: entry.b };
  if (bOwnsP0 && !aOwnsP0) return { a: entry.b, b: entry.a };
  return { a: entry.a, b: entry.b, reason: "endpoints share type or perspective owner is ambiguous" };
}

/** Pure reorder over a parsed relationships file. */
export function reorderRelationshipsFile(
  file: RelationshipsFile,
  ctx: RelationshipOrderContext,
): { file: RelationshipsFile; report: RelationshipOrderReport } {
  const report: RelationshipOrderReport = {
    total: file.relationships.length,
    reordered: 0,
    unchanged: 0,
    ambiguous: [],
  };

  const relationships = file.relationships.map((entry) => {
    const perspectives = ctx.registry.types[normalizeRelationshipType(entry.type)]?.perspectives;
    const rebuilt = (a: string, b: string): RelationshipEntry => ({
      a,
      b,
      type: entry.type,
      ...(entry.archived === true ? { archived: true } : {}),
      ...(entry.properties ? { properties: entry.properties } : {}),
    });

    // Unregistered or symmetric types carry no direction — leave as authored.
    if (!perspectives || perspectives[0] === perspectives[1]) {
      report.unchanged += 1;
      return entry;
    }

    const oriented =
      normalizeRelationshipType(entry.type) === "member_of"
        ? orientMemberOf(entry, ctx)
        : orientAsymmetric(entry, perspectives, ctx);

    if (!oriented) {
      // "member_of" with both/neither endpoint a set: keep current order, flag it.
      report.ambiguous.push({
        type: entry.type,
        a: entry.a,
        b: entry.b,
        reason: "member_of: exactly one endpoint must be a set",
      });
      report.unchanged += 1;
      return entry;
    }

    if ("reason" in oriented && typeof oriented.reason === "string" && oriented.reason) {
      report.ambiguous.push({ type: entry.type, a: entry.a, b: entry.b, reason: oriented.reason });
      report.unchanged += 1;
      return entry;
    }

    if (oriented.a === entry.a && oriented.b === entry.b) {
      report.unchanged += 1;
      return entry;
    }

    report.reordered += 1;
    return rebuilt(oriented.a, oriented.b);
  });

  return {
    file: { version: RELATIONSHIPS_FILE_VERSION, relationships },
    report,
  };
}

function safeReadJson(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/** Build orientation context from a content corpus's model config + "member_of" edges. */
export function buildRelationshipOrderContext(
  contentDir: string,
  relationships: readonly RelationshipEntry[],
): RelationshipOrderContext {
  const registryRaw = safeReadJson(relationshipTypesFilePath(contentDir));
  const registry = registryRaw
    ? parseRelationshipTypesFile(registryRaw)
    : { version: 1, types: {} };

  const schemasRaw = safeReadJson(tableSchemasFilePath(contentDir));
  const schemas = schemasRaw ? parseTableSchemasFile(schemasRaw) : { version: 1, tables: {} };

  const setNodeIds = new Set<string>(Object.keys(schemas.tables));
  const workspaceRaw = safeReadJson(workspaceFilePath(contentDir));
  if (workspaceRaw) {
    try {
      setNodeIds.add(parseWorkspaceFile(workspaceRaw).archiveNodeId);
    } catch {
      /* workspace.json optional / partial in some corpora */
    }
  }

  const relationTriples = new Set<string>();
  for (const [owner, schema] of Object.entries(schemas.tables)) {
    for (const col of schema.columns) {
      if (col.type !== "relation") continue;
      const perspective = perspectiveForRelationColumn(registry, owner, col);
      const target = targetTypeIdForRelationColumn(registry, owner, col);
      if (!target) continue;
      relationTriples.add(`${owner}${TRIPLE_SEP}${perspective}${TRIPLE_SEP}${target}`);
    }
  }

  const nodeTypes = new Map<string, Set<string>>();
  const addType = (node: string, type: string) => {
    const set = nodeTypes.get(node) ?? new Set<string>();
    set.add(type);
    nodeTypes.set(node, set);
  };
  for (const entry of relationships) {
    if (normalizeRelationshipType(entry.type) !== "member_of") continue;
    const aIsSet = setNodeIds.has(entry.a);
    const bIsSet = setNodeIds.has(entry.b);
    if (aIsSet && !bIsSet) addType(entry.b, entry.a);
    else if (bIsSet && !aIsSet) addType(entry.a, entry.b);
  }

  return { registry, nodeTypes, setNodeIds, relationTriples };
}

/** Migrate `relationships.json` in place; returns the reorder report. */
export function migrateRelationshipOrder(contentDir: string): RelationshipOrderReport {
  const path = relationshipsFilePath(contentDir);
  const raw = readFileSync(path, "utf-8");
  const file = parseRelationshipsFile(raw);
  const ctx = buildRelationshipOrderContext(contentDir, file.relationships);
  const { file: next, report } = reorderRelationshipsFile(file, ctx);
  writeFileSync(path, serializeRelationshipsFile(next), "utf-8");
  return report;
}
