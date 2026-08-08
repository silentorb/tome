import {
  existsSync,
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
  parseRelationshipEntry,
  relationshipRecordId,
  serializeRelationshipEntry,
} from "./relationships-file";
import {
  type AssociationsFile,
  emptyAssociationsFile,
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
  type DynamicPropertiesFile,
  emptyDynamicPropertiesFile,
  parseDynamicPropertiesFile,
  serializeDynamicPropertiesFile,
} from "./dynamic-properties-file";
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
  ASSOCIATIONS_FILENAME,
  DYNAMIC_PROPERTIES_FILENAME,
  SCHEMA_FILENAME,
  VIEWS_FILENAME,
  TABLE_SCHEMAS_FILENAME,
  WORKSPACE_FILENAME,
  TABLE_PRESENTATION_FILENAME,
  EXTENSIONS_FILENAME,
  RELATIONSHIPS_SYNC_MARKER,
  RELATIONSHIP_FILE_PATTERN,
  contentArchiveDir,
  contentDataDir,
  contentModelDir,
  contentNodesArchiveDir,
  contentNodesDir,
  contentRelationshipsArchiveDir,
  contentRelationshipsDir,
  associationsFilePath,
  dynamicPropertiesFilePath,
  viewsFilePath,
  tableSchemasFilePath,
  workspaceFilePath,
  relationshipFilePath,
  isNodeId,
  nodeFilePath,
  NODE_FILE_PATTERN,
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
  if (RELATIONSHIP_FILE_PATTERN.test(base)) return "relationships";
  if (base === ASSOCIATIONS_FILENAME) return "associations";
  if (base === SCHEMA_FILENAME) return "schema";
  if (base === DYNAMIC_PROPERTIES_FILENAME) return "dynamic-properties";
  if (base === VIEWS_FILENAME) return "views";
  if (base === TABLE_SCHEMAS_FILENAME) return "table-schemas";
  if (base === WORKSPACE_FILENAME) return "workspace";
  if (base === TABLE_PRESENTATION_FILENAME) return "table-presentation";
  if (base === EXTENSIONS_FILENAME) return "extensions";
  return "unknown";
}

/** Scan a relationships root (live or archive). */
function scanRelationshipTree(rootDir: string): RelationshipEntry[] {
  const entries: RelationshipEntry[] = [];
  if (!existsSync(rootDir)) return entries;
  for (const shardEntry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!shardEntry.isDirectory()) continue;
    if (!/^[0-9A-F]{2}$/.test(shardEntry.name)) continue;
    const shardDir = resolve(rootDir, shardEntry.name);
    for (const name of readdirSync(shardDir)) {
      if (!RELATIONSHIP_FILE_PATTERN.test(name)) continue;
      const path = resolve(shardDir, name);
      entries.push(parseRelationshipEntry(readFileSync(path, "utf-8"), path));
    }
  }
  return entries;
}

function clearRelationshipTree(rootDir: string): void {
  if (!existsSync(rootDir)) return;
  for (const shardEntry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!shardEntry.isDirectory()) continue;
    if (!/^[0-9A-F]{2}$/.test(shardEntry.name)) continue;
    rmSync(resolve(rootDir, shardEntry.name), { recursive: true, force: true });
  }
}

function listNodeIdsInTree(rootDir: string): string[] {
  const ids: string[] = [];
  if (!existsSync(rootDir)) return ids;
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const shardDir = resolve(rootDir, entry.name);
    for (const name of readdirSync(shardDir)) {
      if (NODE_FILE_PATTERN.test(name)) {
        ids.push(name.slice(0, -3));
      }
    }
  }
  return ids;
}

function writeRelationshipEntryFile(
  contentDir: string,
  entry: RelationshipEntry,
  archived: boolean,
): void {
  const path = relationshipFilePath(contentDir, entry.a, entry.b, entry.type, archived);
  atomicWrite(path, serializeRelationshipEntry(entry));
}

/**
 * Flatfile canonical store. Implements `TomeDataStore` including change notifications.
 */
export class ContentStore implements TomeDataStore {
  /** Content root (`content/`), not `content/data`. */
  readonly contentDir: string;

  private dataWatcher: FSWatcher | null = null;
  private archiveWatcher: FSWatcher | null = null;
  private modelWatcher: FSWatcher | null = null;
  private pending = new Map<string, ReturnType<typeof setTimeout>>();
  private closed = false;
  private readonly listeners = new Set<StoreChangeListener>();
  private readonly onWatchError?: (err: Error) => void;

  constructor(contentDir: string, options?: { onWatchError?: (err: Error) => void }) {
    this.contentDir = contentDir;
    this.onWatchError = options?.onWatchError;
    mkdirSync(contentNodesDir(contentDir), { recursive: true });
    mkdirSync(contentRelationshipsDir(contentDir), { recursive: true });
    mkdirSync(contentNodesArchiveDir(contentDir), { recursive: true });
    mkdirSync(contentRelationshipsArchiveDir(contentDir), { recursive: true });
    mkdirSync(contentModelDir(contentDir), { recursive: true });
  }

  subscribe(listener: StoreChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  startWatching(): void {
    if (this.closed || this.dataWatcher || this.archiveWatcher || this.modelWatcher) return;
    this.dataWatcher = this.watchDir(
      contentDataDir(this.contentDir),
      (name) => this.isRelevantInstanceFile(name),
      { recursive: true },
    );
    this.archiveWatcher = this.watchDir(
      contentArchiveDir(this.contentDir),
      (name) => this.isRelevantInstanceFile(name),
      { recursive: true },
    );
    this.modelWatcher = this.watchDir(contentModelDir(this.contentDir), (name) =>
      this.isRelevantModelFile(name),
    );
  }

  stopWatching(): void {
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    this.dataWatcher?.close();
    this.archiveWatcher?.close();
    this.modelWatcher?.close();
    this.dataWatcher = null;
    this.archiveWatcher = null;
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

  private isRelevantInstanceFile(name: string): boolean {
    const base = basename(name);
    return NODE_FILE_PATTERN.test(base) || RELATIONSHIP_FILE_PATTERN.test(base);
  }

  private isRelevantModelFile(name: string): boolean {
    const base = basename(name);
    return (
      base === ASSOCIATIONS_FILENAME ||
      base === SCHEMA_FILENAME ||
      base === DYNAMIC_PROPERTIES_FILENAME ||
      base === VIEWS_FILENAME ||
      base === TABLE_SCHEMAS_FILENAME ||
      base === WORKSPACE_FILENAME ||
      base === TABLE_PRESENTATION_FILENAME ||
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
        const kind = storeChangeKindForFilename(filename);
        this.emit({
          path: kind === "relationships" ? RELATIONSHIPS_SYNC_MARKER : basename(filename),
          kind,
        });
      }, DEBOUNCE_MS),
    );
  }

  listNodeIds(): string[] {
    try {
      return [
        ...listNodeIdsInTree(contentNodesDir(this.contentDir)),
        ...listNodeIdsInTree(contentNodesArchiveDir(this.contentDir)),
      ];
    } catch {
      return [];
    }
  }

  /** True when the node markdown exists under `archive/nodes/`. */
  isNodeFileArchived(id: string): boolean {
    if (!isNodeId(id)) return false;
    return existsSync(nodeFilePath(this.contentDir, id, true));
  }

  readNode(id: string): Node | null {
    if (!isNodeId(id)) return null;
    for (const archived of [false, true]) {
      const path = nodeFilePath(this.contentDir, id, archived);
      try {
        const raw = readFileSync(path, "utf-8");
        return nodeFromFile(id, raw);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw err;
      }
    }
    return null;
  }

  writeNode(node: Node, body?: string): void {
    const markdownBody = body ?? bodyFromNode(node);
    const { body: _removed, ...rest } = node.properties;
    const toWrite: Node = { ...node, properties: rest };
    const archived = this.isNodeFileArchived(node.id);
    atomicWrite(
      nodeFilePath(this.contentDir, node.id, archived),
      serializeNodeFile(toWrite, markdownBody),
    );
  }

  deleteNodeFile(id: string): void {
    for (const archived of [false, true]) {
      try {
        rmSync(nodeFilePath(this.contentDir, id, archived), { force: true });
      } catch {
        /* ignore */
      }
    }
  }

  /** Move a node markdown file between live and archive trees. */
  moveNodeToArchive(id: string): boolean {
    if (!isNodeId(id)) return false;
    const from = nodeFilePath(this.contentDir, id, false);
    const to = nodeFilePath(this.contentDir, id, true);
    if (!existsSync(from)) return false;
    mkdirSync(dirname(to), { recursive: true });
    if (existsSync(to)) rmSync(to, { force: true });
    renameSync(from, to);
    return true;
  }

  moveNodeFromArchive(id: string): boolean {
    if (!isNodeId(id)) return false;
    const from = nodeFilePath(this.contentDir, id, true);
    const to = nodeFilePath(this.contentDir, id, false);
    if (!existsSync(from)) return false;
    mkdirSync(dirname(to), { recursive: true });
    if (existsSync(to)) rmSync(to, { force: true });
    renameSync(from, to);
    return true;
  }

  /** Live (non-archived) relationships only. */
  readRelationshipsFile(): RelationshipsFile {
    return {
      version: RELATIONSHIPS_FILE_VERSION,
      relationships: scanRelationshipTree(contentRelationshipsDir(this.contentDir)),
    };
  }

  /** Archived relationships under `archive/relationships/`. */
  readArchivedRelationships(): RelationshipEntry[] {
    return scanRelationshipTree(contentRelationshipsArchiveDir(this.contentDir));
  }

  /**
   * Replace the live relationship tree. Does not touch the archive tree.
   * Pass `archivedEntries` to also replace the archive tree in the same call.
   */
  writeRelationshipsFile(
    file: RelationshipsFile,
    options?: { archivedEntries?: readonly RelationshipEntry[] },
  ): void {
    const liveRoot = contentRelationshipsDir(this.contentDir);
    clearRelationshipTree(liveRoot);
    for (const entry of file.relationships) {
      writeRelationshipEntryFile(this.contentDir, entry, false);
    }
    if (options?.archivedEntries) {
      this.writeArchivedRelationships(options.archivedEntries);
    }
  }

  /** Replace the archive relationship tree. */
  writeArchivedRelationships(entries: readonly RelationshipEntry[]): void {
    const archiveRoot = contentRelationshipsArchiveDir(this.contentDir);
    clearRelationshipTree(archiveRoot);
    for (const entry of entries) {
      writeRelationshipEntryFile(this.contentDir, entry, true);
    }
  }

  writeRelationshipEntry(entry: RelationshipEntry, archived = false): void {
    writeRelationshipEntryFile(this.contentDir, entry, archived);
  }

  /** True when the edge file exists under the archive tree (either endpoint order). */
  isRelationshipArchived(a: string, b: string, type: string): boolean {
    return this.findRelationshipPath(a, b, type, true) !== null;
  }

  /**
   * Move a live relationship file into the archive tree.
   * Returns false if not found in the live tree.
   */
  moveRelationshipToArchive(a: string, b: string, type: string): boolean {
    const found = this.findRelationshipPath(a, b, type, false);
    if (!found) return false;
    const dest = relationshipFilePath(this.contentDir, found.a, found.b, found.type, true);
    mkdirSync(dirname(dest), { recursive: true });
    if (existsSync(dest)) rmSync(dest, { force: true });
    renameSync(found.path, dest);
    return true;
  }

  /**
   * Move an archived relationship file back to the live tree.
   * Returns false if not found in the archive tree.
   */
  moveRelationshipFromArchive(a: string, b: string, type: string): boolean {
    const found = this.findRelationshipPath(a, b, type, true);
    if (!found) return false;
    const dest = relationshipFilePath(this.contentDir, found.a, found.b, found.type, false);
    mkdirSync(dirname(dest), { recursive: true });
    if (existsSync(dest)) rmSync(dest, { force: true });
    renameSync(found.path, dest);
    return true;
  }

  private findRelationshipPath(
    a: string,
    b: string,
    type: string,
    archived: boolean,
  ): { path: string; a: string; b: string; type: string } | null {
    const normalized = normalizeAssociationId(type);
    const candidates: Array<[string, string]> = [
      [a, b],
      [b, a],
    ];
    for (const [x, y] of candidates) {
      const path = relationshipFilePath(this.contentDir, x, y, normalized, archived);
      if (existsSync(path)) return { path, a: x, b: y, type: normalized };
    }
    return null;
  }

  private readRelationshipAt(
    a: string,
    b: string,
    type: string,
    archived: boolean,
  ): RelationshipEntry | null {
    const found = this.findRelationshipPath(a, b, type, archived);
    if (!found) return null;
    return parseRelationshipEntry(readFileSync(found.path, "utf-8"), found.path);
  }

  private deleteRelationshipFile(a: string, b: string, type: string): boolean {
    let deleted = false;
    for (const archived of [false, true]) {
      const found = this.findRelationshipPath(a, b, type, archived);
      if (found) {
        rmSync(found.path, { force: true });
        deleted = true;
      }
    }
    return deleted;
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
    const associationId = associationIdFromTypeArg(registry, associationOrProjection);

    if (associationId) {
      const live = this.readRelationshipAt(source, target, associationId, false);
      if (live) return live;
    }

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
    const live = this.readRelationshipsFile().relationships;

    let composite = resolveAssociationIdForLink(
      registry,
      live,
      this.contentDir,
      source,
      target,
      associationOrProjection,
    );

    if (!registry.associations[composite]) {
      throw new LinkResolutionError(associationOrProjection);
    }

    let existing = this.readRelationshipAt(source, target, composite, false);
    if (!existing) {
      for (const entry of live) {
        if (!connectsEndpoints(entry, source, target)) continue;
        if (entryMatchesAssociation(registry, entry, associationOrProjection)) {
          composite = entry.type;
          existing = entry;
          break;
        }
      }
    }

    if (existing) {
      const next: RelationshipEntry = {
        ...existing,
        type: composite,
        properties: { ...(existing.properties ?? {}), ...properties },
      };
      // Keep authored endpoint order from the existing file.
      writeRelationshipEntryFile(this.contentDir, next, false);
      return;
    }

    const { a, b } = orderedEndpointsForAssociation(
      registry,
      composite,
      source,
      target,
      associationOrProjection,
      this.contentDir,
    );
    writeRelationshipEntryFile(
      this.contentDir,
      { a, b, type: composite, properties },
      false,
    );
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
    const live = this.readRelationshipsFile().relationships;

    const composite = resolveAssociationIdForLink(
      registry,
      live,
      this.contentDir,
      source,
      target,
      associationOrProjection,
    );

    let existing = this.readRelationshipAt(source, target, composite, false);
    if (!existing) {
      for (const entry of live) {
        if (!connectsEndpoints(entry, source, target)) continue;
        if (entryMatchesAssociation(registry, entry, associationOrProjection)) {
          existing = entry;
          break;
        }
      }
    }
    if (!existing) return false;

    writeRelationshipEntryFile(
      this.contentDir,
      { ...existing, properties },
      false,
    );
    return true;
  }

  deleteRelationship(source: string, target: string, associationOrProjection: string): boolean {
    const registry = this.readAssociationsFile();
    const associationId = associationIdFromTypeArg(registry, associationOrProjection);

    if (associationId && this.deleteRelationshipFile(source, target, associationId)) {
      return true;
    }

    let deleted = false;
    for (const entry of [
      ...this.readRelationshipsFile().relationships,
      ...this.readArchivedRelationships(),
    ]) {
      if (!connectsEndpoints(entry, source, target)) continue;
      if (!entryMatchesAssociation(registry, entry, associationOrProjection)) continue;
      if (this.deleteRelationshipFile(entry.a, entry.b, entry.type)) deleted = true;
    }
    return deleted;
  }

  removeIncidentRelationships(nodeId: string): void {
    for (const entry of [
      ...this.readRelationshipsFile().relationships,
      ...this.readArchivedRelationships(),
    ]) {
      if (entry.a !== nodeId && entry.b !== nodeId) continue;
      this.deleteRelationshipFile(entry.a, entry.b, entry.type);
    }
  }

  readDynamicPropertiesFile(): DynamicPropertiesFile {
    const path = dynamicPropertiesFilePath(this.contentDir);
    try {
      return parseDynamicPropertiesFile(readFileSync(path, "utf-8"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyDynamicPropertiesFile();
      }
      throw err;
    }
  }

  writeDynamicPropertiesFile(file: DynamicPropertiesFile): void {
    atomicWrite(dynamicPropertiesFilePath(this.contentDir), serializeDynamicPropertiesFile(file));
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
