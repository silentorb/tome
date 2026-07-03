import { normalizeRelationshipType } from "../relation-type";

export const RELATIONSHIP_TYPES_FILE_VERSION = 1;

/** Shorthand title string, or title + optional link-add copy for relation sections. */
export type PerspectiveLabelConfig =
  | string
  | { title: string; linkAdd?: string };

/** Exactly two perspectives: one projection per endpoint (a→b, b→a). Symmetric types repeat the same slug. */
export type PerspectivePair = [string, string];

export interface RelationshipTypeDefinition {
  /** Local type names projected from each endpoint. Always a pair — every relationship is bidirectional. */
  perspectives: PerspectivePair;
  /** UI labels keyed by perspective slug (e.g. member_of → "Membership"). */
  perspectiveLabels?: Record<string, PerspectiveLabelConfig>;
}

export interface RelationshipTypesFile {
  version: number;
  types: Record<string, RelationshipTypeDefinition>;
}

export function emptyRelationshipTypesFile(): RelationshipTypesFile {
  return { version: RELATIONSHIP_TYPES_FILE_VERSION, types: {} };
}

function parsePerspectiveLabelConfig(
  value: unknown,
  context: string,
): PerspectiveLabelConfig {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`relationship-types.json: ${context} must be a string or object`);
  }
  const row = value as Record<string, unknown>;
  if (typeof row.title !== "string" || !row.title.trim()) {
    throw new Error(`relationship-types.json: ${context}.title must be a non-empty string`);
  }
  const out: { title: string; linkAdd?: string } = { title: row.title.trim() };
  if (row.linkAdd !== undefined) {
    if (typeof row.linkAdd !== "string" || !row.linkAdd.trim()) {
      throw new Error(`relationship-types.json: ${context}.linkAdd must be a non-empty string`);
    }
    out.linkAdd = row.linkAdd.trim();
  }
  return out;
}

function parsePerspectiveLabels(
  raw: unknown,
  typeKey: string,
): Record<string, PerspectiveLabelConfig> | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`relationship-types.json: type ${typeKey} perspectiveLabels must be an object`);
  }
  const labels: Record<string, PerspectiveLabelConfig> = {};
  for (const [perspective, value] of Object.entries(raw as Record<string, unknown>)) {
    const key = normalizeRelationshipType(perspective);
    labels[key] = parsePerspectiveLabelConfig(value, `type ${typeKey} perspectiveLabels.${key}`);
  }
  return Object.keys(labels).length > 0 ? labels : undefined;
}

export function parseRelationshipTypesFile(raw: string): RelationshipTypesFile {
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("relationship-types.json: root must be an object");
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.version !== "number") {
    throw new Error("relationship-types.json: version is required");
  }
  if (!obj.types || typeof obj.types !== "object" || Array.isArray(obj.types)) {
    throw new Error("relationship-types.json: types must be an object");
  }

  const types: Record<string, RelationshipTypeDefinition> = {};
  for (const [key, value] of Object.entries(obj.types as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`relationship-types.json: type ${key} must be an object`);
    }
    const row = value as Record<string, unknown>;
    if (!Array.isArray(row.perspectives)) {
      throw new Error(`relationship-types.json: type ${key} perspectives must be an array`);
    }
    const perspectives = row.perspectives
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      .map((p) => normalizeRelationshipType(p));
    if (perspectives.length !== 2) {
      throw new Error(
        `relationship-types.json: type ${key} must define exactly two perspectives`,
      );
    }
    const perspectiveLabels = parsePerspectiveLabels(row.perspectiveLabels, key);
    types[normalizeRelationshipType(key)] = {
      perspectives: [perspectives[0]!, perspectives[1]!],
      ...(perspectiveLabels ? { perspectiveLabels } : {}),
    };
  }

  return { version: obj.version, types };
}

export function serializeRelationshipTypesFile(file: RelationshipTypesFile): string {
  const sortedTypes: Record<string, RelationshipTypeDefinition> = {};
  for (const key of Object.keys(file.types).sort()) {
    sortedTypes[key] = file.types[key]!;
  }
  return `${JSON.stringify({ version: file.version, types: sortedTypes }, null, 2)}\n`;
}

/** Composite type from two perspective names (reverse lexicographic sort). */
export function compositeTypeForPerspectives(t1: string, t2: string): string {
  const a = normalizeRelationshipType(t1);
  const b = normalizeRelationshipType(t2);
  const [first, second] = [a, b].sort((x, y) => y.localeCompare(x));
  return `${first}_${second}`;
}

export function localTypesForComposite(
  registry: RelationshipTypesFile,
  compositeType: string,
): string[] {
  return registry.types[normalizeRelationshipType(compositeType)]?.perspectives ?? [];
}

export function perspectiveCountForExpansion(
  typeDef: RelationshipTypeDefinition | undefined,
  compositeType: string,
): number {
  return typeDef ? 2 : 1;
}

export function isDualPerspectiveType(typeDef: RelationshipTypeDefinition | undefined): boolean {
  return typeDef !== undefined;
}

export function isBidirectionalComposite(
  registry: RelationshipTypesFile,
  compositeType: string,
): boolean {
  const def = registry.types[normalizeRelationshipType(compositeType)];
  return isDualPerspectiveType(def);
}

/** Find composite storage type for a local perspective (only returns dual-perspective composites). */
export function resolveCompositeType(
  registry: RelationshipTypesFile,
  localType: string,
  otherLocalType?: string,
): string {
  const normalized = normalizeRelationshipType(localType);
  if (otherLocalType !== undefined) {
    return compositeTypeForPerspectives(normalized, otherLocalType);
  }
  for (const [composite, def] of Object.entries(registry.types)) {
    if (isDualPerspectiveType(def) && def.perspectives.includes(normalized)) {
      return composite;
    }
  }
  return normalized;
}

export function registerTypeDefinition(
  file: RelationshipTypesFile,
  compositeType: string,
  def: RelationshipTypeDefinition,
): void {
  file.types[normalizeRelationshipType(compositeType)] = {
    perspectives: [
      normalizeRelationshipType(def.perspectives[0]),
      normalizeRelationshipType(def.perspectives[1]),
    ],
    ...(def.perspectiveLabels ? { perspectiveLabels: { ...def.perspectiveLabels } } : {}),
  };
}

export function registerBidirectionalType(
  file: RelationshipTypesFile,
  typeFromA: string,
  typeFromB: string,
): string {
  const composite = compositeTypeForPerspectives(typeFromA, typeFromB);
  registerTypeDefinition(file, composite, {
    perspectives: [
      normalizeRelationshipType(typeFromA),
      normalizeRelationshipType(typeFromB),
    ],
  });
  return composite;
}

/** Set membership: member→set as member_of, set→member as members. */
export function registerSetMembershipType(file: RelationshipTypesFile): void {
  registerTypeDefinition(file, "member_of", {
    perspectives: ["member_of", "members"],
  });
}

/** Symmetric association type (both perspectives are `includes`). */
export function registerIncludesType(file: RelationshipTypesFile): void {
  const type = "includes";
  registerTypeDefinition(file, type, {
    perspectives: [type, type],
  });
}
