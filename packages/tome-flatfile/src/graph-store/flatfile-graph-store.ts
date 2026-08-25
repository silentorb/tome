import { ContentStore } from "../content/store";
import { CompositeStore } from "../content/composite-store";
import { resolveContentPath } from "../content/paths";
import { schemaFilePath } from "../content/paths";
import { serializeSchemaFile } from "../schema-rules/schema-file";
import { writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import {
  loadAssociationsFromContent,
  loadSchemaFromContent,
  loadTableSchemasFromContent,
  loadViewsFromContent,
  loadWorkspaceFromContent,
} from "../index";
import type {
  GraphStoreCapabilities,
  Node,
  Properties,
  Relationship,
  RelationshipRecordRef,
  TomeCorpusInfo,
  TomeGraphStoreBase,
  AssociationsFile,
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

  close(): void {
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

  listNodeIds(): string[] {
    return this.store.listNodeIds();
  }

  getNode(id: string): Node | null {
    return this.store.readNode(id);
  }

  upsertNode(node: Node, body?: string): void {
    this.store.writeNode(node, body);
  }

  mergeNodeProperties(id: string, patch: Properties): boolean {
    return this.store.mergeNodeProperties(id, patch);
  }

  deleteNode(id: string): void {
    this.store.deleteNodeFile(id);
    this.store.removeIncidentRelationships(id);
  }

  getRelationshipRecord(a: string, b: string, type: string): RelationshipRecordRef | null {
    const entry = this.store.findContentEntry(a, b, type);
    if (!entry) return null;
    return {
      a: entry.a,
      b: entry.b,
      type: entry.type,
      properties: entry.properties,
    };
  }

  findRelationshipRecord(a: string, b: string, type: string): Relationship | null {
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

  upsertRelationshipRecord(entry: RelationshipRecordRef): void {
    this.store.upsertRelationship(entry.a, entry.b, entry.type, entry.properties ?? {});
  }

  deleteRelationshipRecord(a: string, b: string, type: string): boolean {
    return this.store.deleteRelationship(a, b, type);
  }

  upsertRelationship(
    source: string,
    target: string,
    projectionType: string,
    properties?: Properties,
  ): void {
    this.store.upsertRelationship(source, target, projectionType, properties);
  }

  deleteRelationship(source: string, target: string, projectionType: string): boolean {
    return this.store.deleteRelationship(source, target, projectionType);
  }

  readAssociations(): AssociationsFile {
    return loadAssociationsFromContent(this.contentDir) as AssociationsFile;
  }

  writeAssociations(file: AssociationsFile): void {
    this.store.writeAssociationsFile(file as Parameters<ContentStore["writeAssociationsFile"]>[0]);
  }

  readSchema(): SchemaFile {
    return loadSchemaFromContent(this.contentDir);
  }

  writeSchema(file: SchemaFile): void {
    atomicWriteSchema(this.contentDir, file);
  }

  readViews(): ViewsFile {
    return loadViewsFromContent(this.contentDir);
  }

  writeViews(file: ViewsFile): void {
    this.store.writeViewsFile(file);
  }

  readTableSchemas(): TableSchemasFile {
    return loadTableSchemasFromContent(this.contentDir);
  }

  writeTableSchemas(file: TableSchemasFile): void {
    this.store.writeTableSchemasFile(file);
  }

  readWorkspace(): WorkspaceFile {
    return loadWorkspaceFromContent(this.contentDir);
  }

  writeWorkspace(file: WorkspaceFile): void {
    this.store.writeWorkspaceFile(file);
  }

  readDynamicProperties(): DynamicPropertiesFile {
    return this.store.readDynamicPropertiesFile() as DynamicPropertiesFile;
  }

  writeDynamicProperties(file: DynamicPropertiesFile): void {
    this.store.writeDynamicPropertiesFile(
      file as Parameters<ContentStore["writeDynamicPropertiesFile"]>[0],
    );
  }

  isNodeArchived(id: string): boolean {
    return this.store.isNodeFileArchived(id);
  }

  forEachRelationshipRecord(
    fn: (entry: RelationshipRecordRef) => void,
    options?: { includeArchived?: boolean },
  ): void {
    for (const entry of this.store.readRelationshipsFile().relationships) {
      fn({
        a: entry.a,
        b: entry.b,
        type: entry.type,
        properties: entry.properties,
      });
    }
    if (options?.includeArchived) {
      for (const entry of this.store.readArchivedRelationships()) {
        fn({
          a: entry.a,
          b: entry.b,
          type: entry.type,
          properties: entry.properties,
        });
      }
    }
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
