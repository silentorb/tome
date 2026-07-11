import type { GraphDatabase, Relationship, Properties } from "./graph";
import type { TomeWriteContext } from "./content/write-context";
import { syncAfterRelationshipsWrite } from "./content/write-context";
import { relationshipId } from "./graph";
import type { DatabaseColumnDef } from "./database-view";
import type { RelationLink } from "./relation-link";
import { applyDynamicFields } from "./dynamic-fields";
import { hydrateRelationCellsForRows } from "./database-view-relations";
import { buildDatabaseColumnDefs, normalizeRowCells } from "./database-column-defs";
import type { EvalRow } from "./row-sort";
import { resolveGeneratedTabsFromScopes } from "./views/resolve-tabs";
import { loadViewsFromContent } from "./views/load";
import { loadRelationshipTypesFromContent } from "./relationship-types/load";
import { resolveContentPath } from "./content/paths";
import { perspectiveForHostTable } from "./relationship-type-endpoints";
import { normalizeRelationshipType } from "./relation-type";
import { getTableSchema, relationColumns } from "./table-schema";
import { loadTableSchemasFromContent } from "./table-schemas/load";
import {
  perspectiveForRelationColumn,
  relationColumnCompositeType,
} from "./table-relation-column";
import { applySectionColumnOrder } from "./views/column-order";
import type { TableTabsDetail } from "./views/tabs";
import {
  firstRelatedNodeId,
  listRelationshipsForComposite,
  relatedNodeIds,
} from "./relationship-traverse";
import type { OrderedAssociationConfig } from "./ordered-associations-config/ordered-associations-file";
import { loadOrderedAssociationsFromContent } from "./ordered-associations-config/load";
import { listSetMemberRowConnections } from "./set-membership";
import { ORDERED_PROPERTY_DEFAULT,
  isOrderedTraitComposite,
  membershipPerspectivesForSet,
  orderedPropertyName,
  setRoleIndices,
  typesWithTrait,
  SET_TRAIT,
} from "./relationship-type-traits";
import { ORDER_META_KEYS, applySparseOrderRewrite } from "./ordered-relationships";

export type { OrderedAssociationConfig } from "./ordered-associations-config/ordered-associations-file";

/** Synthetic group id for members with no group association. */
export const UNASSIGNED_GROUP_ID = "__unassigned__";

const ORDERED_ASSOCIATION_META_KEYS = ORDER_META_KEYS;

function loadConfigs(contentDir?: string): OrderedAssociationConfig[] {
  return loadOrderedAssociationsFromContent(contentDir ?? resolveContentPath()).configs;
}

export interface OrderedAssociationScope {
  id: string;
  name: string;
}

export interface OrderedAssociationRow {
  /** Member node id in the type database (e.g. a scene). */
  sceneId: string;
  name: string;
  cells: Record<string, string>;
  relationCells?: Record<string, RelationLink[]>;
}

export interface OrderedAssociationGroup {
  groupId: string;
  title: string;
  rows: OrderedAssociationRow[];
}

export interface OrderedAssociationViewDetail {
  configId: string;
  typeDatabaseId: string;
  typeDatabaseTitle: string;
  /** Set-side perspective = views.json relationshipType / section key. */
  viewRelationshipType: string;
  /** Member-side perspective for unlink/move against this set. */
  memberSidePerspective: string;
  tabs: TableTabsDetail;
  groups: OrderedAssociationGroup[];
  columns: string[];
  columnDefs?: DatabaseColumnDef[];
}

export interface OrderedAssociationMoveParams {
  scopeId: string;
  sceneId: string;
  targetGroupId: string;
  targetIndex: number;
}

interface MemberInfo {
  sceneId: string;
  name: string;
  order: number;
  partId: string | null;
  membershipRelationship: Relationship;
  cells: Record<string, string>;
}

function titleFromProperties(properties: Record<string, unknown>): string {
  const title = properties.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  const alias = properties.alias;
  if (typeof alias === "string" && alias.trim()) return alias.trim();
  return "Untitled";
}

function stringProperty(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function numericSortKey(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const parsed = Number.parseFloat(String(raw ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cellsFromMembershipRelationship(
  config: OrderedAssociationConfig,
  properties: Record<string, unknown>,
): Record<string, string> {
  const cells: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (ORDERED_ASSOCIATION_META_KEYS.has(key)) continue;
    if (key === ORDERED_PROPERTY_DEFAULT) continue;
    const text = stringProperty(value);
    if (text !== null) cells[key] = text;
  }
  return cells;
}

function getConfig(configId: string, contentDir?: string): OrderedAssociationConfig | null {
  return loadConfigs(contentDir).find((config) => config.id === configId) ?? null;
}

function groupLinkLocalPerspective(
  config: OrderedAssociationConfig,
  contentDir: string,
): string {
  const registry = loadRelationshipTypesFromContent(contentDir);
  const groupComposite = normalizeRelationshipType(config.groupCompositeType);
  const schema = getTableSchema(loadTableSchemasFromContent(contentDir), config.typeDatabaseId);
  if (schema) {
    for (const col of relationColumns(schema)) {
      if (col.type !== "relation") continue;
      if (relationColumnCompositeType(col) !== groupComposite) continue;
      return perspectiveForRelationColumn(registry, config.typeDatabaseId, col);
    }
  }
  const def = registry.types[groupComposite];
  if (!def) {
    throw new Error(
      `ordered-associations config "${config.id}": unknown groupCompositeType "${config.groupCompositeType}"`,
    );
  }
  const perspective = perspectiveForHostTable(def, config.typeDatabaseId);
  if (!perspective) {
    throw new Error(
      `ordered-associations config "${config.id}": groupCompositeType "${config.groupCompositeType}" has no endpoint for type database`,
    );
  }
  return perspective;
}

export function getConfigByProvider(
  provider: string,
  contentDir?: string,
): OrderedAssociationConfig | null {
  return loadConfigs(contentDir).find((config) => config.id === provider) ?? null;
}

export function getOrderedAssociationConfigForDatabase(
  databaseId: string,
  contentDir?: string,
): OrderedAssociationConfig | null {
  return loadConfigs(contentDir).find((config) => config.typeDatabaseId === databaseId) ?? null;
}

function scopeRelationshipTarget(
  db: GraphDatabase,
  sceneId: string,
  compositeType: string,
): string | null {
  return firstRelatedNodeId(db, sceneId, compositeType);
}

function groupConnectionTarget(
  db: GraphDatabase,
  sceneId: string,
  compositeType: string,
): string | null {
  return firstRelatedNodeId(db, sceneId, compositeType);
}

function membershipRelationships(
  db: GraphDatabase,
  config: OrderedAssociationConfig,
  contentDir?: string,
): Relationship[] {
  return listSetMemberRowConnections(db, config.typeDatabaseId, contentDir);
}

function scopeMembershipSortKey(
  db: GraphDatabase,
  scopeNodeId: string,
  contentDir?: string,
): number {
  const dir = contentDir ?? resolveContentPath();
  const registry = loadRelationshipTypesFromContent(dir);
  for (const composite of typesWithTrait(registry, SET_TRAIT)) {
    if (!isOrderedTraitComposite(registry, composite)) continue;
    const def = registry.types[composite];
    if (!def) continue;
    const { childIndex } = setRoleIndices(def);
    const memberPerspective = def.perspectives[childIndex]!;
    const property = orderedPropertyName(def);
    for (const edge of db.listRelationshipsFromSource(scopeNodeId, memberPerspective)) {
      return numericSortKey(edge.properties[property], 999);
    }
  }
  return 999;
}

function partSortKey(
  db: GraphDatabase,
  partId: string,
  groupTypeDatabaseId: string,
  contentDir: string,
): number {
  const [, memberPerspective] = membershipPerspectivesForSet(groupTypeDatabaseId, contentDir);
  const edge = db.getRelationship(relationshipId(partId, memberPerspective, groupTypeDatabaseId));
  if (edge) {
    return numericSortKey(edge.properties[ORDERED_PROPERTY_DEFAULT], 999);
  }
  return 999;
}

function partsForScope(
  db: GraphDatabase,
  config: OrderedAssociationConfig,
  scopeId: string,
  contentDir: string,
): { id: string; title: string; sortKey: number }[] {
  const parts: { id: string; title: string; sortKey: number }[] = [];
  const [, memberPerspective] = membershipPerspectivesForSet(config.groupTypeDatabaseId, contentDir);

  for (const connection of db.listRelationshipsToTarget(
    config.groupTypeDatabaseId,
    memberPerspective,
  )) {
    const partId = connection.sourceNodeId;
    const productIds = relatedNodeIds(db, partId, config.partProductCompositeType);
    if (!productIds.includes(scopeId)) continue;

    const vertex = db.getNode(partId);
    parts.push({
      id: partId,
      title: vertex ? titleFromProperties(vertex.properties) : "Untitled",
      sortKey: partSortKey(db, partId, config.groupTypeDatabaseId, contentDir),
    });
  }

  const byId = new Map<string, { id: string; title: string; sortKey: number }>();
  for (const part of parts) byId.set(part.id, part);
  return [...byId.values()].sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

function canonicalPartIdForTitle(
  scopeParts: { id: string; title: string }[],
  title: string,
): string | null {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return null;
  const match = scopeParts.find((part) => part.title.trim().toLowerCase() === normalized);
  return match?.id ?? null;
}

/** Resolve which scope part a scene belongs to, tolerating duplicate part vertices from import. */
function resolveScenePartId(
  db: GraphDatabase,
  config: OrderedAssociationConfig,
  sceneId: string,
  scopeParts: { id: string; title: string }[],
): string | null {
  const scopePartIds = new Set(scopeParts.map((part) => part.id));
  const partConnectionTarget = groupConnectionTarget(db, sceneId, config.groupCompositeType);

  if (partConnectionTarget) {
    if (scopePartIds.has(partConnectionTarget)) return partConnectionTarget;

    const partVertex = db.getNode(partConnectionTarget);
    if (partVertex) {
      const canonicalId = canonicalPartIdForTitle(
        scopeParts,
        titleFromProperties(partVertex.properties),
      );
      if (canonicalId) return canonicalId;
    }
  }

  return null;
}

function collectMembersInScope(
  db: GraphDatabase,
  config: OrderedAssociationConfig,
  scopeId: string,
  contentDir: string,
): MemberInfo[] {
  const scopeParts = partsForScope(db, config, scopeId, contentDir);
  const members: MemberInfo[] = [];
  let fallbackOrder = 0;

  for (const connection of membershipRelationships(db, config, contentDir)) {
    const sceneId = connection.sourceNodeId;
    const productId = scopeRelationshipTarget(db, sceneId, config.scopeCompositeType);
    if (productId !== scopeId) continue;

    const vertex = db.getNode(sceneId);
    const partId = resolveScenePartId(db, config, sceneId, scopeParts);
    fallbackOrder += 10;

    members.push({
      sceneId,
      name: vertex ? titleFromProperties(vertex.properties) : "Untitled",
      order: numericSortKey(connection.properties[ORDERED_PROPERTY_DEFAULT], fallbackOrder),
      partId,
      membershipRelationship: connection,
      cells: cellsFromMembershipRelationship(config, connection.properties),
    });
  }

  members.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return members;
}

function buildGroups(
  db: GraphDatabase,
  config: OrderedAssociationConfig,
  scopeId: string,
  members: MemberInfo[],
  contentDir: string,
): OrderedAssociationGroup[] {
  const parts = partsForScope(db, config, scopeId, contentDir);
  const membersByPart = new Map<string | null, MemberInfo[]>();

  for (const member of members) {
    const key = member.partId;
    const group = membersByPart.get(key) ?? [];
    group.push(member);
    membersByPart.set(key, group);
  }

  const groups: OrderedAssociationGroup[] = [];

  for (const part of parts) {
    const rows = (membersByPart.get(part.id) ?? []).map(memberToRow);
    groups.push({ groupId: part.id, title: part.title, rows });
    membersByPart.delete(part.id);
  }

  const unassignedMembers = membersByPart.get(null) ?? [];
  for (const [partId, orphaned] of membersByPart) {
    if (partId !== null) {
      unassignedMembers.push(...orphaned);
    }
  }

  groups.push({
    groupId: UNASSIGNED_GROUP_ID,
    title: config.unassignedGroupTitle,
    rows: unassignedMembers.map(memberToRow),
  });

  return groups;
}

function memberToRow(member: MemberInfo): OrderedAssociationRow {
  return { sceneId: member.sceneId, name: member.name, cells: member.cells };
}

function collectColumns(members: MemberInfo[]): string[] {
  const columnSet = new Set<string>();
  for (const member of members) {
    for (const key of Object.keys(member.cells)) columnSet.add(key);
  }
  return [...columnSet].sort((a, b) => a.localeCompare(b));
}

function discoverScopes(
  db: GraphDatabase,
  config: OrderedAssociationConfig,
  contentDir: string,
): OrderedAssociationScope[] {
  const scopeIds = new Set<string>();

  for (const connection of membershipRelationships(db, config, contentDir)) {
    const productId = scopeRelationshipTarget(db, connection.sourceNodeId, config.scopeCompositeType);
    if (productId) scopeIds.add(productId);
  }

  const scopes: OrderedAssociationScope[] = [];
  for (const id of scopeIds) {
    const vertex = db.getNode(id);
    scopes.push({
      id,
      name: vertex ? titleFromProperties(vertex.properties) : "Untitled",
    });
  }

  scopes.sort((a, b) => {
    const keyA = scopeMembershipSortKey(db, a.id, contentDir);
    const keyB = scopeMembershipSortKey(db, b.id, contentDir);
    if (keyA !== keyB) return keyA - keyB;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  return scopes;
}

export function getOrderedAssociationView(
  db: GraphDatabase,
  configId: string,
  requestedTabId?: string,
  contentDir?: string,
): OrderedAssociationViewDetail | null {
  const dir = contentDir ?? resolveContentPath();
  const config = getConfig(configId, dir);
  if (!config) return null;

  const database = db.getNode(config.typeDatabaseId);
  if (!database) return null;

  const scopes = discoverScopes(db, config, dir);
  const tabs = resolveGeneratedTabsFromScopes(scopes, requestedTabId);
  const activeScopeId = tabs.activeTabId;

  const members = activeScopeId ? collectMembersInScope(db, config, activeScopeId, dir) : [];
  const groups = activeScopeId
    ? buildGroups(db, config, activeScopeId, members, dir)
    : [];

  const excludeKeys = new Set(config.excludedColumnKeys ?? []);
  const evalRows: EvalRow[] = members.map((member) => ({
    nodeId: member.sceneId,
    name: member.name,
    cells: member.cells,
    rowIndex: member.order,
    createdAt: null,
    modifiedAt: null,
  }));
  const { rows: enrichedRows, dynamicColumnDefs, hiddenColumnKeys } = applyDynamicFields(
    db,
    config.typeDatabaseId,
    "default",
    evalRows,
    undefined,
    contentDir ? { contentDir: dir } : undefined,
  );
  const mergedColumnDefs = buildDatabaseColumnDefs(
    db,
    config.typeDatabaseId,
    dynamicColumnDefs,
    hiddenColumnKeys,
    { excludeKeys, contentDir: dir },
  );
  hydrateRelationCellsForRows(db, config.typeDatabaseId, mergedColumnDefs, enrichedRows, dir);
  const rowBySceneId = new Map(enrichedRows.map((row) => [row.nodeId, row]));
  const enrichedGroups = groups.map((group) => ({
    ...group,
    rows: group.rows.map((row) => {
      const enriched = rowBySceneId.get(row.sceneId);
      if (!enriched) return row;
      return {
        sceneId: row.sceneId,
        name: row.name,
        cells: normalizeRowCells(enriched.cells, mergedColumnDefs),
        relationCells: enriched.relationCells,
      };
    }),
  }));
  const defaultColumns =
    mergedColumnDefs.length > 0
      ? mergedColumnDefs.map((col) => col.key)
      : collectColumns(members);

  const views = loadViewsFromContent(dir);
  const [viewRelationshipType, memberSidePerspective] = membershipPerspectivesForSet(
    config.typeDatabaseId,
    dir,
  );
  const { columns, columnDefs } = applySectionColumnOrder(
    defaultColumns,
    mergedColumnDefs.length > 0 ? mergedColumnDefs : undefined,
    views,
    config.typeDatabaseId,
    viewRelationshipType,
  );

  return {
    configId: config.id,
    typeDatabaseId: config.typeDatabaseId,
    typeDatabaseTitle: titleFromProperties(database.properties),
    viewRelationshipType,
    memberSidePerspective,
    tabs,
    groups: enrichedGroups,
    columns,
    columnDefs,
  };
}

function flattenGroupRows(groups: OrderedAssociationGroup[]): string[] {
  const sceneIds: string[] = [];
  for (const group of groups) {
    for (const row of group.rows) {
      sceneIds.push(row.sceneId);
    }
  }
  return sceneIds;
}

function groupsFromMembers(
  db: GraphDatabase,
  config: OrderedAssociationConfig,
  scopeId: string,
  members: MemberInfo[],
  contentDir: string,
): OrderedAssociationGroup[] {
  return buildGroups(db, config, scopeId, members, contentDir);
}

function applyMoveToGroups(
  groups: OrderedAssociationGroup[],
  sceneId: string,
  targetGroupId: string,
  targetIndex: number,
): OrderedAssociationGroup[] {
  const nextGroups = groups.map((group) => ({
    ...group,
    rows: [...group.rows],
  }));

  let movedRow: OrderedAssociationRow | null = null;

  for (const group of nextGroups) {
    const index = group.rows.findIndex((row) => row.sceneId === sceneId);
    if (index >= 0) {
      movedRow = group.rows.splice(index, 1)[0] ?? null;
      break;
    }
  }

  if (!movedRow) return groups;

  const targetGroup = nextGroups.find((group) => group.groupId === targetGroupId);
  if (!targetGroup) return groups;

  const safeIndex = Math.max(0, Math.min(targetIndex, targetGroup.rows.length));
  targetGroup.rows.splice(safeIndex, 0, movedRow);

  return nextGroups;
}

export function applyOrderedAssociationMove(
  ctx: TomeWriteContext,
  configId: string,
  params: OrderedAssociationMoveParams,
): OrderedAssociationViewDetail | null {
  const db = ctx.db;
  const contentDir = ctx.store.contentDir;
  const config = getConfig(configId, contentDir);
  if (!config) return null;

  const members = collectMembersInScope(db, config, params.scopeId, contentDir);
  if (!members.some((member) => member.sceneId === params.sceneId)) return null;

  const groups = groupsFromMembers(db, config, params.scopeId, members, contentDir);
  const nextGroups = applyMoveToGroups(
    groups,
    params.sceneId,
    params.targetGroupId,
    params.targetIndex,
  );

  const orderedSceneIds = flattenGroupRows(nextGroups);
  applySparseOrderRewrite(
    ctx,
    config.typeDatabaseId,
    members.map((member) => ({
      sourceNodeId: member.membershipRelationship.sourceNodeId,
      targetNodeId: member.membershipRelationship.targetNodeId,
      type: member.membershipRelationship.type,
      properties: member.membershipRelationship.properties,
    })),
    orderedSceneIds,
  );

  const currentPartId = resolveScenePartId(
    db,
    config,
    params.sceneId,
    partsForScope(db, config, params.scopeId, contentDir),
  );
  const targetPartId =
    params.targetGroupId === UNASSIGNED_GROUP_ID ? null : params.targetGroupId;

  if (currentPartId !== targetPartId) {
    const existingPartConnections = listRelationshipsForComposite(
      db,
      params.sceneId,
      config.groupCompositeType,
    );
    for (const connection of existingPartConnections) {
      ctx.store.deleteRelationship(
        connection.sourceNodeId,
        connection.targetNodeId,
        connection.type,
      );
    }

    if (targetPartId) {
      const templateProps = existingPartConnections[0]?.properties ?? {};
      const partProps: Properties = {};
      for (const [key, value] of Object.entries(templateProps)) {
        if (key === "ordinal") continue;
        partProps[key] = value;
      }
      ctx.store.upsertRelationship(
        params.sceneId,
        targetPartId,
        groupLinkLocalPerspective(config, contentDir),
        partProps,
      );
    }
  }

  syncAfterRelationshipsWrite(ctx);
  return getOrderedAssociationView(db, configId, params.scopeId, contentDir);
}
