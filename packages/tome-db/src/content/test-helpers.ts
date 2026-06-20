import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Node, Properties } from "../graph";
import { bodyFromNode, serializeNodeFile } from "./node-file";
import { fileFromSeedInputs } from "./dynamic-fields-file";
import { serializeViewsFile, type ViewsFile } from "./views-file";
import {
  serializeTableSchemasFile,
  type TableColumnDef,
  type TableSchemasFile,
} from "./table-schemas-file";
import { invalidateTableSchemasCache } from "../table-schemas/load";
import type { SeedDynamicColumnSetInput, SeedDynamicFieldInput } from "../dynamic-fields/overlay";
import { invalidateDynamicFieldsCache } from "./sync";
import { invalidateViewsCache } from "../views/load";
import { invalidateWorkspaceCache } from "../workspace/load";
import { invalidateOrderedAssociationsCache } from "../ordered-associations-config/load";
import {
  serializeOrderedAssociationsFile,
  type OrderedAssociationsFile,
  ORDERED_ASSOCIATIONS_FILE_VERSION,
} from "../ordered-associations-config/ordered-associations-file";
import { openTomeWriteContext, type TomeWriteContext } from "./write-context";
import { writeFileSync } from "node:fs";
import { contentModelDir, nodeFilePath, orderedAssociationsFilePath, workspaceFilePath } from "./paths";
import {
  entryFromRelationship,
  RELATIONSHIPS_FILE_VERSION,
  type RelationshipEntry,
  sortEndpoints,
} from "./relationships-file";
import { relationshipId } from "../graph";
import {
  registerBidirectionalType,
  registerIncludesType,
  registerUnidirectionalType,
} from "./relationship-types-file";
import { INCLUDES_TYPE } from "../includes-relationship";
import {
  serializeWorkspaceFile,
  type WorkspaceFile,
  WORKSPACE_FILE_VERSION,
} from "../workspace/workspace-file";

/** Test workspace ids — match committed content/model/workspace.json. */
export const TEST_HOME_NODE_ID = "13458e628ba28073850dea0edb9acde1";
export const TEST_ARCHIVE_NODE_ID = "0f558a609a56485185beed4d1fd1cd9f";
export const TEST_GRAPH_ANCHOR_NODE_ID = "e028aa0786f5449984a4f497c1d746fa";
export const TEST_STATIC_SITE_HOME_NODE_ID = "5bfc10918fa24207879d68a030927dd3";

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
    sidebar: { links: [] },
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

export function defaultTestOrderedAssociationsFile(): OrderedAssociationsFile {
  return {
    version: ORDERED_ASSOCIATIONS_FILE_VERSION,
    configs: [
      {
        id: "scenes-by-book",
        typeDatabaseId: "204dba198db74611b0b49a98dd53e8f5",
        membershipEdgeType: "is_a",
        orderProperty: "order",
        scopeCompositeType: "scenes_product",
        groupCompositeType: "scenes_part",
        partProductCompositeType: "products_parts_database",
        groupTypeDatabaseId: "5e45eefc69a14f45b988ad1f3c9d1ef5",
        unassignedGroupTitle: "Unassigned",
        columnViewName: "TWOLD Active",
        excludedColumnKeys: ["order", "product", "part", "status"],
        partNumberProperty: "number",
      },
    ],
  };
}

export function seedTestOrderedAssociations(
  fixture: TestContentFixture,
  overrides?: Partial<OrderedAssociationsFile>,
): void {
  const file = { ...defaultTestOrderedAssociationsFile(), ...overrides };
  mkdirSync(contentModelDir(fixture.ctx.store.contentDir), { recursive: true });
  writeFileSync(
    orderedAssociationsFilePath(fixture.ctx.store.contentDir),
    serializeOrderedAssociationsFile(file),
    "utf-8",
  );
  invalidateOrderedAssociationsCache();
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
  const ctx = openTomeWriteContext(contentDir, dbPath);
  const fixture = { tempDir, ctx };
  ctx.store.writeDynamicFieldsFile(fileFromSeedInputs([], []));
  invalidateDynamicFieldsCache();
  seedTestOrderedAssociations(fixture);
  return fixture;
}

export function destroyTestContentFixture(fixture: TestContentFixture): void {
  fixture.ctx.db.close();
  try {
    rmSync(fixture.tempDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

export function seedTestNode(fixture: TestContentFixture, node: Node, body?: string): void {
  const markdownBody = body ?? bodyFromNode(node);
  const { body: _b, ...properties } = node.properties;
  writeFileSync(
    nodeFilePath(fixture.ctx.store.contentDir, node.id),
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
    properties?: Properties;
  }>,
  options?: { replace?: boolean },
): void {
  const registry = options?.replace
    ? { version: 1 as const, types: {} as Record<string, never> }
    : fixture.ctx.store.readRelationshipTypesFile();
  const file = options?.replace
    ? { version: RELATIONSHIPS_FILE_VERSION, relationships: [] as RelationshipEntry[] }
    : fixture.ctx.store.readRelationshipsFile();

  registerIncludesType(registry);

  for (const connection of connections) {
    const { a, b } = sortEndpoints(connection.a, connection.b);
    const entry: RelationshipEntry = {
      a,
      b,
      type: INCLUDES_TYPE,
      properties: connection.properties ?? {},
    };
    const index = file.relationships.findIndex(
      (existing) =>
        existing.a === entry.a && existing.b === entry.b && existing.type === entry.type,
    );
    if (index >= 0) {
      file.relationships[index] = entry;
    } else {
      file.relationships.push(entry);
    }
  }

  fixture.ctx.store.writeRelationshipTypesFile(registry);
  fixture.ctx.store.writeRelationshipsFile(file);
  fixture.ctx.sync.syncRelationships();
}

export function seedTestCompositeRelationships(
  fixture: TestContentFixture,
  connections: Array<{
    a: string;
    b: string;
    typeFromA: string;
    typeFromB: string;
    properties?: Properties;
    directedFrom?: string;
  }>,
  options?: { replace?: boolean },
): void {
  const registry = options?.replace
    ? { version: 1 as const, types: {} as Record<string, never> }
    : fixture.ctx.store.readRelationshipTypesFile();
  const file = options?.replace
    ? { version: RELATIONSHIPS_FILE_VERSION, relationships: [] as RelationshipEntry[] }
    : fixture.ctx.store.readRelationshipsFile();

  for (const connection of connections) {
    const compositeType = registerBidirectionalType(
      registry,
      connection.typeFromA,
      connection.typeFromB,
    );
    const { a, b } = sortEndpoints(connection.a, connection.b);
    const entry: RelationshipEntry = {
      a,
      b,
      type: compositeType,
      properties: connection.properties ?? {},
      directedFrom: connection.directedFrom,
    };
    const index = file.relationships.findIndex(
      (existing) =>
        existing.a === entry.a && existing.b === entry.b && existing.type === entry.type,
    );
    if (index >= 0) {
      file.relationships[index] = entry;
    } else {
      file.relationships.push(entry);
    }
  }

  fixture.ctx.store.writeRelationshipTypesFile(registry);
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
    ? { version: 1 as const, types: {} as Record<string, never> }
    : fixture.ctx.store.readRelationshipTypesFile();
  const file = options?.replace
    ? { version: RELATIONSHIPS_FILE_VERSION, relationships: [] as RelationshipEntry[] }
    : fixture.ctx.store.readRelationshipsFile();

  for (const connection of connections) {
    registerUnidirectionalType(registry, connection.type);
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

  fixture.ctx.store.writeRelationshipTypesFile(registry);
  fixture.ctx.store.writeRelationshipsFile(file);
  fixture.ctx.sync.syncRelationships();
}

export { registerBidirectionalType, registerUnidirectionalType, sortEndpoints };
