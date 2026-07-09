import { isNodeId } from "./paths";
import { normalizeRelationshipType } from "../relation-type";

export const RELATIONSHIP_TYPES_FILE_VERSION = 1;

/** Shorthand title string, or title + optional link-add copy for relation sections. */
export type PerspectiveLabelConfig =
  | string
  | { title: string; linkAdd?: string };

/** Exactly two perspectives: one projection per endpoint (a→b, b→a). Symmetric types repeat the same slug. */
export type PerspectivePair = [string, string];

/** Configured trait entry — `key` names the trait; remaining keys are trait config. */
export interface TraitObjectEntry {
  key: string;
  [configKey: string]: unknown;
}

/** Flag trait (string) or configured trait (object with `key`). */
export type TraitEntry = string | TraitObjectEntry;

export interface RelationshipEndpointConstraint {
  typeId: string;
}

/** Tuple index 0/1 → allowed `is_a` type node id at that endpoint. */
export interface RelationshipTypeEndpoints {
  0: RelationshipEndpointConstraint;
  1: RelationshipEndpointConstraint;
}

export interface RelationshipTypeDefinition {
  /** Local type names projected from each endpoint. Always a pair — every relationship is bidirectional. */
  perspectives: PerspectivePair;
  /** UI labels keyed by perspective slug (e.g. member_of → "Membership"). */
  perspectiveLabels?: Record<string, PerspectiveLabelConfig>;
  /** Cross-cutting capabilities (array interpreted as a set). */
  traits?: TraitEntry[];
  /** Optional endpoint type constraints (replaces schema.json relationship rules). */
  endpoints?: RelationshipTypeEndpoints;
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

function parseTraitObjectEntry(raw: unknown, context: string): TraitObjectEntry {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`relationship-types.json: ${context} must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.key !== "string" || !obj.key.trim()) {
    throw new Error(`relationship-types.json: ${context}.key must be a non-empty string`);
  }
  const key = normalizeRelationshipType(obj.key);
  const entry: TraitObjectEntry = { key };
  for (const [prop, value] of Object.entries(obj)) {
    if (prop === "key") continue;
    entry[prop] = value;
  }
  return entry;
}

function parseTraitEntry(raw: unknown, context: string): TraitEntry {
  if (typeof raw === "string" && raw.trim()) {
    return normalizeRelationshipType(raw);
  }
  return parseTraitObjectEntry(raw, context);
}

function parseTraits(raw: unknown, typeKey: string): TraitEntry[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new Error(`relationship-types.json: type ${typeKey} traits must be an array`);
  }
  const seen = new Set<string>();
  const traits: TraitEntry[] = [];
  for (let index = 0; index < raw.length; index++) {
    const entry = parseTraitEntry(raw[index], `type ${typeKey} traits[${index}]`);
    const traitKey = typeof entry === "string" ? entry : entry.key;
    if (seen.has(traitKey)) {
      throw new Error(
        `relationship-types.json: type ${typeKey} traits duplicate trait "${traitKey}"`,
      );
    }
    seen.add(traitKey);
    traits.push(entry);
  }
  return traits.length > 0 ? traits : undefined;
}

function traitEntryKey(entry: TraitEntry): string {
  return typeof entry === "string" ? entry : entry.key;
}

function serializeTraitEntry(entry: TraitEntry): TraitEntry {
  if (typeof entry === "string") return entry;
  const { key, ...config } = entry;
  if (Object.keys(config).length === 0) return { key };
  return { key, ...config };
}

function parseEndpointConstraint(
  raw: unknown,
  context: string,
): RelationshipEndpointConstraint {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`relationship-types.json: ${context} must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.typeId !== "string" || !isNodeId(obj.typeId)) {
    throw new Error(`relationship-types.json: ${context}.typeId must be a valid node id`);
  }
  return { typeId: obj.typeId };
}

function parseEndpoints(raw: unknown, typeKey: string): RelationshipTypeEndpoints | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`relationship-types.json: type ${typeKey} endpoints must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const e0 = parseEndpointConstraint(obj["0"], `type ${typeKey} endpoints.0`);
  const e1 = parseEndpointConstraint(obj["1"], `type ${typeKey} endpoints.1`);
  return { 0: e0, 1: e1 };
}

function serializeEndpoints(
  endpoints: RelationshipTypeEndpoints | undefined,
): RelationshipTypeEndpoints | undefined {
  if (!endpoints) return undefined;
  return {
    0: { typeId: endpoints[0].typeId },
    1: { typeId: endpoints[1].typeId },
  };
}

function serializeTraits(traits: TraitEntry[] | undefined): TraitEntry[] | undefined {
  if (!traits || traits.length === 0) return undefined;
  const sorted = [...traits].sort((a, b) => {
    const aObj = typeof a !== "string";
    const bObj = typeof b !== "string";
    if (aObj !== bObj) return aObj ? 1 : -1;
    return traitEntryKey(a).localeCompare(traitEntryKey(b));
  });
  return sorted.map(serializeTraitEntry);
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
    const traits = parseTraits(row.traits, key);
    const endpoints = parseEndpoints(row.endpoints, key);
    types[normalizeRelationshipType(key)] = {
      perspectives: [perspectives[0]!, perspectives[1]!],
      ...(perspectiveLabels ? { perspectiveLabels } : {}),
      ...(traits ? { traits } : {}),
      ...(endpoints ? { endpoints } : {}),
    };
  }

  return { version: obj.version, types };
}

export function serializeRelationshipTypesFile(file: RelationshipTypesFile): string {
  const sortedTypes: Record<string, RelationshipTypeDefinition> = {};
  for (const key of Object.keys(file.types).sort()) {
    const def = file.types[key]!;
    sortedTypes[key] = {
      perspectives: [...def.perspectives],
      ...(def.perspectiveLabels ? { perspectiveLabels: { ...def.perspectiveLabels } } : {}),
      ...(def.traits ? { traits: serializeTraits(def.traits) } : {}),
      ...(def.endpoints ? { endpoints: serializeEndpoints(def.endpoints) } : {}),
    };
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
    ...(def.traits ? { traits: [...def.traits] } : {}),
    ...(def.endpoints ? { endpoints: serializeEndpoints(def.endpoints) } : {}),
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

/** Set membership: parent (set) at index 0, child (member) at index 1. */
export function registerSetMembershipType(file: RelationshipTypesFile): void {
  registerTypeDefinition(file, "member_of", {
    perspectives: ["members", "member_of"],
    traits: ["set"],
  });
}

/** Ordered set membership: parent (set) at index 0, child (member) at index 1. */
export function registerOrderedSetMembershipType(file: RelationshipTypesFile): void {
  registerTypeDefinition(file, "ordered_member_of", {
    perspectives: ["ordered_members", "ordered_member_of"],
    traits: ["set", "ordered"],
  });
}

