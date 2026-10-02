import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import type { Node, Properties } from "tome-sqlite";
import { bodyFromNode, serializeNodeFile } from "tome-flatfile";
import { fileFromSeedInputs } from "tome-flatfile";
import { type ViewsFile, VIEWS_FILE_VERSION } from "tome-flatfile";
import {
  type TableColumnDef,
  type TableSchemasFile,
} from "tome-flatfile";
import { invalidateTableSchemasCache } from "tome-flatfile";
import type { SeedDynamicColumnSetInput, SeedDynamicPropertyInput } from "tome-flatfile";
import { invalidateDynamicPropertiesCache } from "./sync";
import { invalidateViewsCache } from "tome-flatfile";
import { invalidateWorkspaceCache } from "tome-flatfile";
import type { TablePresentationLayers } from "tome-graph-interfaces";
import { openContentGraph } from "./sync";
import type { TomeWriteContext } from "./write-context";
import {
  emptyRelationshipTypesFile,
  isRelationshipTypeId,
  normalizeRelationshipTypeId,
  perspectiveTitle,
  projectionTypeForEndpoint,
  registerBidirectionalType,
  registerSetRelationshipType,
  serializeRelationshipTypesFile,
} from "tome-flatfile";
import { invalidateRelationshipTypesCache } from "tome-flatfile";
import { normalizeRelationshipType } from "tome-flatfile";
import {
  serializeWorkspaceFile,
  type WorkspaceFile,
  WORKSPACE_FILE_VERSION,
} from "tome-flatfile";
import {
  contentModelDir,
  nodeFilePath,
  relationshipTypesFilePath,
  workspaceFilePath,
} from "tome-flatfile";
import {
  connectsEndpoints,
  entryFromRelationship,
  RELATIONSHIPS_FILE_VERSION,
  type RelationshipEntry,
} from "tome-flatfile";
import { relationshipId } from "tome-sqlite";

/** Test workspace ids — match committed content/model/workspace.json. */
export const TEST_HOME_NODE_ID = "00000000000000000000000005";
export const TEST_ARCHIVE_NODE_ID = "00000000000000000000000002";
export const TEST_GRAPH_ANCHOR_NODE_ID = "0000000000000000000000002V";
export const TEST_STATIC_SITE_HOME_NODE_ID = "0000000000000000000000000Y";

/** Stable ULID association ids for common test set relationship types. */
export const TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID = "000000000000000000000000A1";
export const TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID = "000000000000000000000000A2";
export const TEST_SCENES_PRODUCT_RELATIONSHIP_TYPE_ID = "000000000000000000000000A3";
export const TEST_SCENES_PART_RELATIONSHIP_TYPE_ID = "000000000000000000000000A4";
export const TEST_PRODUCTS_PARTS_RELATIONSHIP_TYPE_ID = "000000000000000000000000A5";
/** Ad-hoc composites used across package tests. */
export const TEST_PARENTS_CHILDREN_ASSOCIATION_ID = "000000000000000000000000B1";
export const TEST_INSPIRATIONS_FEATURES_RELATIONSHIP_TYPE_ID = "000000000000000000000000B2";
export const TEST_INCLUDES_ASSOCIATION_ID = "000000000000000000000000B3";
export const TEST_CHILDREN_CHILDREN_ASSOCIATION_ID = "000000000000000000000000B4";
export const TEST_FEATURES_BIBLE_PASSAGES_ASSOCIATION_ID = "000000000000000000000000B5";
export const TEST_CUSTOM_SET_ASSOCIATION_ID = "000000000000000000000000B6";
export const TEST_SCENES_FEATURES_ASSOCIATION_ID = "000000000000000000000000B7";
export const TEST_SCENES_INSPIRATIONS_ASSOCIATION_ID = "000000000000000000000000B8";
export const TEST_SCENES_CHARACTERS_ASSOCIATION_ID = "000000000000000000000000B9";
export const TEST_SCENES_LOCATION_ASSOCIATION_ID = "000000000000000000000000BA";
export const TEST_SOLUTIONS_SCENES_ASSOCIATION_ID = "000000000000000000000000BB";
export const TEST_STORY_SCALE_INSPIRATIONS_ASSOCIATION_ID = "000000000000000000000000BC";
export const TEST_PROP_TYPE_INSPIRATIONS_ASSOCIATION_ID = "000000000000000000000000BD";
export const TEST_OTHER_PARENTS_CHILDREN_ASSOCIATION_ID = "000000000000000000000000BE";
export const TEST_RELATED_ASSOCIATION_ID = "000000000000000000000000BF";

export interface TestContentFixture {
  tempDir: string;
  ctx: TomeWriteContext;
}

export function defaultTestWorkspaceFile(): WorkspaceFile {
  return {
    version: WORKSPACE_FILE_VERSION,
    homeNodeId: TEST_HOME_NODE_ID,
    archiveNodeId: TEST_ARCHIVE_NODE_ID,
    protectedNodeIds: [TEST_HOME_NODE_ID, TEST_ARCHIVE_NODE_ID],
    graphExplorer: { defaultAnchorNodeId: TEST_GRAPH_ANCHOR_NODE_ID },
    staticSite: { homeNodeId: TEST_STATIC_SITE_HOME_NODE_ID },
    quickLinks: [],
    legacy: { exportPathPrefix: "Marloth", archivePathPrefix: "Marloth/Archive" },
  };
}

export function seedTestWorkspace(
  fixture: TestContentFixture,
  overrides?: Partial<WorkspaceFile>,
): void {
  const file = { ...defaultTestWorkspaceFile(), ...overrides };
  mkdirSync(contentModelDir(fixture.ctx.store.contentDir), { recursive: true });
  writeFileSync(
    workspaceFilePath(fixture.ctx.store.contentDir),
    serializeWorkspaceFile(file),
    "utf-8",
  );
  invalidateWorkspaceCache();
}

export const TEST_SCENES_DATABASE_ID = "0000000000000000000000000D";

export function defaultTestPresentationLayers(): TablePresentationLayers {
  return {
    scope: {
      memberToScopeComposite: TEST_SCENES_PRODUCT_RELATIONSHIP_TYPE_ID,
      excludeColumnKeys: ["product"],
    },
    groups: {
      memberToGroupComposite: TEST_SCENES_PART_RELATIONSHIP_TYPE_ID,
      groupTypeDatabaseId: "0000000000000000000000000Z",
      groupToScopeComposite: TEST_PRODUCTS_PARTS_RELATIONSHIP_TYPE_ID,
      unassignedGroupTitle: "Unassigned",
      excludeColumnKeys: ["part"],
    },
    sequence: {
      excludeColumnKeys: ["order"],
    },
    excludeColumnKeys: ["status"],
  };
}

export function seedDefaultRelationshipTypes(fixture: TestContentFixture): void {
  const registry = fixture.ctx.store.readRelationshipTypesFile();
  registerSetRelationshipType(registry, {
    id: TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
    perspectives: ["Members", "Membership"],
  });
  registerSetRelationshipType(registry, {
    id: TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID,
    perspectives: ["Ordered members", "Ordered membership"],
    ordered: true,
  });
  registerBidirectionalType(registry, "Scenes", "Product", TEST_SCENES_PRODUCT_RELATIONSHIP_TYPE_ID);
  registerBidirectionalType(registry, "Scenes", "Part", TEST_SCENES_PART_RELATIONSHIP_TYPE_ID);
  registerBidirectionalType(
    registry,
    "Products",
    "Parts database",
    TEST_PRODUCTS_PARTS_RELATIONSHIP_TYPE_ID,
  );
  registerBidirectionalType(
    registry,
    "Scenes",
    "Characters",
    TEST_SCENES_CHARACTERS_ASSOCIATION_ID,
  );
  const scenesDb = "0000000000000000000000000D";
  const partsDb = "0000000000000000000000000Z";
  const productsDb = "0000000000000000000000000S";
  registry.relationshipTypes[TEST_SCENES_PRODUCT_RELATIONSHIP_TYPE_ID] = {
    ...registry.relationshipTypes[TEST_SCENES_PRODUCT_RELATIONSHIP_TYPE_ID]!,
    endpoints: {
      0: { typeId: scenesDb },
      1: { typeId: productsDb },
    },
  };
  registry.relationshipTypes[TEST_SCENES_PART_RELATIONSHIP_TYPE_ID] = {
    ...registry.relationshipTypes[TEST_SCENES_PART_RELATIONSHIP_TYPE_ID]!,
    endpoints: {
      0: { typeId: scenesDb },
      1: { typeId: partsDb },
    },
  };
  // Tuple seeds use a=part, b=product — endpoint 0 is the parts host side.
  registry.relationshipTypes[TEST_PRODUCTS_PARTS_RELATIONSHIP_TYPE_ID] = {
    ...registry.relationshipTypes[TEST_PRODUCTS_PARTS_RELATIONSHIP_TYPE_ID]!,
    endpoints: {
      0: { typeId: partsDb },
      1: { typeId: productsDb },
    },
  };
  fixture.ctx.store.writeRelationshipTypesFile(registry);
}

/** Write explicit set relationship types into an ad-hoc content dir (non-fixture tests). */
export function writeTestSetRelationshipTypes(contentDir: string): void {
  const registry = emptyRelationshipTypesFile();
  registerSetRelationshipType(registry, {
    id: TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
    perspectives: ["Members", "Membership"],
  });
  registerSetRelationshipType(registry, {
    id: TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID,
    perspectives: ["Ordered members", "Ordered membership"],
    ordered: true,
  });
  mkdirSync(contentModelDir(contentDir), { recursive: true });
  writeFileSync(
    relationshipTypesFilePath(contentDir),
    serializeRelationshipTypesFile(registry),
    "utf-8",
  );
  invalidateRelationshipTypesCache();
}

export function seedDefaultTablePresentationTableSchemas(fixture: TestContentFixture): void {
  const scenesDb = "0000000000000000000000000D";
  const partsDb = "0000000000000000000000000Z";
  const productsDb = "0000000000000000000000000S";
  const file = fixture.ctx.store.readTableSchemasFile();
  file.tables[scenesDb] = {
    columns: [
      {
        key: "product",
        name: "Product",
        type: "relation",
        association: TEST_SCENES_PRODUCT_RELATIONSHIP_TYPE_ID,
        endpoint: 0,
      },
      {
        key: "part",
        name: "Part",
        type: "relation",
        association: TEST_SCENES_PART_RELATIONSHIP_TYPE_ID,
        endpoint: 0,
      },
    ],
  };
  file.tables[partsDb] = {
    columns: [
      {
        key: "products",
        name: "Products",
        type: "relation",
        association: TEST_PRODUCTS_PARTS_RELATIONSHIP_TYPE_ID,
        endpoint: 0,
      },
    ],
  };
  file.tables[productsDb] = { columns: [] };
  fixture.ctx.store.writeTableSchemasFile(file);
  invalidateTableSchemasCache();

  const views = fixture.ctx.store.readViewsFile();
  const otherViews = views.views.filter((view) => view.nodeId !== scenesDb);
  fixture.ctx.store.writeViewsFile({
    version: views.version || VIEWS_FILE_VERSION,
    views: [
      ...otherViews,
      {
        nodeId: scenesDb,
        association: TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID,
        presentation: defaultTestPresentationLayers(),
      },
    ],
  });
  invalidateViewsCache();
}

export function seedTestTablePresentation(
  fixture: TestContentFixture,
  overrides?: Partial<TablePresentationLayers>,
): void {
  const scenesDb = TEST_SCENES_DATABASE_ID;
  const presentation = { ...defaultTestPresentationLayers(), ...overrides };
  const views = fixture.ctx.store.readViewsFile();
  const otherViews = views.views.filter((view) => view.nodeId !== scenesDb);
  fixture.ctx.store.writeViewsFile({
    version: views.version || VIEWS_FILE_VERSION,
    views: [
      ...otherViews,
      {
        nodeId: scenesDb,
        association: TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID,
        presentation,
      },
    ],
  });
  invalidateViewsCache();
}

export async function createTestContentFixture(prefix = "tome-content-test-"): Promise<TestContentFixture> {
  const tempDir = mkdtempSync(join(tmpdir(), prefix));
  const contentDir = join(tempDir, "content");
  mkdirSync(contentDir, { recursive: true });
  mkdirSync(contentModelDir(contentDir), { recursive: true });
  writeFileSync(
    workspaceFilePath(contentDir),
    serializeWorkspaceFile(defaultTestWorkspaceFile()),
    "utf-8",
  );
  invalidateWorkspaceCache();
  const dbPath = join(tempDir, "test.sqlite");
  const ctx = await openContentGraph(contentDir, dbPath);
  const fixture: TestContentFixture = { tempDir, ctx };
  ctx.store.writeDynamicPropertiesFile(fileFromSeedInputs([], []));
  invalidateDynamicPropertiesCache();
  seedDefaultRelationshipTypes(fixture);
  seedDefaultTablePresentationTableSchemas(fixture);
  seedTestTablePresentation(fixture);
  return fixture;
}

export async function destroyTestContentFixture(fixture: TestContentFixture): Promise<void> {
  await fixture.ctx.cache.close();
  try {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

export async function seedTestNode(fixture: TestContentFixture, node: Node, body?: string): Promise<void> {
  const markdownBody = body ?? bodyFromNode(node);
  const { body: _b, ...properties } = node.properties;
  const path = nodeFilePath(fixture.ctx.store.contentDir, node.id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    serializeNodeFile({ id: node.id, properties }, markdownBody),
    "utf-8",
  );
  await fixture.ctx.sync.syncNode(node.id);
}

export function seedTestDynamicProperties(
  fixture: TestContentFixture,
  fields: SeedDynamicPropertyInput[],
  columnSets: SeedDynamicColumnSetInput[] = [],
): void {
  fixture.ctx.store.writeDynamicPropertiesFile(fileFromSeedInputs(fields, columnSets));
  invalidateDynamicPropertiesCache();
}

export function seedTestViews(fixture: TestContentFixture, file: ViewsFile): void {
  fixture.ctx.store.writeViewsFile(file);
  invalidateViewsCache();
}

export function seedTestTableSchemas(fixture: TestContentFixture, file: TableSchemasFile): void {
  fixture.ctx.store.writeTableSchemasFile(file);
  invalidateTableSchemasCache();
}

export function seedTestTableSchema(
  fixture: TestContentFixture,
  databaseId: string,
  columns: TableColumnDef[],
): void {
  const file = fixture.ctx.store.readTableSchemasFile();
  file.tables[databaseId] = { columns };
  fixture.ctx.store.writeTableSchemasFile(file);
  invalidateTableSchemasCache();
}

function resolveSeedRelationshipTypeId(typeOrId: string): string {
  const trimmed = typeOrId.trim();
  if (trimmed === "member_of" || trimmed === "members") return TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID;
  if (trimmed === "ordered_member_of" || trimmed === "ordered_members") {
    return TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID;
  }
  return normalizeRelationshipTypeId(trimmed);
}

/** Find or mint a symmetric association for matching display labels (test convenience). */
function relationshipTypeIdForPerspectiveSlug(
  registry: ReturnType<typeof emptyRelationshipTypesFile>,
  slug: string,
): string {
  const label = slug.trim();
  for (const [id, def] of Object.entries(registry.relationshipTypes)) {
    if (
      perspectiveTitle(def.perspectives[0]!) === label &&
      perspectiveTitle(def.perspectives[1]!) === label
    ) {
      return id;
    }
  }
  return registerBidirectionalType(registry, label, label, undefined, {
    traits: ["symmetric"],
  });
}

function ensureSeedRelationshipType(
  registry: ReturnType<typeof emptyRelationshipTypesFile>,
  typeOrId: string,
): string {
  const resolved = resolveSeedRelationshipTypeId(typeOrId);
  if (resolved === TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID) {
    registerSetRelationshipType(registry, {
      id: TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID,
      perspectives: ["Members", "Membership"],
    });
    return TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID;
  }
  if (resolved === TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID) {
    registerSetRelationshipType(registry, {
      id: TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID,
      perspectives: ["Ordered members", "Ordered membership"],
      ordered: true,
    });
    return TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID;
  }
  const knownPairs: Record<string, [string, string]> = {
    [TEST_SCENES_PRODUCT_RELATIONSHIP_TYPE_ID]: ["Scenes", "Product"],
    [TEST_SCENES_PART_RELATIONSHIP_TYPE_ID]: ["Scenes", "Part"],
    [TEST_PRODUCTS_PARTS_RELATIONSHIP_TYPE_ID]: ["Products", "Parts database"],
    [TEST_PARENTS_CHILDREN_ASSOCIATION_ID]: ["Children", "Parents"],
    [TEST_INSPIRATIONS_FEATURES_RELATIONSHIP_TYPE_ID]: ["Inspirations", "Features"],
    [TEST_INCLUDES_ASSOCIATION_ID]: ["Includes", "Includes"],
    [TEST_CHILDREN_CHILDREN_ASSOCIATION_ID]: ["Children", "Children"],
    [TEST_FEATURES_BIBLE_PASSAGES_ASSOCIATION_ID]: ["Features", "Bible passages"],
    [TEST_CUSTOM_SET_ASSOCIATION_ID]: ["Custom members", "Custom set"],
    [TEST_SCENES_FEATURES_ASSOCIATION_ID]: ["Scenes", "Features"],
    [TEST_SCENES_INSPIRATIONS_ASSOCIATION_ID]: ["Scenes", "Inspirations"],
    [TEST_SCENES_CHARACTERS_ASSOCIATION_ID]: ["Scenes", "Characters"],
    [TEST_SCENES_LOCATION_ASSOCIATION_ID]: ["Scenes", "Location"],
    [TEST_SOLUTIONS_SCENES_ASSOCIATION_ID]: ["Solutions", "Scenes"],
    [TEST_STORY_SCALE_INSPIRATIONS_ASSOCIATION_ID]: ["Story scale", "Inspirations"],
    [TEST_PROP_TYPE_INSPIRATIONS_ASSOCIATION_ID]: ["Prop type", "Inspirations"],
    [TEST_OTHER_PARENTS_CHILDREN_ASSOCIATION_ID]: ["Children", "Parents"],
    [TEST_RELATED_ASSOCIATION_ID]: ["Related", "Related"],
  };
  const symmetricIds = new Set([
    TEST_INCLUDES_ASSOCIATION_ID,
    TEST_CHILDREN_CHILDREN_ASSOCIATION_ID,
    TEST_RELATED_ASSOCIATION_ID,
  ]);
  if (isRelationshipTypeId(resolved)) {
    if (!registry.relationshipTypes[resolved]) {
      const pair = knownPairs[resolved] ?? ["A", "B"];
      registerBidirectionalType(
        registry,
        pair[0],
        pair[1],
        resolved,
        symmetricIds.has(resolved) ? { traits: ["symmetric"] } : undefined,
      );
    }
    return resolved;
  }
  return relationshipTypeIdForPerspectiveSlug(registry, resolved);
}

function entryFromSeedConnection(connection: {
  source: string;
  target: string;
  type: string;
  properties?: Properties;
}): RelationshipEntry {
  // Caller must pass a resolved ULID association id in `type`.
  const relationshipTypeId = normalizeRelationshipTypeId(connection.type);
  if (
    relationshipTypeId === TEST_MEMBER_OF_RELATIONSHIP_TYPE_ID ||
    relationshipTypeId === TEST_ORDERED_MEMBER_OF_RELATIONSHIP_TYPE_ID
  ) {
    return {
      a: connection.target,
      b: connection.source,
      type: relationshipTypeId,
      properties: connection.properties ?? {},
    };
  }
  return entryFromRelationship({
    id: relationshipId(connection.source, relationshipTypeId, connection.target),
    sourceNodeId: connection.source,
    targetNodeId: connection.target,
    type: relationshipTypeId,
    properties: connection.properties ?? {},
  });
}

export async function seedTestIncludes(
  fixture: TestContentFixture,
  connections: Array<{
    a: string;
    b: string;
    compositeType: string;
    properties?: Properties;
  }>,
  options?: { replace?: boolean },
): Promise<void> {
  const registry = options?.replace
    ? { version: 1 as const, relationshipTypes: {} as Record<string, never> }
    : fixture.ctx.store.readRelationshipTypesFile();
  const file = options?.replace
    ? { version: RELATIONSHIPS_FILE_VERSION, relationships: [] as RelationshipEntry[] }
    : fixture.ctx.store.readRelationshipsFile();

  for (const connection of connections) {
    const compositeType = ensureSeedRelationshipType(registry, connection.compositeType);
    const entry: RelationshipEntry = {
      a: connection.a,
      b: connection.b,
      type: compositeType,
      properties: connection.properties ?? {},
    };
    const index = file.relationships.findIndex(
      (existing) => existing.type === entry.type && connectsEndpoints(existing, entry.a, entry.b),
    );
    if (index >= 0) {
      file.relationships[index] = entry;
    } else {
      file.relationships.push(entry);
    }
  }

  fixture.ctx.store.writeRelationshipTypesFile(registry);
  fixture.ctx.store.writeRelationshipsFile(file);
  await fixture.ctx.sync.syncRelationships();
}

/**
 * Seed composite relationships as ordered tuples. Node `a` occupies tuple index 0
 * (projecting `typeFromA`); node `b` occupies index 1 (projecting `typeFromB`).
 * Direction is carried by this authored order alone — there is no directedFrom.
 * Returns the association id used for each connection (minted when not already registered).
 */
export async function seedTestCompositeRelationships(
  fixture: TestContentFixture,
  connections: Array<{
    a: string;
    b: string;
    typeFromA: string;
    typeFromB: string;
    relationshipTypeId?: string;
    properties?: Properties;
  }>,
  options?: { replace?: boolean },
): Promise<string[]> {
  const registry = options?.replace
    ? { version: 1 as const, relationshipTypes: {} as Record<string, never> }
    : fixture.ctx.store.readRelationshipTypesFile();
  const file = options?.replace
    ? { version: RELATIONSHIPS_FILE_VERSION, relationships: [] as RelationshipEntry[] }
    : fixture.ctx.store.readRelationshipsFile();

  const relationshipTypeIds: string[] = [];
  for (const connection of connections) {
    const p0 = connection.typeFromA.trim();
    const p1 = connection.typeFromB.trim();
    let relationshipTypeId = connection.relationshipTypeId
      ? normalizeRelationshipTypeId(connection.relationshipTypeId)
      : undefined;
    if (!relationshipTypeId) {
      for (const [id, def] of Object.entries(registry.relationshipTypes)) {
        const title0 = perspectiveTitle(def.perspectives[0]!);
        const title1 = perspectiveTitle(def.perspectives[1]!);
        if (
          title0.toLowerCase() === p0.toLowerCase() &&
          title1.toLowerCase() === p1.toLowerCase()
        ) {
          relationshipTypeId = id;
          break;
        }
      }
    }
    if (!relationshipTypeId) {
      relationshipTypeId = registerBidirectionalType(registry, p0, p1);
    } else if (!registry.relationshipTypes[relationshipTypeId]) {
      registerBidirectionalType(registry, p0, p1, relationshipTypeId);
    }
    relationshipTypeIds.push(relationshipTypeId);
    const entry: RelationshipEntry = {
      a: connection.a,
      b: connection.b,
      type: relationshipTypeId,
      properties: connection.properties ?? {},
    };
    const index = file.relationships.findIndex(
      (existing) => existing.type === entry.type && connectsEndpoints(existing, entry.a, entry.b),
    );
    if (index >= 0) {
      file.relationships[index] = entry;
    } else {
      file.relationships.push(entry);
    }
  }

  fixture.ctx.store.writeRelationshipTypesFile(registry);
  fixture.ctx.store.writeRelationshipsFile(file);
  await fixture.ctx.sync.syncRelationships();
  return relationshipTypeIds;
}

export async function seedTestRelationships(
  fixture: TestContentFixture,
  connections: Array<{
    source: string;
    target: string;
    type: string;
    properties?: Properties;
  }>,
  options?: { replace?: boolean },
): Promise<void> {
  const registry = options?.replace
    ? { version: 1 as const, relationshipTypes: {} as Record<string, never> }
    : fixture.ctx.store.readRelationshipTypesFile();
  const file = options?.replace
    ? { version: RELATIONSHIPS_FILE_VERSION, relationships: [] as RelationshipEntry[] }
    : fixture.ctx.store.readRelationshipsFile();

  for (const connection of connections) {
    const relationshipTypeId = ensureSeedRelationshipType(registry, connection.type);
    const entry = entryFromSeedConnection({ ...connection, type: relationshipTypeId });
    const index = file.relationships.findIndex(
      (existing) =>
        existing.a === entry.a &&
        existing.b === entry.b &&
        existing.type === entry.type,
    );
    if (index >= 0) {
      file.relationships[index] = entry;
    } else {
      file.relationships.push(entry);
    }
  }

  fixture.ctx.store.writeRelationshipTypesFile(registry);
  fixture.ctx.store.writeRelationshipsFile(file);
  await fixture.ctx.sync.syncRelationships();
}

export { registerBidirectionalType, projectionTypeForEndpoint };
