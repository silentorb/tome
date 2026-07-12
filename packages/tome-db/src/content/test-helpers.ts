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
import type { SeedDynamicColumnSetInput, SeedDynamicFieldInput } from "tome-flatfile";
import { invalidateDynamicFieldsCache } from "./sync";
import { invalidateViewsCache } from "tome-flatfile";
import { invalidateWorkspaceCache } from "tome-flatfile";
import { invalidateOrderedCollectionsCache } from "tome-flatfile";
import {
  serializeOrderedCollectionsFile,
  type OrderedCollectionsFile,
  ORDERED_COLLECTIONS_FILE_VERSION,
} from "tome-flatfile";
import { openContentGraph } from "./sync";
import type { TomeWriteContext } from "./write-context";
import {
  emptyAssociationsFile,
  registerBidirectionalType,
  registerSetAssociation,
  serializeAssociationsFile,
} from "tome-flatfile";
import { invalidateAssociationsCache } from "tome-flatfile";
import { normalizeRelationshipType } from "tome-flatfile";
import {
  serializeWorkspaceFile,
  type WorkspaceFile,
  WORKSPACE_FILE_VERSION,
} from "tome-flatfile";
import {
  contentModelDir,
  nodeFilePath,
  orderedCollectionsFilePath,
  associationsFilePath,
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

export function defaultTestOrderedCollectionsFile(): OrderedCollectionsFile {
  return {
    version: ORDERED_COLLECTIONS_FILE_VERSION,
    configs: [
      {
        id: "scenes-by-book",
        typeDatabaseId: "0000000000000000000000000D",
        scopeCompositeType: "scenes_product",
        groupCompositeType: "scenes_part",
        partProductCompositeType: "products_parts_database",
        groupTypeDatabaseId: "0000000000000000000000000Z",
        unassignedGroupTitle: "Unassigned",
        columnViewName: "TWOLD Active",
        excludedColumnKeys: ["order", "product", "part", "status"],
      },
    ],
  };
}

export function seedDefaultAssociations(fixture: TestContentFixture): void {
  const registry = fixture.ctx.store.readAssociationsFile();
  registerSetAssociation(registry, {
    id: "member_of",
    perspectives: ["members", "member_of"],
  });
  registerSetAssociation(registry, {
    id: "ordered_member_of",
    perspectives: ["ordered_members", "ordered_member_of"],
    ordered: true,
  });
  fixture.ctx.store.writeAssociationsFile(registry);
}

/** Write explicit set associations into an ad-hoc content dir (non-fixture tests). */
export function writeTestSetAssociations(contentDir: string): void {
  const registry = emptyAssociationsFile();
  registerSetAssociation(registry, {
    id: "member_of",
    perspectives: ["members", "member_of"],
  });
  registerSetAssociation(registry, {
    id: "ordered_member_of",
    perspectives: ["ordered_members", "ordered_member_of"],
    ordered: true,
  });
  mkdirSync(contentModelDir(contentDir), { recursive: true });
  writeFileSync(
    associationsFilePath(contentDir),
    serializeAssociationsFile(registry),
    "utf-8",
  );
  invalidateAssociationsCache();
}

export function seedDefaultOrderedCollectionTableSchemas(fixture: TestContentFixture): void {
  const scenesDb = "0000000000000000000000000D";
  const partsDb = "0000000000000000000000000Z";
  const productsDb = "0000000000000000000000000S";
  const file = fixture.ctx.store.readTableSchemasFile();
  file.tables[scenesDb] = { columns: [] };
  file.tables[partsDb] = { columns: [] };
  file.tables[productsDb] = { columns: [] };
  fixture.ctx.store.writeTableSchemasFile(file);
  invalidateTableSchemasCache();

  const views = fixture.ctx.store.readViewsFile();
  const orderedSetViews = [scenesDb, partsDb, productsDb].map((nodeId) => ({
    nodeId,
    perspective: "ordered_members",
    generator: "scenes-by-book",
  }));
  const otherViews = views.views.filter(
    (view) => !orderedSetViews.some((entry) => entry.nodeId === view.nodeId),
  );
  fixture.ctx.store.writeViewsFile({
    version: views.version || VIEWS_FILE_VERSION,
    views: [...otherViews, ...orderedSetViews],
  });
  invalidateViewsCache();
}

export function seedTestOrderedCollections(
  fixture: TestContentFixture,
  overrides?: Partial<OrderedCollectionsFile>,
): void {
  const file = { ...defaultTestOrderedCollectionsFile(), ...overrides };
  mkdirSync(contentModelDir(fixture.ctx.store.contentDir), { recursive: true });
  writeFileSync(
    orderedCollectionsFilePath(fixture.ctx.store.contentDir),
    serializeOrderedCollectionsFile(file),
    "utf-8",
  );
  invalidateOrderedCollectionsCache();
}

export function createTestContentFixture(prefix = "tome-content-test-"): TestContentFixture {
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
  const ctx = openContentGraph(contentDir, dbPath);
  const fixture: TestContentFixture = { tempDir, ctx };
  ctx.store.writeDynamicFieldsFile(fileFromSeedInputs([], []));
  invalidateDynamicFieldsCache();
  seedDefaultAssociations(fixture);
  seedDefaultOrderedCollectionTableSchemas(fixture);
  seedTestOrderedCollections(fixture);
  return fixture;
}

export function destroyTestContentFixture(fixture: TestContentFixture): void {
  fixture.ctx.cache.close();
  try {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

export function seedTestNode(fixture: TestContentFixture, node: Node, body?: string): void {
  const markdownBody = body ?? bodyFromNode(node);
  const { body: _b, ...properties } = node.properties;
  const path = nodeFilePath(fixture.ctx.store.contentDir, node.id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    serializeNodeFile({ id: node.id, properties }, markdownBody),
    "utf-8",
  );
  fixture.ctx.sync.syncNode(node.id);
}

export function seedTestDynamicFields(
  fixture: TestContentFixture,
  fields: SeedDynamicFieldInput[],
  columnSets: SeedDynamicColumnSetInput[] = [],
): void {
  fixture.ctx.store.writeDynamicFieldsFile(fileFromSeedInputs(fields, columnSets));
  invalidateDynamicFieldsCache();
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

function entryFromSeedConnection(connection: {
  source: string;
  target: string;
  type: string;
  properties?: Properties;
}): RelationshipEntry {
  if (connection.type === "member_of" || connection.type === "ordered_member_of") {
    return {
      a: connection.target,
      b: connection.source,
      type: connection.type,
      properties: connection.properties ?? {},
    };
  }
  return entryFromRelationship({
    id: relationshipId(connection.source, connection.type, connection.target),
    sourceNodeId: connection.source,
    targetNodeId: connection.target,
    type: connection.type,
    properties: connection.properties ?? {},
  });
}

export function seedTestIncludes(
  fixture: TestContentFixture,
  connections: Array<{
    a: string;
    b: string;
    compositeType: string;
    properties?: Properties;
  }>,
  options?: { replace?: boolean },
): void {
  const registry = options?.replace
    ? { version: 1 as const, associations: {} as Record<string, never> }
    : fixture.ctx.store.readAssociationsFile();
  const file = options?.replace
    ? { version: RELATIONSHIPS_FILE_VERSION, relationships: [] as RelationshipEntry[] }
    : fixture.ctx.store.readRelationshipsFile();

  for (const connection of connections) {
    const compositeType = normalizeRelationshipType(connection.compositeType);
    if (!registry.associations[compositeType]) {
      registerBidirectionalType(registry, compositeType, compositeType);
    }
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

  fixture.ctx.store.writeAssociationsFile(registry);
  fixture.ctx.store.writeRelationshipsFile(file);
  fixture.ctx.sync.syncRelationships();
}

/**
 * Seed composite relationships as ordered tuples. Node `a` occupies tuple index 0
 * (projecting `typeFromA`); node `b` occupies index 1 (projecting `typeFromB`).
 * Direction is carried by this authored order alone — there is no directedFrom.
 */
export function seedTestCompositeRelationships(
  fixture: TestContentFixture,
  connections: Array<{
    a: string;
    b: string;
    typeFromA: string;
    typeFromB: string;
    properties?: Properties;
  }>,
  options?: { replace?: boolean },
): void {
  const registry = options?.replace
    ? { version: 1 as const, associations: {} as Record<string, never> }
    : fixture.ctx.store.readAssociationsFile();
  const file = options?.replace
    ? { version: RELATIONSHIPS_FILE_VERSION, relationships: [] as RelationshipEntry[] }
    : fixture.ctx.store.readRelationshipsFile();

  for (const connection of connections) {
    const compositeType = registerBidirectionalType(
      registry,
      connection.typeFromA,
      connection.typeFromB,
    );
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

  fixture.ctx.store.writeAssociationsFile(registry);
  fixture.ctx.store.writeRelationshipsFile(file);
  fixture.ctx.sync.syncRelationships();
}

export function seedTestRelationships(
  fixture: TestContentFixture,
  connections: Array<{
    source: string;
    target: string;
    type: string;
    properties?: Properties;
  }>,
  options?: { replace?: boolean },
): void {
  const registry = options?.replace
    ? { version: 1 as const, associations: {} as Record<string, never> }
    : fixture.ctx.store.readAssociationsFile();
  const file = options?.replace
    ? { version: RELATIONSHIPS_FILE_VERSION, relationships: [] as RelationshipEntry[] }
    : fixture.ctx.store.readRelationshipsFile();

  for (const connection of connections) {
    if (connection.type === "member_of") {
      registerSetAssociation(registry, {
        id: "member_of",
        perspectives: ["members", "member_of"],
      });
    } else if (connection.type === "ordered_member_of") {
      registerSetAssociation(registry, {
        id: "ordered_member_of",
        perspectives: ["ordered_members", "ordered_member_of"],
        ordered: true,
      });
    } else {
      const composite = normalizeRelationshipType(connection.type);
      if (!registry.associations[composite]) {
        registerBidirectionalType(registry, composite, composite);
      }
    }
    const entry = entryFromSeedConnection(connection);
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

  fixture.ctx.store.writeAssociationsFile(registry);
  fixture.ctx.store.writeRelationshipsFile(file);
  fixture.ctx.sync.syncRelationships();
}

export { registerBidirectionalType };
