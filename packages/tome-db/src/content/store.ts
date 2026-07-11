import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import type { Node, Properties } from "../graph";
import { relationshipId } from "../graph";
import { normalizeRelationshipType } from "../relation-type";
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
  type RelationshipTypesFile,
  RELATIONSHIP_TYPES_FILE_VERSION,
  emptyRelationshipTypesFile,
  isBidirectionalComposite,
  localTypesForComposite,
  parseRelationshipTypesFile,
  serializeRelationshipTypesFile,
} from "./relationship-types-file";
import { LinkResolutionError, resolveCompositeTypeForLink } from "./resolve-composite-for-link";

function entryMatchesLocalType(
  registry: RelationshipTypesFile,
  entry: RelationshipEntry,
  localType: string,
): boolean {
  const normalized = normalizeRelationshipType(localType);
  const perspectives = localTypesForComposite(registry, entry.type);
  if (perspectives.includes(normalized)) return true;
  return !isBidirectionalComposite(registry, entry.type) && entry.type === normalized;
}

/**
 * Place `source`/`target` into the tuple so that `source` occupies the position
 * whose registry perspective matches the requested `localType`. When the type is
 * symmetric or `localType` is not a perspective of the composite, `source` stays
 * at index 0. This is the sole authority for a new entry's node order.
 */
function orderedEndpointsForLocalType(
  registry: RelationshipTypesFile,
  composite: string,
  source: string,
  target: string,
  localType: string,
): { a: string; b: string } {
  const normalized = normalizeRelationshipType(localType);
  const [p0, p1] = localTypesForComposite(registry, composite);
  if (p1 === normalized && p0 !== normalized) {
    return { a: target, b: source };
  }
  return { a: source, b: target };
}
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
  contentDataDir,
  contentModelDir,
  relationshipsFilePath,
  relationshipTypesFilePath,
  dynamicFieldsFilePath,
  viewsFilePath,
  tableSchemasFilePath,
  workspaceFilePath,
  isNodeId,
  nodeFilePath,
  NODE_FILE_PATTERN,
  legacyConnectionsFilePath,
} from "./paths";

function atomicWrite(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tempPath, content, "utf-8");
  renameSync(tempPath, filePath);
}

export class ContentStore {
  /** Content root (`content/`), not `content/data`. */
  readonly contentDir: string;

  constructor(contentDir: string) {
    this.contentDir = contentDir;
    mkdirSync(contentDataDir(contentDir), { recursive: true });
    mkdirSync(contentModelDir(contentDir), { recursive: true });
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

  readRelationshipTypesFile(): RelationshipTypesFile {
    const path = relationshipTypesFilePath(this.contentDir);
    try {
      return parseRelationshipTypesFile(readFileSync(path, "utf-8"));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyRelationshipTypesFile();
      }
      throw err;
    }
  }

  writeRelationshipTypesFile(file: RelationshipTypesFile): void {
    atomicWrite(relationshipTypesFilePath(this.contentDir), serializeRelationshipTypesFile(file));
  }

  findContentEntry(
    source: string,
    target: string,
    localType: string,
  ): RelationshipEntry | null {
    const registry = this.readRelationshipTypesFile();
    const normalized = normalizeRelationshipType(localType);

    for (const entry of this.readRelationshipsFile().relationships) {
      if (!connectsEndpoints(entry, source, target)) continue;
      if (entryMatchesLocalType(registry, entry, normalized)) {
        return entry;
      }
    }
    return null;
  }

  findRelationship(source: string, target: string, localType: string) {
    const entry = this.findContentEntry(source, target, localType);
    if (!entry) return null;
    const normalized = normalizeRelationshipType(localType);
    return {
      id: relationshipId(source, normalized, target),
      sourceNodeId: source,
      targetNodeId: target,
      type: normalized,
      properties: entry.properties ?? {},
    };
  }

  upsertRelationship(
    source: string,
    target: string,
    localType: string,
    properties: Properties = {},
  ): void {
    const registry = this.readRelationshipTypesFile();
    const file = this.readRelationshipsFile();
    const normalized = normalizeRelationshipType(localType);

    let composite = resolveCompositeTypeForLink(
      registry,
      file.relationships,
      this.contentDir,
      source,
      target,
      normalized,
    );

    if (!registry.types[composite]) {
      throw new LinkResolutionError(normalized);
    }

    let index = file.relationships.findIndex(
      (e) => connectsEndpoints(e, source, target) && e.type === composite,
    );

    if (index < 0) {
      for (let i = 0; i < file.relationships.length; i++) {
        const entry = file.relationships[i]!;
        if (!connectsEndpoints(entry, source, target)) continue;
        if (entryMatchesLocalType(registry, entry, normalized)) {
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
      const { a, b } = orderedEndpointsForLocalType(
        registry,
        composite,
        source,
        target,
        normalized,
      );
      file.relationships.push({ a, b, type: composite, properties });
    }
    this.writeRelationshipsFile(file);
  }

  mergeRelationshipProperties(
    source: string,
    target: string,
    localType: string,
    patch: Properties,
  ): void {
    const existing = this.findRelationship(source, target, localType);
    if (!existing) {
      this.upsertRelationship(source, target, localType, patch);
      return;
    }
    const merged = { ...existing.properties };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      merged[k] = v;
    }
    this.upsertRelationship(source, target, localType, merged);
  }

  /** Replace relationship properties exactly (supports removing keys). */
  replaceRelationshipProperties(
    source: string,
    target: string,
    localType: string,
    properties: Properties,
  ): boolean {
    const registry = this.readRelationshipTypesFile();
    const file = this.readRelationshipsFile();
    const normalized = normalizeRelationshipType(localType);

    const composite = resolveCompositeTypeForLink(
      registry,
      file.relationships,
      this.contentDir,
      source,
      target,
      normalized,
    );
    let index = file.relationships.findIndex(
      (e) => connectsEndpoints(e, source, target) && e.type === composite,
    );

    if (index < 0) {
      for (let i = 0; i < file.relationships.length; i++) {
        const entry = file.relationships[i]!;
        if (!connectsEndpoints(entry, source, target)) continue;
        if (entryMatchesLocalType(registry, entry, normalized)) {
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

  deleteRelationship(source: string, target: string, localType: string): boolean {
    const registry = this.readRelationshipTypesFile();
    const file = this.readRelationshipsFile();
    const normalized = normalizeRelationshipType(localType);
    const before = file.relationships.length;

    file.relationships = file.relationships.filter((entry) => {
      if (!connectsEndpoints(entry, source, target)) return true;
      return !entryMatchesLocalType(registry, entry, normalized);
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
