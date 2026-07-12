import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  watch,
  writeFileSync,
  type FSWatcher,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { Node, Properties } from "tome-graph-interfaces";
import type {
  StoreChangeEvent,
  StoreChangeKind,
  StoreChangeListener,
  TomeDataStore,
} from "tome-service-interfaces";
import { relationshipId } from "../relationship-id";
import {
  type RelationshipEntry,
  type RelationshipsFile,
  RELATIONSHIPS_FILE_VERSION,
  connectsEndpoints,
  parseRelationshipsFile,
  relationshipRecordId,
  serializeRelationshipsFile,
} from "./relationships-file";
import {
  type AssociationsFile,
  emptyAssociationsFile,
  isAssociationId,
  normalizeAssociationId,
  parseAssociationsFile,
  parseProjectionType,
  projectionTypeForEndpoint,
  serializeAssociationsFile,
} from "./associations-file";
import { LinkResolutionError, resolveAssociationIdForLink } from "./resolve-composite-for-link";
import {
  isSetTraitType,
  setRoleIndices,
} from "../association-traits";
import { collectSetNodeIds } from "../set-nodes";
import {
  type DynamicFieldsFile,
  emptyDynamicFieldsFile,
  parseDynamicFieldsFile,
  serializeDynamicFieldsFile,
} from "./dynamic-fields-file";
import {
  type ViewsFile,
  emptyViewsFile,
  parseViewsFile,
  serializeViewsFile,
} from "./views-file";
import {
  type TableSchemasFile,
  emptyTableSchemasFile,
  parseTableSchemasFile,
  serializeTableSchemasFile,
} from "./table-schemas-file";
import {
  emptyWorkspaceFile,
  parseWorkspaceFile,
  serializeWorkspaceFile,
  type WorkspaceFile,
} from "../workspace/workspace-file";
import { bodyFromNode, nodeFromFile, serializeNodeFile } from "./node-file";
import {
  RELATIONSHIPS_FILENAME,
  ASSOCIATIONS_FILENAME,
  DYNAMIC_FIELDS_FILENAME,
  SCHEMA_FILENAME,
  VIEWS_FILENAME,
  TABLE_SCHEMAS_FILENAME,
  WORKSPACE_FILENAME,
  ORDERED_COLLECTIONS_FILENAME,
  EXTENSIONS_FILENAME,
  contentDataDir,
  contentModelDir,
  relationshipsFilePath,
  associationsFilePath,
  dynamicFieldsFilePath,
  viewsFilePath,
  tableSchemasFilePath,
  workspaceFilePath,
  isNodeId,
  nodeFilePath,
  NODE_FILE_PATTERN,
  legacyConnectionsFilePath,
} from "./paths";

const DEBOUNCE_MS = 200;

function associationIdFromTypeArg(
  registry: AssociationsFile,
  associationOrProjection: string,
): string | null {
  const trimmed = associationOrProjection.trim();
  const parsed = parseProjectionType(trimmed);
  if (parsed) return parsed.associationId;
  const id = normalizeAssociationId(trimmed);
  if (registry.associations[id]) return id;
  return null;
}

function entryMatchesAssociation(
  registry: AssociationsFile,
  entry: RelationshipEntry,
  associationOrProjection: string,
): boolean {
  const associationId = associationIdFromTypeArg(registry, associationOrProjection);
  if (!associationId) return false;
  return normalizeAssociationId(entry.type) === associationId;
}

/**
 * Place `source`/`target` into the tuple so that `source` occupies `sourceIndex`.
 * When omitted, set-trait heuristics place a set node at the parent index;
 * otherwise source stays at index 0.
 */
function orderedEndpointsForAssociation(
  registry: AssociationsFile,
  composite: string,
  source: string,
  target: string,
  associationOrProjection: string,
  contentDir: string,
): { a: string; b: string } {
  const parsed = parseProjectionType(associationOrProjection);
  if (parsed) {
    if (parsed.endpointIndex === 1) return { a: target, b: source };
    return { a: source, b: target };
  }

  const def = registry.associations[normalizeAssociationId(composite)];
  if (def && isSetTraitType(def)) {
    const { parentIndex, childIndex } = setRoleIndices(def);
    const setNodeIds = collectSetNodeIds(contentDir);
    if (setNodeIds.has(source)) {
      return parentIndex === 0
        ? { a: source, b: target }
        : { a: target, b: source };
    }
    if (setNodeIds.has(target)) {
      return childIndex === 0
        ? { a: source, b: target }
        : { a: target, b: source };
    }
  }

  return { a: source, b: target };
}

function projectionTypeForFind(
  registry: AssociationsFile,
  associationOrProjection: string,
  source: string,
  target: string,
  contentDir: string,
): string {
  const parsed = parseProjectionType(associationOrProjection);
  if (parsed) return associationOrProjection.trim();
  const associationId = associationIdFromTypeArg(registry, associationOrProjection);
  if (!associationId) return associationOrProjection.trim();
  const { a } = orderedEndpointsForAssociation(
    registry,
    associationId,
    source,
    target,
    associationOrProjection,
    contentDir,
  );
  return projectionTypeForEndpoint(associationId, a === source ? 0 : 1);
}

function atomicWrite(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, content, "utf-8");
  renameSync(tempPath, filePath);
}

function storeChangeKindForFilename(filename: string): StoreChangeKind {
  const base = basename(filename);
  if (NODE_FILE_PATTERN.test(base)) return "node";
  if (base === RELATIONSHIPS_FILENAME) return "relationships";
  if (base === ASSOCIATIONS_FILENAME) return "associations";
  if (base === SCHEMA_FILENAME) return "schema";
  if (base === DYNAMIC_FIELDS_FILENAME) return "dynamic-fields";
  if (base === VIEWS_FILENAME) return "views";
  if (base === TABLE_SCHEMAS_FILENAME) return "table-schemas";
  if (base === WORKSPACE_FILENAME) return "workspace";
  if (base === ORDERED_COLLECTIONS_FILENAME) return "ordered-collections";
  if (base === EXTENSIONS_FILENAME) return "extensions";
  return "unknown";
}

/**
 * Flatfile canonical store. Implements `TomeDataStore` including change notifications.
 */
export class ContentStore implements TomeDataStore {
  /** Content root (`content/`), not `content/data`. */
  readonly contentDir: string;

  private dataWatcher: FSWatcher | null = null;
  private modelWatcher: FSWatcher | null = null;
  private pending = new Map<string, ReturnType<typeof setTimeout>>();
  private closed = false;
  private readonly listeners = new Set<StoreChangeListener>();
  private readonly onWatchError?: (err: Error) => void;

  constructor(contentDir: string, options?: { onWatchError?: (err: Error) => void }) {
    this.contentDir = contentDir;
    this.onWatchError = options?.onWatchError;
    mkdirSync(contentDataDir(contentDir), { recursive: true });
    mkdirSync(contentModelDir(contentDir), { recursive: true });
  }

  subscribe(listener: StoreChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  startWatching(): void {
    if (this.closed || this.dataWatcher || this.modelWatcher) return;
    this.dataWatcher = this.watchDir(contentDataDir(this.contentDir), (name) => this.isRelevantDataFile(name), {
      recursive: true,
    });
    this.modelWatcher = this.watchDir(contentModelDir(this.contentDir), (name) =>
      this.isRelevantModelFile(name),
    );
  }

  stopWatching(): void {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.dataWatcher?.close();
    this.modelWatcher?.close();
    this.dataWatcher = null;
    this.modelWatcher = null;
  }

  close(): void {
    this.closed = true;
    this.stopWatching();
    this.listeners.clear();
  }

  private emit(event: StoreChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        this.onWatchError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  private watchDir(
    dir: string,
    isRelevant: (name: string) => boolean,
    options?: { recursive?: boolean },
  ): FSWatcher | null {
    try {
      const watcher = watch(dir, { recursive: options?.recursive ?? false }, (event, filename) => {
        if (this.closed || !filename || typeof filename !== "string") return;
        if (!isRelevant(filename)) return;
        this.schedule(filename);
      });
      watcher.on("error", (err) => {
        this.onWatchError?.(err instanceof Error ? err : new Error(String(err)));
      });
      return watcher;
    } catch (err) {
      this.onWatchError?.(err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  }

  private isRelevantDataFile(name: string): boolean {
    const base = basename(name);
    return base === RELATIONSHIPS_FILENAME || NODE_FILE_PATTERN.test(base);
  }

  private isRelevantModelFile(name: string): boolean {
    const base = basename(name);
    return (
      base === ASSOCIATIONS_FILENAME ||
      base === SCHEMA_FILENAME ||
      base === DYNAMIC_FIELDS_FILENAME ||
      base === VIEWS_FILENAME ||
      base === TABLE_SCHEMAS_FILENAME ||
      base === WORKSPACE_FILENAME ||
      base === ORDERED_COLLECTIONS_FILENAME ||
      base === EXTENSIONS_FILENAME
    );
  }

  private schedule(filename: string): void {
    const existing = this.pending.get(filename);
    if (existing) clearTimeout(existing);
    this.pending.set(
      filename,
      setTimeout(() => {
        this.pending.delete(filename);
        if (this.closed) return;
        this.emit({
          path: basename(filename),
          kind: storeChangeKindForFilename(filename),
        });
      }, DEBOUNCE_MS),
    );
  }

  listNodeIds(): string[] {
    try {
      const dataDir = contentDataDir(this.contentDir);
      const ids: string[] = [];
      for (const entry of readdirSync(dataDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const shardDir = resolve(dataDir, entry.name);
        for (const name of readdirSync(shardDir)) {
          if (NODE_FILE_PATTERN.test(name)) {
            ids.push(name.slice(0, -3));
          }
        }
      }
      return ids;
    } catch {
      return [];
    }
  }

  readNode(id: string): Node | null {
    if (!isNodeId(id)) return null;
    const path = nodeFilePath(this.contentDir, id);
    try {
      const raw = readFileSync(path, "utf-8");
      return nodeFromFile(id, raw);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  writeNode(node: Node, body?: string): void {
    const markdownBody = body ?? bodyFromNode(node);
    const { body: _removed, ...rest } = node.properties;
    const toWrite: Node = { ...node, properties: rest };
    atomicWrite(nodeFilePath(this.contentDir, node.id), serializeNodeFile(toWrite, markdownBody));
  }

  deleteNodeFile(id: string): void {
    try {
      rmSync(nodeFilePath(this.contentDir, id), { force: true });
    } catch {
      /* ignore */
    }
  }

  readRelationshipsFile(): RelationshipsFile {
    const path = relationshipsFilePath(this.contentDir);
    try {
      return parseRelationshipsFile(readFileSync(path, "utf-8"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        const legacyFile = legacyConnectionsFilePath(this.contentDir);
        try {
          return parseRelationshipsFile(readFileSync(legacyFile, "utf-8"));
        } catch (legacyErr) {
          if ((legacyErr as NodeJS.ErrnoException).code === "ENOENT") {
            return { version: RELATIONSHIPS_FILE_VERSION, relationships: [] };
          }
          throw legacyErr;
        }
      }
      throw err;
    }
  }

  writeRelationshipsFile(file: RelationshipsFile): void {
    atomicWrite(relationshipsFilePath(this.contentDir), serializeRelationshipsFile(file));
  }

  readAssociationsFile(): AssociationsFile {
    const path = associationsFilePath(this.contentDir);
    try {
      return parseAssociationsFile(readFileSync(path, "utf-8"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyAssociationsFile();
      }
      throw err;
    }
  }

  writeAssociationsFile(file: AssociationsFile): void {
    atomicWrite(associationsFilePath(this.contentDir), serializeAssociationsFile(file));
  }

  findContentEntry(
    source: string,
    target: string,
    associationOrProjection: string,
  ): RelationshipEntry | null {
    const registry = this.readAssociationsFile();

    for (const entry of this.readRelationshipsFile().relationships) {
      if (!connectsEndpoints(entry, source, target)) continue;
      if (entryMatchesAssociation(registry, entry, associationOrProjection)) {
        return entry;
      }
    }
    return null;
  }

  findRelationship(source: string, target: string, associationOrProjection: string) {
    const entry = this.findContentEntry(source, target, associationOrProjection);
    if (!entry) return null;
    const registry = this.readAssociationsFile();
    const type = projectionTypeForFind(
      registry,
      associationOrProjection,
      source,
      target,
      this.contentDir,
    );
    return {
      id: relationshipId(source, type, target),
      sourceNodeId: source,
      targetNodeId: target,
      type,
      properties: entry.properties ?? {},
    };
  }

  upsertRelationship(
    source: string,
    target: string,
    associationOrProjection: string,
    properties: Properties = {},
  ): void {
    const registry = this.readAssociationsFile();
    const file = this.readRelationshipsFile();

    let composite = resolveAssociationIdForLink(
      registry,
      file.relationships,
      this.contentDir,
      source,
      target,
      associationOrProjection,
    );

    if (!registry.associations[composite]) {
      throw new LinkResolutionError(associationOrProjection);
    }

    let index = file.relationships.findIndex(
      (e) => connectsEndpoints(e, source, target) && e.type === composite,
    );

    if (index < 0) {
      for (let i = 0; i < file.relationships.length; i++) {
        const entry = file.relationships[i]!;
        if (!connectsEndpoints(entry, source, target)) continue;
        if (entryMatchesAssociation(registry, entry, associationOrProjection)) {
          composite = entry.type;
          index = i;
          break;
        }
      }
    }

    if (index >= 0) {
      const prev = file.relationships[index]!;
      file.relationships[index] = {
        ...prev,
        type: composite,
        properties: { ...(prev.properties ?? {}), ...properties },
      };
    } else {
      const { a, b } = orderedEndpointsForAssociation(
        registry,
        composite,
        source,
        target,
        associationOrProjection,
        this.contentDir,
      );
      file.relationships.push({ a, b, type: composite, properties });
    }
    this.writeRelationshipsFile(file);
  }

  mergeRelationshipProperties(
    source: string,
    target: string,
    associationOrProjection: string,
    patch: Properties,
  ): void {
    const existing = this.findRelationship(source, target, associationOrProjection);
    if (!existing) {
      this.upsertRelationship(source, target, associationOrProjection, patch);
      return;
    }
    const merged = { ...existing.properties };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      merged[k] = v;
    }
    this.upsertRelationship(source, target, associationOrProjection, merged);
  }

  /** Replace relationship properties exactly (supports removing keys). */
  replaceRelationshipProperties(
    source: string,
    target: string,
    associationOrProjection: string,
    properties: Properties,
  ): boolean {
    const registry = this.readAssociationsFile();
    const file = this.readRelationshipsFile();

    const composite = resolveAssociationIdForLink(
      registry,
      file.relationships,
      this.contentDir,
      source,
      target,
      associationOrProjection,
    );
    let index = file.relationships.findIndex(
      (e) => connectsEndpoints(e, source, target) && e.type === composite,
    );

    if (index < 0) {
      for (let i = 0; i < file.relationships.length; i++) {
        const entry = file.relationships[i]!;
        if (!connectsEndpoints(entry, source, target)) continue;
        if (entryMatchesAssociation(registry, entry, associationOrProjection)) {
          index = i;
          break;
        }
      }
    }

    if (index < 0) return false;

    const prev = file.relationships[index]!;
    file.relationships[index] = {
      ...prev,
      properties,
    };
    this.writeRelationshipsFile(file);
    return true;
  }

  deleteRelationship(source: string, target: string, associationOrProjection: string): boolean {
    const registry = this.readAssociationsFile();
    const file = this.readRelationshipsFile();
    const before = file.relationships.length;

    file.relationships = file.relationships.filter((entry) => {
      if (!connectsEndpoints(entry, source, target)) return true;
      return !entryMatchesAssociation(registry, entry, associationOrProjection);
    });

    if (file.relationships.length === before) return false;
    this.writeRelationshipsFile(file);
    return true;
  }

  removeIncidentRelationships(nodeId: string): void {
    const file = this.readRelationshipsFile();
    file.relationships = file.relationships.filter(
      (c) => c.a !== nodeId && c.b !== nodeId,
    );
    this.writeRelationshipsFile(file);
  }

  readDynamicFieldsFile(): DynamicFieldsFile {
    const path = dynamicFieldsFilePath(this.contentDir);
    try {
      return parseDynamicFieldsFile(readFileSync(path, "utf-8"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyDynamicFieldsFile();
      }
      throw err;
    }
  }

  writeDynamicFieldsFile(file: DynamicFieldsFile): void {
    atomicWrite(dynamicFieldsFilePath(this.contentDir), serializeDynamicFieldsFile(file));
  }

  readViewsFile(): ViewsFile {
    const path = viewsFilePath(this.contentDir);
    try {
      return parseViewsFile(readFileSync(path, "utf-8"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyViewsFile();
      }
      throw err;
    }
  }

  writeViewsFile(file: ViewsFile): void {
    atomicWrite(viewsFilePath(this.contentDir), serializeViewsFile(file));
  }

  readTableSchemasFile(): TableSchemasFile {
    const path = tableSchemasFilePath(this.contentDir);
    try {
      return parseTableSchemasFile(readFileSync(path, "utf-8"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyTableSchemasFile();
      }
      throw err;
    }
  }

  writeTableSchemasFile(file: TableSchemasFile): void {
    atomicWrite(tableSchemasFilePath(this.contentDir), serializeTableSchemasFile(file));
  }

  readWorkspaceFile(): WorkspaceFile {
    const path = workspaceFilePath(this.contentDir);
    try {
      return parseWorkspaceFile(readFileSync(path, "utf-8"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyWorkspaceFile();
      }
      throw err;
    }
  }

  writeWorkspaceFile(file: WorkspaceFile): void {
    atomicWrite(workspaceFilePath(this.contentDir), serializeWorkspaceFile(file));
  }

  mergeNodeProperties(id: string, patch: Properties): boolean {
    const node = this.readNode(id);
    if (!node) return false;
    const merged = { ...node.properties, ...patch };
    const body = bodyFromNode(node);
    delete merged.body;
    this.writeNode({ id, properties: merged }, body);
    return true;
  }
}

export { relationshipRecordId };
