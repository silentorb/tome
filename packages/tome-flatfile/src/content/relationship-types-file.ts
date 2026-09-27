import { generateNodeId, isNodeId } from "../node-id";
import { normalizeRelationshipType } from "../relation-type";

export const RELATIONSHIP_TYPES_FILE_VERSION = 1;

/** Relationship type ids use the same uppercase ULID alphabet as node ids. */
export function isRelationshipTypeId(id: string): boolean {
  return isNodeId(id);
}

/** Mint a new relationship type id (ULID). */
export function generateRelationshipTypeId(): string {
  return generateNodeId();
}

/**
 * Normalize a relationship type registry key / relationship storage type.
 * Trims only — never lowercases (ULIDs are case-sensitive).
 */
export function normalizeRelationshipTypeId(raw: string): string {
  return raw.trim();
}

/** Shorthand title string, or title + optional presentation flags for relation sections. */
export type PerspectiveLabelConfig =
  | string
  | { title: string; linkAdd?: string; linkExisting?: boolean };

/**
 * Exactly two perspectives: one display config per endpoint (a→b, b→a).
 * These are not machine ids. Symmetric relationship types use the `symmetric` trait
 * (labels may still repeat for display).
 */
export type PerspectivePair = [PerspectiveLabelConfig, PerspectiveLabelConfig];

/** Configured trait entry — `key` names the trait; remaining keys are trait config. */
export interface TraitObjectEntry {
  key: string;
  [configKey: string]: unknown;
}

/** Flag trait (string) or configured trait (object with `key`). */
export type TraitEntry = string | TraitObjectEntry;

export interface RelationshipTypeEndpointConstraint {
  typeId: string;
}

/** Tuple index 0/1 → allowed `is_a` type node id at that endpoint. */
export interface RelationshipTypeEndpoints {
  0: RelationshipTypeEndpointConstraint;
  1: RelationshipTypeEndpointConstraint;
}

export interface RelationshipTypeDefinition {
  /** User-facing labels for each endpoint. Always a pair — every relationship is bidirectional. */
  perspectives: PerspectivePair;
  /** When false, relation sections default to omitting the inline link-existing control. */
  linkExisting?: boolean;
  /** Cross-cutting capabilities (array interpreted as a set). */
  traits?: TraitEntry[];
  /** Optional endpoint type constraints (replaces schema.json relationship rules). */
  endpoints?: RelationshipTypeEndpoints;
}

export interface RelationshipTypesFile {
  version: number;
  relationshipTypes: Record<string, RelationshipTypeDefinition>;
}

export function emptyRelationshipTypesFile(): RelationshipTypesFile {
  return { version: RELATIONSHIP_TYPES_FILE_VERSION, relationshipTypes: {} };
}

export function perspectiveTitle(config: PerspectiveLabelConfig): string {
  return typeof config === "string" ? config : config.title;
}

export function perspectiveLinkAdd(config: PerspectiveLabelConfig): string | undefined {
  return typeof config === "string" ? undefined : config.linkAdd;
}

export function perspectiveLinkExisting(
  config: PerspectiveLabelConfig,
): boolean | undefined {
  return typeof config === "string" ? undefined : config.linkExisting;
}

export function perspectiveConfigAt(
  def: RelationshipTypeDefinition,
  index: 0 | 1,
): PerspectiveLabelConfig {
  return def.perspectives[index]!;
}

/**
 * Cache / query identity for a directed projection: relationship type ULID + endpoint index.
 * Not a user-facing slug.
 */
export function projectionTypeForEndpoint(
  relationshipTypeId: string,
  endpointIndex: 0 | 1,
): string {
  return `${normalizeRelationshipTypeId(relationshipTypeId)}:${endpointIndex}`;
}

const PROJECTION_TYPE_RE = /^([0-9A-HJKMNP-TV-Z]{26}):([01])$/;

export function parseProjectionType(
  type: string,
): { relationshipTypeId: string; endpointIndex: 0 | 1 } | null {
  const match = PROJECTION_TYPE_RE.exec(type.trim());
  if (!match) return null;
  return {
    relationshipTypeId: match[1]!,
    endpointIndex: match[2] === "1" ? 1 : 0,
  };
}

/** Other directed projection of the same relationship type (`:0` ↔ `:1`). */
export function oppositeProjectionType(type: string): string | null {
  const parsed = parseProjectionType(type);
  if (!parsed) return null;
  return projectionTypeForEndpoint(
    parsed.relationshipTypeId,
    parsed.endpointIndex === 0 ? 1 : 0,
  );
}

/**
 * Projection whose **sources** are the "active hosts" for Only-active picking.
 * Picking a target of P → hosts of opposite(P); picking a source of P → hosts of P.
 */
export function onlyActiveHostProjectionType(
  selectedProjectionType: string,
  pickingRole: "source" | "target",
): string | null {
  const trimmed = selectedProjectionType.trim();
  if (!trimmed) return null;
  if (pickingRole === "source") return trimmed;
  return oppositeProjectionType(trimmed);
}

export function relationshipTypeIdFromProjectionType(type: string): string | null {
  return parseProjectionType(type)?.relationshipTypeId ?? null;
}

export function endpointIndexFromProjectionType(type: string): 0 | 1 | null {
  return parseProjectionType(type)?.endpointIndex ?? null;
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
): RelationshipTypeEndpointConstraint {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`associations.json: ${context} must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.typeId !== "string" || !isNodeId(obj.typeId)) {
    throw new Error(`associations.json: ${context}.typeId must be a valid node id`);
  }
  return { typeId: obj.typeId };
}

function parseEndpoints(raw: unknown, typeKey: string): RelationshipTypeEndpoints | undefined {
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

function serializePerspectiveConfig(config: PerspectiveLabelConfig): PerspectiveLabelConfig {
  if (typeof config === "string") return config;
  const out: { title: string; linkAdd?: string; linkExisting?: boolean } = {
    title: config.title,
  };
  if (config.linkAdd !== undefined) out.linkAdd = config.linkAdd;
  if (config.linkExisting !== undefined) out.linkExisting = config.linkExisting;
  return out;
}

export function parseRelationshipTypesFile(raw: string): RelationshipTypesFile {
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

  const relationshipTypes: Record<string, RelationshipTypeDefinition> = {};
  for (const [rawKey, value] of Object.entries(obj.associations as Record<string, unknown>)) {
    const key = normalizeRelationshipTypeId(rawKey);
    if (!isRelationshipTypeId(key)) {
      throw new Error(
        `associations.json: relationship type key "${rawKey}" must be a ULID`,
      );
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`associations.json: type ${key} must be an object`);
    }
    const row = value as Record<string, unknown>;
    if (row.perspectiveLabels !== undefined) {
      throw new Error(
        `associations.json: type ${key} perspectiveLabels is removed; put labels in perspectives`,
      );
    }
    if (!Array.isArray(row.perspectives) || row.perspectives.length !== 2) {
      throw new Error(
        `associations.json: type ${key} must define exactly two perspectives`,
      );
    }
    const perspectives: PerspectivePair = [
      parsePerspectiveLabelConfig(row.perspectives[0], `type ${key} perspectives[0]`),
      parsePerspectiveLabelConfig(row.perspectives[1], `type ${key} perspectives[1]`),
    ];
    const linkExisting = parseLinkExisting(row.linkExisting, `type ${key}.linkExisting`);
    const traits = parseTraits(row.traits, key);
    const endpoints = parseEndpoints(row.endpoints, key);
    relationshipTypes[key] = {
      perspectives,
      ...(linkExisting !== undefined ? { linkExisting } : {}),
      ...(traits ? { traits } : {}),
      ...(endpoints ? { endpoints } : {}),
    };
  }

  return { version: obj.version, relationshipTypes };
}

export function serializeRelationshipTypesFile(file: RelationshipTypesFile): string {
  const sortedRelationshipTypes: Record<string, RelationshipTypeDefinition> = {};
  for (const key of Object.keys(file.relationshipTypes).sort()) {
    const def = file.relationshipTypes[key]!;
    sortedRelationshipTypes[key] = {
      perspectives: [
        serializePerspectiveConfig(def.perspectives[0]!),
        serializePerspectiveConfig(def.perspectives[1]!),
      ],
      ...(def.linkExisting !== undefined ? { linkExisting: def.linkExisting } : {}),
      ...(def.traits ? { traits: serializeTraits(def.traits) } : {}),
      ...(def.endpoints ? { endpoints: serializeEndpoints(def.endpoints) } : {}),
    };
  }
  return `${JSON.stringify({ version: file.version, associations: sortedRelationshipTypes }, null, 2)}\n`;
}

/** Directed projection types for both endpoints of a relationship type. */
export function projectionTypesForComposite(
  relationshipTypeId: string,
): [string, string] {
  const id = normalizeRelationshipTypeId(relationshipTypeId);
  return [projectionTypeForEndpoint(id, 0), projectionTypeForEndpoint(id, 1)];
}

export function perspectiveCountForExpansion(
  typeDef: RelationshipTypeDefinition | undefined,
  _relationshipTypeId: string,
): number {
  return typeDef ? 2 : 1;
}

export function isDualPerspectiveType(typeDef: RelationshipTypeDefinition | undefined): boolean {
  return typeDef !== undefined;
}

export function isBidirectionalComposite(
  registry: RelationshipTypesFile,
  relationshipTypeId: string,
): boolean {
  const def = registry.relationshipTypes[normalizeRelationshipTypeId(relationshipTypeId)];
  return isDualPerspectiveType(def);
}

export class UnknownRelationshipTypeError extends Error {
  constructor(public readonly relationshipTypeId: string) {
    super(`No relationship type registered for id "${relationshipTypeId}".`);
    this.name = "UnknownRelationshipTypeError";
  }
}

/** Require a registered relationship type id (callers must not pass display labels). */
export function requireRelationshipTypeId(
  registry: RelationshipTypesFile,
  relationshipTypeId: string,
): string {
  const id = normalizeRelationshipTypeId(relationshipTypeId);
  if (!registry.relationshipTypes[id]) {
    throw new UnknownRelationshipTypeError(id);
  }
  return id;
}

export function registerTypeDefinition(
  file: RelationshipTypesFile,
  relationshipTypeId: string,
  def: RelationshipTypeDefinition,
): void {
  const id = normalizeRelationshipTypeId(relationshipTypeId);
  if (!isRelationshipTypeId(id)) {
    throw new Error(`Relationship type id must be a ULID, got "${relationshipTypeId}"`);
  }
  file.relationshipTypes[id] = {
    perspectives: [
      typeof def.perspectives[0] === "string"
        ? def.perspectives[0].trim()
        : { ...def.perspectives[0], title: def.perspectives[0].title.trim() },
      typeof def.perspectives[1] === "string"
        ? def.perspectives[1].trim()
        : { ...def.perspectives[1], title: def.perspectives[1].title.trim() },
    ],
    ...(def.linkExisting !== undefined ? { linkExisting: def.linkExisting } : {}),
    ...(def.traits ? { traits: [...def.traits] } : {}),
    ...(def.endpoints ? { endpoints: serializeEndpoints(def.endpoints) } : {}),
  };
}

/**
 * Register a dual-perspective relationship type with display labels.
 * Pass `id` or mint a ULID. Never derives identity from labels.
 */
export function registerBidirectionalType(
  file: RelationshipTypesFile,
  labelFromA: PerspectiveLabelConfig,
  labelFromB: PerspectiveLabelConfig,
  id?: string,
  options?: { traits?: TraitEntry[] },
): string {
  const relationshipTypeId = id !== undefined ? normalizeRelationshipTypeId(id) : generateRelationshipTypeId();
  registerTypeDefinition(file, relationshipTypeId, {
    perspectives: [labelFromA, labelFromB],
    ...(options?.traits ? { traits: options.traits } : {}),
  });
  return relationshipTypeId;
}

/** Register a set-trait relationship type with explicit ULID id and perspective labels. */
export function registerSetRelationshipType(
  file: RelationshipTypesFile,
  options: {
    id: string;
    perspectives: PerspectivePair;
    ordered?: boolean;
  },
): void {
  const traits: TraitEntry[] = options.ordered ? ["set", "ordered"] : ["set"];
  registerTypeDefinition(file, options.id, {
    perspectives: options.perspectives,
    traits,
  });
}
