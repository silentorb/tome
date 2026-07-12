import { generateNodeId, isNodeId } from "../node-id";
import { normalizeRelationshipType } from "../relation-type";

export const ASSOCIATIONS_FILE_VERSION = 1;

/** Association ids use the same uppercase ULID alphabet as node ids. */
export function isAssociationId(id: string): boolean {
  return isNodeId(id);
}

/** Mint a new association id (ULID). */
export function generateAssociationId(): string {
  return generateNodeId();
}

/**
 * Normalize an association registry key / relationship storage type.
 * Trims only — never lowercases (ULIDs are case-sensitive).
 */
export function normalizeAssociationId(raw: string): string {
  return raw.trim();
}

/** Shorthand title string, or title + optional presentation flags for relation sections. */
export type PerspectiveLabelConfig =
  | string
  | { title: string; linkAdd?: string; linkExisting?: boolean };

/** Exactly two perspectives: one projection per endpoint (a→b, b→a). Symmetric types repeat the same slug. */
export type PerspectivePair = [string, string];

/** Configured trait entry — `key` names the trait; remaining keys are trait config. */
export interface TraitObjectEntry {
  key: string;
  [configKey: string]: unknown;
}

/** Flag trait (string) or configured trait (object with `key`). */
export type TraitEntry = string | TraitObjectEntry;

export interface AssociationEndpointConstraint {
  typeId: string;
}

/** Tuple index 0/1 → allowed `is_a` type node id at that endpoint. */
export interface AssociationEndpoints {
  0: AssociationEndpointConstraint;
  1: AssociationEndpointConstraint;
}

export interface AssociationDefinition {
  /** Local type names projected from each endpoint. Always a pair — every relationship is bidirectional. */
  perspectives: PerspectivePair;
  /** UI labels keyed by perspective slug (e.g. "member_of" → "Membership"). */
  perspectiveLabels?: Record<string, PerspectiveLabelConfig>;
  /** When false, relation sections default to omitting the inline link-existing control. */
  linkExisting?: boolean;
  /** Cross-cutting capabilities (array interpreted as a set). */
  traits?: TraitEntry[];
  /** Optional endpoint type constraints (replaces schema.json relationship rules). */
  endpoints?: AssociationEndpoints;
}

export interface AssociationsFile {
  version: number;
  associations: Record<string, AssociationDefinition>;
}

export function emptyAssociationsFile(): AssociationsFile {
  return { version: ASSOCIATIONS_FILE_VERSION, associations: {} };
}

function parsePerspectiveLabelConfig(
  value: unknown,
  context: string,
): PerspectiveLabelConfig {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`associations.json: ${context} must be a string or object`);
  }
  const row = value as Record<string, unknown>;
  if (typeof row.title !== "string" || !row.title.trim()) {
    throw new Error(`associations.json: ${context}.title must be a non-empty string`);
  }
  const out: { title: string; linkAdd?: string; linkExisting?: boolean } = {
    title: row.title.trim(),
  };
  if (row.linkAdd !== undefined) {
    if (typeof row.linkAdd !== "string" || !row.linkAdd.trim()) {
      throw new Error(`associations.json: ${context}.linkAdd must be a non-empty string`);
    }
    out.linkAdd = row.linkAdd.trim();
  }
  if (row.linkExisting !== undefined) {
    if (typeof row.linkExisting !== "boolean") {
      throw new Error(`associations.json: ${context}.linkExisting must be a boolean`);
    }
    out.linkExisting = row.linkExisting;
  }
  return out;
}

function parseLinkExisting(raw: unknown, context: string): boolean | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "boolean") {
    throw new Error(`associations.json: ${context} must be a boolean`);
  }
  return raw;
}

function parsePerspectiveLabels(
  raw: unknown,
  typeKey: string,
): Record<string, PerspectiveLabelConfig> | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`associations.json: type ${typeKey} perspectiveLabels must be an object`);
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
    throw new Error(`associations.json: ${context} must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.key !== "string" || !obj.key.trim()) {
    throw new Error(`associations.json: ${context}.key must be a non-empty string`);
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
    throw new Error(`associations.json: type ${typeKey} traits must be an array`);
  }
  const seen = new Set<string>();
  const traits: TraitEntry[] = [];
  for (let index = 0; index < raw.length; index++) {
    const entry = parseTraitEntry(raw[index], `type ${typeKey} traits[${index}]`);
    const traitKey = typeof entry === "string" ? entry : entry.key;
    if (seen.has(traitKey)) {
      throw new Error(
        `associations.json: type ${typeKey} traits duplicate trait "${traitKey}"`,
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
): AssociationEndpointConstraint {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`associations.json: ${context} must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.typeId !== "string" || !isNodeId(obj.typeId)) {
    throw new Error(`associations.json: ${context}.typeId must be a valid node id`);
  }
  return { typeId: obj.typeId };
}

function parseEndpoints(raw: unknown, typeKey: string): AssociationEndpoints | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`associations.json: type ${typeKey} endpoints must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const e0 = parseEndpointConstraint(obj["0"], `type ${typeKey} endpoints.0`);
  const e1 = parseEndpointConstraint(obj["1"], `type ${typeKey} endpoints.1`);
  return { 0: e0, 1: e1 };
}

function serializeEndpoints(
  endpoints: AssociationEndpoints | undefined,
): AssociationEndpoints | undefined {
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

export function parseAssociationsFile(raw: string): AssociationsFile {
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("associations.json: root must be an object");
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.version !== "number") {
    throw new Error("associations.json: version is required");
  }
  if (
    !obj.associations ||
    typeof obj.associations !== "object" ||
    Array.isArray(obj.associations)
  ) {
    throw new Error("associations.json: associations must be an object");
  }

  const associations: Record<string, AssociationDefinition> = {};
  for (const [rawKey, value] of Object.entries(obj.associations as Record<string, unknown>)) {
    const key = normalizeAssociationId(rawKey);
    if (!isAssociationId(key)) {
      throw new Error(
        `associations.json: association key "${rawKey}" must be a ULID`,
      );
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`associations.json: type ${key} must be an object`);
    }
    const row = value as Record<string, unknown>;
    if (!Array.isArray(row.perspectives)) {
      throw new Error(`associations.json: type ${key} perspectives must be an array`);
    }
    const perspectives = row.perspectives
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      .map((p) => normalizeRelationshipType(p));
    if (perspectives.length !== 2) {
      throw new Error(
        `associations.json: type ${key} must define exactly two perspectives`,
      );
    }
    const perspectiveLabels = parsePerspectiveLabels(row.perspectiveLabels, key);
    const linkExisting = parseLinkExisting(row.linkExisting, `type ${key}.linkExisting`);
    const traits = parseTraits(row.traits, key);
    const endpoints = parseEndpoints(row.endpoints, key);
    associations[key] = {
      perspectives: [perspectives[0]!, perspectives[1]!],
      ...(perspectiveLabels ? { perspectiveLabels } : {}),
      ...(linkExisting !== undefined ? { linkExisting } : {}),
      ...(traits ? { traits } : {}),
      ...(endpoints ? { endpoints } : {}),
    };
  }

  return { version: obj.version, associations };
}

export function serializeAssociationsFile(file: AssociationsFile): string {
  const sortedAssociations: Record<string, AssociationDefinition> = {};
  for (const key of Object.keys(file.associations).sort()) {
    const def = file.associations[key]!;
    sortedAssociations[key] = {
      perspectives: [...def.perspectives],
      ...(def.perspectiveLabels ? { perspectiveLabels: { ...def.perspectiveLabels } } : {}),
      ...(def.linkExisting !== undefined ? { linkExisting: def.linkExisting } : {}),
      ...(def.traits ? { traits: serializeTraits(def.traits) } : {}),
      ...(def.endpoints ? { endpoints: serializeEndpoints(def.endpoints) } : {}),
    };
  }
  return `${JSON.stringify({ version: file.version, associations: sortedAssociations }, null, 2)}\n`;
}

export function localTypesForComposite(
  registry: AssociationsFile,
  associationId: string,
): string[] {
  const id = normalizeAssociationId(associationId);
  return registry.associations[id]?.perspectives ?? [];
}

export function perspectiveCountForExpansion(
  typeDef: AssociationDefinition | undefined,
  _associationId: string,
): number {
  return typeDef ? 2 : 1;
}

export function isDualPerspectiveType(typeDef: AssociationDefinition | undefined): boolean {
  return typeDef !== undefined;
}

export function isBidirectionalComposite(
  registry: AssociationsFile,
  associationId: string,
): boolean {
  const def = registry.associations[normalizeAssociationId(associationId)];
  return isDualPerspectiveType(def);
}

export class AmbiguousAssociationError extends Error {
  constructor(
    public readonly perspective: string,
    public readonly associationIds: string[],
  ) {
    super(
      `Ambiguous association for perspective "${perspective}": ` +
        `matches ${associationIds.join(", ")}. Pass an explicit association id.`,
    );
    this.name = "AmbiguousAssociationError";
  }
}

export class UnknownPerspectiveError extends Error {
  constructor(public readonly perspective: string) {
    super(
      `No association defines perspective "${perspective}".`,
    );
    this.name = "UnknownPerspectiveError";
  }
}

/**
 * Find the association id for a local perspective.
 * Fails closed when the perspective is missing or shared by multiple associations
 * (unless `otherLocalType` uniquely selects a matching perspective pair).
 */
export function resolveAssociationId(
  registry: AssociationsFile,
  localType: string,
  otherLocalType?: string,
): string {
  const normalized = normalizeRelationshipType(localType);
  const other =
    otherLocalType !== undefined
      ? normalizeRelationshipType(otherLocalType)
      : undefined;

  const matches: string[] = [];
  for (const [associationId, def] of Object.entries(registry.associations)) {
    if (!isDualPerspectiveType(def) || !def.perspectives.includes(normalized)) {
      continue;
    }
    if (other !== undefined) {
      const [p0, p1] = def.perspectives;
      const pairMatch =
        (p0 === normalized && p1 === other) || (p1 === normalized && p0 === other);
      if (!pairMatch) continue;
    }
    matches.push(associationId);
  }

  if (matches.length === 1) return matches[0]!;
  if (matches.length === 0) throw new UnknownPerspectiveError(normalized);
  throw new AmbiguousAssociationError(normalized, matches);
}

export function registerTypeDefinition(
  file: AssociationsFile,
  associationId: string,
  def: AssociationDefinition,
): void {
  const id = normalizeAssociationId(associationId);
  if (!isAssociationId(id)) {
    throw new Error(`Association id must be a ULID, got "${associationId}"`);
  }
  file.associations[id] = {
    perspectives: [
      normalizeRelationshipType(def.perspectives[0]),
      normalizeRelationshipType(def.perspectives[1]),
    ],
    ...(def.perspectiveLabels ? { perspectiveLabels: { ...def.perspectiveLabels } } : {}),
    ...(def.linkExisting !== undefined ? { linkExisting: def.linkExisting } : {}),
    ...(def.traits ? { traits: [...def.traits] } : {}),
    ...(def.endpoints ? { endpoints: serializeEndpoints(def.endpoints) } : {}),
  };
}

/**
 * Register a dual-perspective association. Pass `id` or mint a ULID.
 * Never derives identity from perspective names.
 */
export function registerBidirectionalType(
  file: AssociationsFile,
  typeFromA: string,
  typeFromB: string,
  id?: string,
): string {
  const associationId = id !== undefined ? normalizeAssociationId(id) : generateAssociationId();
  registerTypeDefinition(file, associationId, {
    perspectives: [
      normalizeRelationshipType(typeFromA),
      normalizeRelationshipType(typeFromB),
    ],
  });
  return associationId;
}

/** Register a set-trait association with explicit ULID id and perspectives (tests/projects). */
export function registerSetAssociation(
  file: AssociationsFile,
  options: {
    id: string;
    perspectives: [string, string];
    ordered?: boolean;
  },
): void {
  const traits: TraitEntry[] = options.ordered ? ["set", "ordered"] : ["set"];
  registerTypeDefinition(file, options.id, {
    perspectives: options.perspectives,
    traits,
  });
}

