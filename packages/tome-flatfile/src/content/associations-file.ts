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

/**
 * Exactly two perspectives: one display config per endpoint (a→b, b→a).
 * Symmetric associations repeat the same label. These are not machine ids.
 */
export type PerspectivePair = [PerspectiveLabelConfig, PerspectiveLabelConfig];

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
  /** User-facing labels for each endpoint. Always a pair — every relationship is bidirectional. */
  perspectives: PerspectivePair;
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
  def: AssociationDefinition,
  index: 0 | 1,
): PerspectiveLabelConfig {
  return def.perspectives[index]!;
}

/**
 * Cache / query identity for a directed projection: association ULID + endpoint index.
 * Not a user-facing slug.
 */
export function projectionTypeForEndpoint(
  associationId: string,
  endpointIndex: 0 | 1,
): string {
  return `${normalizeAssociationId(associationId)}:${endpointIndex}`;
}

const PROJECTION_TYPE_RE = /^([0-9A-HJKMNP-TV-Z]{26}):([01])$/;

export function parseProjectionType(
  type: string,
): { associationId: string; endpointIndex: 0 | 1 } | null {
  const match = PROJECTION_TYPE_RE.exec(type.trim());
  if (!match) return null;
  return {
    associationId: match[1]!,
    endpointIndex: match[2] === "1" ? 1 : 0,
  };
}

export function associationIdFromProjectionType(type: string): string | null {
  return parseProjectionType(type)?.associationId ?? null;
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

function serializePerspectiveConfig(config: PerspectiveLabelConfig): PerspectiveLabelConfig {
  if (typeof config === "string") return config;
  const out: { title: string; linkAdd?: string; linkExisting?: boolean } = {
    title: config.title,
  };
  if (config.linkAdd !== undefined) out.linkAdd = config.linkAdd;
  if (config.linkExisting !== undefined) out.linkExisting = config.linkExisting;
  return out;
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
    associations[key] = {
      perspectives,
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
      perspectives: [
        serializePerspectiveConfig(def.perspectives[0]!),
        serializePerspectiveConfig(def.perspectives[1]!),
      ],
      ...(def.linkExisting !== undefined ? { linkExisting: def.linkExisting } : {}),
      ...(def.traits ? { traits: serializeTraits(def.traits) } : {}),
      ...(def.endpoints ? { endpoints: serializeEndpoints(def.endpoints) } : {}),
    };
  }
  return `${JSON.stringify({ version: file.version, associations: sortedAssociations }, null, 2)}\n`;
}

/** Directed projection types for both endpoints of an association. */
export function projectionTypesForComposite(
  associationId: string,
): [string, string] {
  const id = normalizeAssociationId(associationId);
  return [projectionTypeForEndpoint(id, 0), projectionTypeForEndpoint(id, 1)];
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

export class UnknownAssociationError extends Error {
  constructor(public readonly associationId: string) {
    super(`No association registered for id "${associationId}".`);
    this.name = "UnknownAssociationError";
  }
}

/** Require a registered association id (callers must not pass display labels). */
export function requireAssociationId(
  registry: AssociationsFile,
  associationId: string,
): string {
  const id = normalizeAssociationId(associationId);
  if (!registry.associations[id]) {
    throw new UnknownAssociationError(id);
  }
  return id;
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
 * Register a dual-perspective association with display labels.
 * Pass `id` or mint a ULID. Never derives identity from labels.
 */
export function registerBidirectionalType(
  file: AssociationsFile,
  labelFromA: PerspectiveLabelConfig,
  labelFromB: PerspectiveLabelConfig,
  id?: string,
): string {
  const associationId = id !== undefined ? normalizeAssociationId(id) : generateAssociationId();
  registerTypeDefinition(file, associationId, {
    perspectives: [labelFromA, labelFromB],
  });
  return associationId;
}

/** Register a set-trait association with explicit ULID id and perspective labels. */
export function registerSetAssociation(
  file: AssociationsFile,
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
