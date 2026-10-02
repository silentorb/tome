import { ContentStore } from "../content/store";
import { CompositeStore } from "../content/composite-store";
import { resolveContentPath } from "../content/paths";
import { schemaFilePath } from "../content/paths";
import { serializeSchemaFile } from "../schema-rules/schema-file";
import { writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import {
  loadRelationshipTypesFromContent,
  loadSchemaFromContent,
  loadTableSchemasFromContent,
  loadViewsFromContent,
  loadWorkspaceFromContent,
} from "../index";
import { expandRelationshipEntry, toDomainRelationship } from "../relationship-expand";
import type {
  GraphStoreCapabilities,
  Node,
  Properties,
  Relationship,
  RelationshipRecordRef,
  TomeCorpusInfo,
  TomeGraphStoreBase,
  ListRelationshipProjectionsOptions,
  RelationshipTypesFile,
  DynamicPropertiesFile,
  SchemaFile,
  TableSchemasFile,
  ViewsFile,
  WorkspaceFile,
  StoreChangeListener,
} from "tome-graph-interfaces";
import type { TomeCorpusConfig, TomeDataStoreOpenOptions } from "tome-service-interfaces";

export type FlatfileStoreBackend = ContentStore | CompositeStore;

function atomicWriteSchema(contentDir: string, file: SchemaFile): void {
  const path = schemaFilePath(contentDir);
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, serializeSchemaFile(file), "utf-8");
  if (existsSync(path)) {
    renameSync(tempPath, path);
  } else {
    renameSync(tempPath, path);
  }
}

function contentDirForNode(store: FlatfileStoreBackend, nodeId: string): string {
  const corpusId = store.locateNode(nodeId);
  if (!corpusId) return store.contentDir;
  const match = store.listCorpora().find((c) => c.id === corpusId);
  return match?.contentDir ?? store.contentDir;
}

export class FlatfileGraphStore implements TomeGraphStoreBase {
  readonly capabilities: GraphStoreCapabilities = { queryable: false };

  constructor(private readonly store: FlatfileStoreBackend) {}

  /** Underlying flatfile store (ContentStore / CompositeStore) for sync and legacy callers. */
  get backend(): FlatfileStoreBackend {
    return this.store;
  }

  get contentDir(): string {
    return this.store.contentDir;
  }

  async close(): Promise<void> {
    this.store.close();
  }

  subscribe(listener: StoreChangeListener): () => void {
    return this.store.subscribe(listener);
  }

  startWatching(): void {
    this.store.startWatching();
  }

  stopWatching(): void {
    this.store.stopWatching();
  }

  listCorpora(): readonly TomeCorpusInfo[] {
    return this.store.listCorpora().map((c) => ({
      id: c.id,
      contentDir: c.contentDir,
      access: c.access,
      workspace: c.workspace,
    }));
  }

  locateNode(id: string): string | null {
    return this.store.locateNode(id);
  }

  contentDirForNode(nodeId: string): string {
    return contentDirForNode(this.store, nodeId);
  }

  async listNodeIds(): Promise<string[]> {
    return this.store.listNodeIds();
  }

  async getNode(id: string): Promise<Node | null> {
    return this.store.readNode(id);
  }

  async upsertNode(node: Node, body?: string): Promise<void> {
    this.store.writeNode(node, body);
  }

  async upsertNodeToCorpus(corpusId: string, node: Node, body?: string): Promise<void> {
    this.store.writeNodeToCorpus(corpusId, node, body);
  }

  async mergeNodeProperties(id: string, patch: Properties): Promise<boolean> {
    return this.store.mergeNodeProperties(id, patch);
  }

  async deleteNode(id: string): Promise<void> {
    this.store.deleteNodeFile(id);
    this.store.removeIncidentRelationships(id);
  }

  async archiveNodeFile(id: string): Promise<boolean> {
    return this.store.moveNodeToArchive(id);
  }

  async unarchiveNodeFile(id: string): Promise<boolean> {
    return this.store.moveNodeFromArchive(id);
  }

  async getRelationshipRecord(
    a: string,
    b: string,
    type: string,
  ): Promise<RelationshipRecordRef | null> {
    const entry = this.store.findContentEntry(a, b, type);
    if (!entry) return null;
    return {
      a: entry.a,
      b: entry.b,
      type: entry.type,
      properties: entry.properties,
    };
  }

  async findRelationshipRecord(
    a: string,
    b: string,
    type: string,
  ): Promise<Relationship | null> {
    const found = this.store.findRelationship(a, b, type);
    if (!found) return null;
    return {
      id: found.id,
      sourceNodeId: found.sourceNodeId,
      targetNodeId: found.targetNodeId,
      type: found.type,
      properties: found.properties,
      recordId: undefined,
    };
  }

  async upsertRelationshipRecord(entry: RelationshipRecordRef): Promise<void> {
    this.store.upsertRelationship(entry.a, entry.b, entry.type, entry.properties ?? {});
  }

  async deleteRelationshipRecord(a: string, b: string, type: string): Promise<boolean> {
    return this.store.deleteRelationship(a, b, type);
  }

  async upsertRelationship(
    source: string,
    target: string,
    projectionType: string,
    properties?: Properties,
  ): Promise<void> {
    this.store.upsertRelationship(source, target, projectionType, properties);
  }

  async deleteRelationship(
    source: string,
    target: string,
    projectionType: string,
  ): Promise<boolean> {
    return this.store.deleteRelationship(source, target, projectionType);
  }

  async mergeRelationshipProperties(
    source: string,
    target: string,
    projectionType: string,
    patch: Properties,
  ): Promise<void> {
    this.store.mergeRelationshipProperties(source, target, projectionType, patch);
  }

  async replaceRelationshipProperties(
    source: string,
    target: string,
    projectionType: string,
    properties: Properties,
  ): Promise<boolean> {
    return this.store.replaceRelationshipProperties(source, target, projectionType, properties);
  }

  async readRelationshipTypes(): Promise<RelationshipTypesFile> {
    return loadRelationshipTypesFromContent(this.contentDir) as RelationshipTypesFile;
  }

  async writeRelationshipTypes(file: RelationshipTypesFile): Promise<void> {
    this.store.writeRelationshipTypesFile(file as Parameters<ContentStore["writeRelationshipTypesFile"]>[0]);
  }

  async readSchema(): Promise<SchemaFile> {
    return loadSchemaFromContent(this.contentDir);
  }

  async writeSchema(file: SchemaFile): Promise<void> {
    atomicWriteSchema(this.contentDir, file);
  }

  async readViews(): Promise<ViewsFile> {
    return loadViewsFromContent(this.contentDir);
  }

  async writeViews(file: ViewsFile): Promise<void> {
    this.store.writeViewsFile(file);
  }

  async readTableSchemas(): Promise<TableSchemasFile> {
    return loadTableSchemasFromContent(this.contentDir);
  }

  async writeTableSchemas(file: TableSchemasFile): Promise<void> {
    this.store.writeTableSchemasFile(file);
  }

  async readWorkspace(): Promise<WorkspaceFile> {
    return loadWorkspaceFromContent(this.contentDir);
  }

  async writeWorkspace(file: WorkspaceFile): Promise<void> {
    this.store.writeWorkspaceFile(file);
  }

  async writeWorkspaceForCorpus(corpusId: string, file: WorkspaceFile): Promise<void> {
    this.store.writeWorkspaceFileForCorpus(corpusId, file);
  }

  async readDynamicProperties(): Promise<DynamicPropertiesFile> {
    return this.store.readDynamicPropertiesFile() as DynamicPropertiesFile;
  }

  async writeDynamicProperties(file: DynamicPropertiesFile): Promise<void> {
    this.store.writeDynamicPropertiesFile(
      file as Parameters<ContentStore["writeDynamicPropertiesFile"]>[0],
    );
  }

  async isNodeArchived(id: string): Promise<boolean> {
    return this.store.isNodeFileArchived(id);
  }

  async forEachRelationshipRecord(
    fn: (entry: RelationshipRecordRef) => void | Promise<void>,
    options?: { includeArchived?: boolean },
  ): Promise<void> {
    for (const entry of this.store.readRelationshipsFile().relationships) {
      await fn({
        a: entry.a,
        b: entry.b,
        type: entry.type,
        properties: entry.properties,
      });
    }
    if (options?.includeArchived) {
      for (const entry of this.store.readArchivedRelationships()) {
        await fn({
          a: entry.a,
          b: entry.b,
          type: entry.type,
          properties: entry.properties,
        });
      }
    }
  }

  async listRelationshipProjections(
    nodeId: string,
    options?: ListRelationshipProjectionsOptions,
  ): Promise<Relationship[]> {
    const direction = options?.direction ?? "both";
    const projectionType = options?.projectionType;
    const registry = await this.readRelationshipTypes();
    const seen = new Set<string>();
    const results: Relationship[] = [];

    const consider = (entry: { a: string; b: string; type: string; properties?: Properties }) => {
      const { projections } = expandRelationshipEntry(entry, registry);
      for (const row of projections) {
        if (projectionType && row.type !== projectionType) continue;
        const fromMatch = direction !== "to" && row.sourceNodeId === nodeId;
        const toMatch = direction !== "from" && row.targetNodeId === nodeId;
        if (!fromMatch && !toMatch) continue;
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        results.push(toDomainRelationship(row));
      }
    };

    for (const entry of this.store.readRelationshipsFile().relationships) {
      if (entry.a !== nodeId && entry.b !== nodeId) continue;
      consider(entry);
    }
    return results;
  }
}

/** Open a Base-tier flatfile graph store (no SQLite, no executeImp). */
export function openFlatfileGraphStore(
  options?: TomeDataStoreOpenOptions,
): FlatfileGraphStore {
  if (options?.corpora && options.corpora.length > 0) {
    return new FlatfileGraphStore(new CompositeStore(options.corpora as TomeCorpusConfig[]));
  }
  const contentPath = options?.contentPath ?? resolveContentPath();
  return new FlatfileGraphStore(new ContentStore(contentPath));
}
