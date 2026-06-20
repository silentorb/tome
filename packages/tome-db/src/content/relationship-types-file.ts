import { normalizeRelationshipType } from "../relation-type";

export const RELATIONSHIP_TYPES_FILE_VERSION = 1;

export interface RelationshipTypeDefinition {
  bidirectional: boolean;
  /** For bidirectional: [type from a→b, type from b→a] with a < b. For directed: [type]. */
  perspectives: string[];
}

export interface RelationshipTypesFile {
  version: number;
  types: Record<string, RelationshipTypeDefinition>;
}

export function emptyRelationshipTypesFile(): RelationshipTypesFile {
  return { version: RELATIONSHIP_TYPES_FILE_VERSION, types: {} };
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
    if (typeof row.bidirectional !== "boolean") {
      throw new Error(`relationship-types.json: type ${key} bidirectional is required`);
    }
    if (!Array.isArray(row.perspectives)) {
      throw new Error(`relationship-types.json: type ${key} perspectives must be an array`);
    }
    const perspectives = row.perspectives
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      .map((p) => normalizeRelationshipType(p));
    types[normalizeRelationshipType(key)] = {
      bidirectional: row.bidirectional,
      perspectives,
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

export function isBidirectionalComposite(
  registry: RelationshipTypesFile,
  compositeType: string,
): boolean {
  return registry.types[normalizeRelationshipType(compositeType)]?.bidirectional ?? false;
}

/** Find composite storage type for a local perspective between two endpoints. */
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
    if (!def.bidirectional && def.perspectives.includes(normalized)) {
      return composite;
    }
    if (def.bidirectional && def.perspectives.includes(normalized)) {
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
    bidirectional: def.bidirectional,
    perspectives: def.perspectives.map((p) => normalizeRelationshipType(p)),
  };
}

export function registerUnidirectionalType(
  file: RelationshipTypesFile,
  type: string,
): void {
  const normalized = normalizeRelationshipType(type);
  if (!file.types[normalized]) {
    registerTypeDefinition(file, normalized, {
      bidirectional: false,
      perspectives: [normalized],
    });
  }
}

export function registerBidirectionalType(
  file: RelationshipTypesFile,
  typeFromA: string,
  typeFromB: string,
): string {
  const composite = compositeTypeForPerspectives(typeFromA, typeFromB);
  registerTypeDefinition(file, composite, {
    bidirectional: true,
    perspectives: [
      normalizeRelationshipType(typeFromA),
      normalizeRelationshipType(typeFromB),
    ],
  });
  return composite;
}

/** Symmetric association type (both perspectives are `includes`). */
export function registerIncludesType(file: RelationshipTypesFile): void {
  const type = "includes";
  registerTypeDefinition(file, type, {
    bidirectional: true,
    perspectives: [type, type],
  });
}
