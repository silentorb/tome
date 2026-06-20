/**
 * Validation/migration tooling for Notion export layout — not used by editor runtime.
 */
import type { GraphDatabase, Relationship, Properties } from "./graph";
import { IS_A_TYPE, TYPE_MEMBERSHIP_TYPES } from "./labels";
import { findTypeNodeByTitle, isTypeTableNode } from "./node-capabilities";
import { legacyExportPathPrefix } from "./workspace/resolve";

/** Node properties that are not database row scalars. */
export const NODE_META_KEYS = new Set(["title", "body", "alias"]);

export interface MissingTypeMembership {
  nodeId: string;
  title: string;
  path: string;
  expectedDatabaseId: string;
  expectedDatabaseTitle: string;
}

export interface NodeScalarOnTypedNode {
  nodeId: string;
  title: string;
  path: string;
  databaseId: string;
  scalarKeys: string[];
}

export interface SpuriousTypeMembership {
  nodeId: string;
  title: string;
  path: string;
  expectedDatabaseId: string;
  expectedDatabaseTitle: string;
  spuriousDatabaseId: string;
  spuriousDatabaseTitle: string;
  connectionLabel: string;
}

export interface NestedPageSpuriousMembership {
  nodeId: string;
  title: string;
  pageExport: string;
  databaseId: string;
  databaseTitle: string;
  connectionLabel: string;
  reason: "outside_instance_root" | "nested_sub_page";
}

/** Matches Notion database CSV basename: `{DisplayName} {32hex-id}[_all].csv`. */
const CSV_BASENAME =
  /^(.+?)\s+([a-f0-9]{32})((?:_all(?:_[0-9]+)?)?)\.csv$/i;

function titleFromProperties(properties: Record<string, unknown>): string {
  const title = properties.title;
  if (typeof title === "string" && title.trim()) return title.trim();
  return "Untitled";
}

function stringProperty(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/** First folder segment after `{exportPathPrefix}/` (e.g. `{prefix}/Features/Community` → `Features`). */
export function typeFolderFromPath(
  path: string | null | undefined,
  exportPathPrefix: string = legacyExportPathPrefix(),
): string | null {
  if (!path || typeof path !== "string") return null;
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2 || segments[0] !== exportPathPrefix) return null;
  return segments[1]!;
}

/**
 * Deepest path segment after `{exportPathPrefix}/` that matches a NotionDatabase title.
 * e.g. `{prefix}/Inspirations/Traversal reasons` → `Traversal reasons`, not `Inspirations`.
 */
export function typeDatabaseTitleFromPath(
  db: GraphDatabase,
  path: string | null | undefined,
  exportPathPrefix: string = legacyExportPathPrefix(),
): string | null {
  if (!path || typeof path !== "string") return null;
  const segments = path.split("/").filter(Boolean);
  if (segments.length < 2 || segments[0] !== exportPathPrefix) return null;

  let match: string | null = null;
  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i]!;
    if (findTypeNodeByTitle(db, segment)) match = segment;
  }
  return match;
}

export function expectedTypeDatabaseForPage(
  _db: GraphDatabase,
  _nodeId: string,
): { databaseId: string; databaseTitle: string; path: string } | null {
  return null;
}

/** Strip export archive prefix so paths compare as `{exportPathPrefix}/...`. */
export function notionPathFromSourceExport(sourceExport: string): string | null {
  if (!sourceExport.trim()) return null;
  const zipIdx = sourceExport.indexOf(".zip/");
  const path = zipIdx >= 0 ? sourceExport.slice(zipIdx + 5) : sourceExport;
  return path.trim() || null;
}

/**
 * Instance folder for CSV-imported rows: `dirname(csv) + "/" + displayName + "/"`.
 * e.g. `{prefix}/Features {id}_all.csv` → `{prefix}/Features/`.
 */
export function instanceRootFromTypeTableExport(sourceExport: string): string | null {
  const path = notionPathFromSourceExport(sourceExport);
  if (!path) return null;
  const slash = path.lastIndexOf("/");
  const basename = slash >= 0 ? path.slice(slash + 1) : path;
  const parsed = CSV_BASENAME.exec(basename);
  if (!parsed) return null;
  const displayName = parsed[1]!.trim();
  const dir = slash >= 0 ? path.slice(0, slash) : "";
  return dir ? `${dir}/${displayName}/` : `${displayName}/`;
}

/**
 * Folder segments between `instanceRoot` and the page filename (0 = direct CSV row page).
 * Returns null when the page path is outside `instanceRoot` or not a `.md` export.
 */
export function folderDepthUnderInstanceRoot(
  pageExport: string,
  instanceRoot: string,
): number | null {
  const path = notionPathFromSourceExport(pageExport);
  if (!path || !path.toLowerCase().endsWith(".md")) return null;
  if (!path.startsWith(instanceRoot)) return null;
  const relative = path.slice(instanceRoot.length);
  const segments = relative.split("/").filter(Boolean);
  if (segments.length === 0) return null;
  return segments.length - 1;
}

export function isNestedPageSpuriousTypeMembership(
  pageExport: string | null | undefined,
  databaseSourceExport: string | null | undefined,
): { spurious: boolean; reason?: NestedPageSpuriousMembership["reason"] } {
  if (!pageExport || typeof pageExport !== "string") {
    return { spurious: false };
  }
  const instanceRoot = databaseSourceExport
    ? instanceRootFromTypeTableExport(databaseSourceExport)
    : null;
  if (!instanceRoot) return { spurious: false };

  const path = notionPathFromSourceExport(pageExport);
  if (!path || !path.toLowerCase().endsWith(".md")) {
    return { spurious: false };
  }
  if (!path.startsWith(instanceRoot)) {
    return { spurious: true, reason: "outside_instance_root" };
  }
  const depth = folderDepthUnderInstanceRoot(pageExport, instanceRoot);
  if (depth === null) return { spurious: false };
  if (depth > 0) return { spurious: true, reason: "nested_sub_page" };
  return { spurious: false };
}

/** Spurious `is_a` edges on nested sub-pages (export-path heuristic; no-op when provenance stripped). */
export function findNestedPageSpuriousTypeMembership(
  db: GraphDatabase,
  contentDir?: string,
): NestedPageSpuriousMembership[] {
  const spurious: NestedPageSpuriousMembership[] = [];

  for (const summary of db.listNodesForGraphExport()) {
    if (!isTypeTableNode(db, summary.id, contentDir)) continue;

    const database = db.getNode(summary.id);
    if (!database) continue;

    const databaseId = summary.id;
    const databaseTitle = titleFromProperties(database.properties);
    const databaseExport = stringProperty(database.properties.source_export);
    const instanceRoot = databaseExport
      ? instanceRootFromTypeTableExport(databaseExport)
      : null;
    if (!instanceRoot) continue;

    for (const label of TYPE_MEMBERSHIP_TYPES) {
      for (const connection of db.listRelationshipsToTarget(databaseId, label)) {
        const pageId = connection.sourceNodeId;
        if (isTypeTableNode(db, pageId, contentDir)) continue;

        const page = db.getNode(pageId);
        if (!page) continue;

        const pageExport = stringProperty(page.properties.source_export);
        const check = isNestedPageSpuriousTypeMembership(pageExport, databaseExport);
        if (!check.spurious || !check.reason) continue;

        spurious.push({
          nodeId: pageId,
          title: titleFromProperties(page.properties),
          pageExport: pageExport ?? "",
          databaseId,
          databaseTitle,
          connectionLabel: label,
          reason: check.reason,
        });
      }
    }
  }

  return spurious.sort((a, b) => {
    const byDb = a.databaseTitle.localeCompare(b.databaseTitle, undefined, {
      sensitivity: "base",
    });
    if (byDb !== 0) return byDb;
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });
}

export function findTypeMembershipRelationship(
  db: GraphDatabase,
  nodeId: string,
  databaseId: string,
): Relationship | null {
  for (const label of TYPE_MEMBERSHIP_TYPES) {
    const connection = db
      .listRelationshipsFromSource(nodeId, label)
      .find((c) => c.targetNodeId === databaseId);
    if (connection) return connection;
  }
  return null;
}

export function nodeScalarKeys(properties: Record<string, unknown>): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(properties)) {
    if (NODE_META_KEYS.has(key)) continue;
    if (stringProperty(value) !== null) keys.push(key);
  }
  return keys.sort((a, b) => a.localeCompare(b));
}

export function scalarPropertiesFromNode(
  properties: Record<string, unknown>,
): Record<string, string> {
  const scalars: Record<string, string> = {};
  for (const key of nodeScalarKeys(properties)) {
    const text = stringProperty(properties[key]);
    if (text !== null) scalars[key] = text;
  }
  return scalars;
}

export function findSpuriousTypeMembershipRelationships(db: GraphDatabase): SpuriousTypeMembership[] {
  const spurious: SpuriousTypeMembership[] = [];

  for (const node of db.listNodesForGraphExport()) {
    if (isTypeTableNode(db, node.id)) continue;

    const expected = expectedTypeDatabaseForPage(db, node.id);
    if (!expected) continue;

    for (const label of TYPE_MEMBERSHIP_TYPES) {
      for (const connection of db.listRelationshipsFromSource(node.id, label)) {
        if (connection.targetNodeId === expected.databaseId) continue;

        const spuriousDatabase = db.getNode(connection.targetNodeId);
        const spuriousDatabaseTitle = spuriousDatabase
          ? titleFromProperties(spuriousDatabase.properties)
          : connection.targetNodeId;

        spurious.push({
          nodeId: node.id,
          title: node.title,
          path: expected.path,
          expectedDatabaseId: expected.databaseId,
          expectedDatabaseTitle: expected.databaseTitle,
          spuriousDatabaseId: connection.targetNodeId,
          spuriousDatabaseTitle,
          connectionLabel: label,
        });
      }
    }
  }

  return spurious.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}

export function findMissingTypeMembershipRelationships(db: GraphDatabase): MissingTypeMembership[] {
  const missing: MissingTypeMembership[] = [];

  for (const node of db.listNodesForGraphExport()) {
    if (isTypeTableNode(db, node.id)) continue;

    const expected = expectedTypeDatabaseForPage(db, node.id);
    if (!expected) continue;

    if (findTypeMembershipRelationship(db, node.id, expected.databaseId)) continue;

    missing.push({
      nodeId: node.id,
      title: node.title,
      path: expected.path,
      expectedDatabaseId: expected.databaseId,
      expectedDatabaseTitle: expected.databaseTitle,
    });
  }

  return missing.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}

export function findNodeScalarsOnTypedNodes(db: GraphDatabase): NodeScalarOnTypedNode[] {
  const violations: NodeScalarOnTypedNode[] = [];

  for (const node of db.listNodesForGraphExport()) {
    if (isTypeTableNode(db, node.id)) continue;

    const expected = expectedTypeDatabaseForPage(db, node.id);
    if (!expected) continue;

    if (!findTypeMembershipRelationship(db, node.id, expected.databaseId)) continue;

    const page = db.getNode(node.id);
    if (!page) continue;

    const scalarKeys = nodeScalarKeys(page.properties);
    if (scalarKeys.length === 0) continue;

    violations.push({
      nodeId: node.id,
      title: node.title,
      path: expected.path,
      databaseId: expected.databaseId,
      scalarKeys,
    });
  }

  return violations.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}

export function maxRowIndexForDatabase(db: GraphDatabase, databaseId: string): number {
  let max = -1;
  for (const label of TYPE_MEMBERSHIP_TYPES) {
    for (const connection of db.listRelationshipsToTarget(databaseId, label)) {
      const raw = connection.properties.row_index;
      const index =
        typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
      if (Number.isFinite(index) && index > max) max = index;
    }
  }
  return max;
}

export function mergeNodeScalarsOntoRelationshipProperties(
  connectionProperties: Properties,
  nodeScalars: Record<string, string>,
): Properties {
  const merged: Properties = { ...connectionProperties };
  for (const [key, value] of Object.entries(nodeScalars)) {
    if (merged[key] === undefined) merged[key] = value;
  }
  return merged;
}

export function nodePropertiesWithoutScalars(properties: Properties): Properties {
  const next: Properties = { ...properties };
  for (const key of nodeScalarKeys(properties as Record<string, unknown>)) {
    delete next[key];
  }
  return next;
}

export function setNodeProperties(db: GraphDatabase, nodeId: string, properties: Properties): void {
  db.runExec("UPDATE nodes SET properties = ? WHERE id = ?", JSON.stringify(properties), nodeId);
}

export { IS_A_TYPE };
