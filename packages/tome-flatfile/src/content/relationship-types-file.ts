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

/** Preferred name for a relational-role display label (alias of PerspectiveLabelConfig). */
export type RoleLabelConfig = PerspectiveLabelConfig;

/**
 * Exactly two relational-role labels: one display config per endpoint (a→b, b→a).
 * Labels are not machine ids — see `roleIds`. Symmetric relationship types use the
 * `symmetric` trait (labels may still repeat for display).
 */
export type PerspectivePair = [PerspectiveLabelConfig, PerspectiveLabelConfig];

/** Preferred name for the label pair (alias of PerspectivePair). */
export type RoleLabelPair = PerspectivePair;

/** Globally unique ULIDs for the two relational roles (index-aligned with labels). */
export type RoleIdPair = [string, string];

/** Configured trait entry — `key` names the trait; remaining keys are trait config. */
export interface TraitObjectEntry {
  key: string;
  [configKey: string]: unknown;
}

/** Flag trait (string) or configured trait (object with `key`). */
export type TraitEntry = string | TraitObjectEntry;

export interface RelationshipTypeEndpointConstraint {
  /** When omitted, the endpoint is open (any node). */
  typeId?: string;
}

/** Tuple index 0/1 → allowed `is_a` type node id at that endpoint. */
export interface RelationshipTypeEndpoints {
  0: RelationshipTypeEndpointConstraint;
  1: RelationshipTypeEndpointConstraint;
}

export interface RelationshipTypeDefinition {
  /**
   * User-facing labels for each relational role. Always a pair — every relationship is bidirectional.
   * On disk preferred JSON key is `roles` (legacy: `perspectives`).
   */
  perspectives: PerspectivePair;
  /**
   * Canonical identities for each relational role; parallel to `perspectives` / endpoints.
   * Omitted only for legacy fixtures — prefer always set; serialize always writes them.
   */
  roleIds?: RoleIdPair;
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

/** Alias — relational role display title. */
export const roleTitle = perspectiveTitle;

export function perspectiveLinkAdd(config: PerspectiveLabelConfig): string | undefined {
  return typeof config === "string" ? undefined : config.linkAdd;
}

export const roleLinkAdd = perspectiveLinkAdd;

export function perspectiveLinkExisting(
  config: PerspectiveLabelConfig,
): boolean | undefined {
  return typeof config === "string" ? undefined : config.linkExisting;
}

export const roleLinkExisting = perspectiveLinkExisting;

export function perspectiveConfigAt(
  def: RelationshipTypeDefinition,
  index: 0 | 1,
): PerspectiveLabelConfig {
  return def.perspectives[index]!;
}

export const roleConfigAt = perspectiveConfigAt;

/** Mint a new relational role id (ULID). */
export function generateRoleId(): string {
  return generateNodeId();
}

/** Mint a fresh role id pair for a relationship type. */
export function mintRoleIdPair(): RoleIdPair {
  return [generateRoleId(), generateRoleId()];
}

/**
 * Deterministic role ids when `roleIds` is omitted from associations.json (legacy bridge).
 * Workspace corpora should persist explicit `roleIds`; this keeps old fixtures parseable.
 */
export function bridgeRoleIdsForType(relationshipTypeId: string): RoleIdPair {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const digest = (endpoint: 0 | 1): string => {
    const input = `${normalizeRelationshipTypeId(relationshipTypeId)}:${endpoint}:role`;
    let h0 = 2166136261;
    let h1 = 2166136261 ^ 0x9e3779b9;
    for (let i = 0; i < input.length; i++) {
      const c = input.charCodeAt(i);
      h0 = Math.imul(h0 ^ c, 16777619);
      h1 = Math.imul(h1 ^ c, 16777619);
    }
    let out = "";
    let x = h0 >>> 0;
    let y = h1 >>> 0;
    for (let i = 0; i < 26; i++) {
      const nibble = i < 13 ? x : y;
      const shift = (i % 13) * 2;
      out += alphabet[(nibble >>> shift) & 31]!;
      if (i === 12) {
        x = y;
      }
    }
    return out;
  };
  return [digest(0), digest(1)];
}

function ensureRoleIds(
  relationshipTypeId: string,
  roleIds: RoleIdPair | undefined,
): RoleIdPair {
  if (roleIds) return roleIds;
  return bridgeRoleIdsForType(relationshipTypeId);
}

function parseRoleIdPair(
  raw: unknown,
  typeKey: string,
): RoleIdPair | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length !== 2) {
    throw new Error(
      `associations.json: type ${typeKey} roleIds must be an array of exactly two ULIDs`,
    );
  }
  const a = typeof raw[0] === "string" ? raw[0].trim() : "";
  const b = typeof raw[1] === "string" ? raw[1].trim() : "";
  if (!isRelationshipTypeId(a) || !isRelationshipTypeId(b)) {
    throw new Error(
      `associations.json: type ${typeKey} roleIds must be two ULIDs`,
    );
  }
  if (a === b) {
    throw new Error(
      `associations.json: type ${typeKey} roleIds must be distinct`,
    );
  }
  return [a, b];
}

function normalizeLabelConfig(config: PerspectiveLabelConfig): PerspectiveLabelConfig {
  if (typeof config === "string") return config.trim();
  return { ...config, title: config.title.trim() };
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
  if (obj.typeId === undefined || obj.typeId === null) {
    return {};
  }
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
    0: endpoints[0].typeId ? { typeId: endpoints[0].typeId } : {},
    1: endpoints[1].typeId ? { typeId: endpoints[1].typeId } : {},
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
        `associations.json: type ${key} perspectiveLabels is removed; put labels in roles`,
      );
    }
    const labelRaw = row.roles !== undefined ? row.roles : row.perspectives;
    const labelKey = row.roles !== undefined ? "roles" : "perspectives";
    if (!Array.isArray(labelRaw) || labelRaw.length !== 2) {
      throw new Error(
        `associations.json: type ${key} must define exactly two ${labelKey} (relational role labels)`,
      );
    }
    const perspectives: PerspectivePair = [
      parsePerspectiveLabelConfig(labelRaw[0], `type ${key} ${labelKey}[0]`),
      parsePerspectiveLabelConfig(labelRaw[1], `type ${key} ${labelKey}[1]`),
    ];
    const parsedRoleIds = parseRoleIdPair(row.roleIds, key);
    const roleIds = ensureRoleIds(key, parsedRoleIds);
    const linkExisting = parseLinkExisting(row.linkExisting, `type ${key}.linkExisting`);
    const traits = parseTraits(row.traits, key);
    const endpoints = parseEndpoints(row.endpoints, key);
    relationshipTypes[key] = {
      perspectives,
      roleIds,
      ...(linkExisting !== undefined ? { linkExisting } : {}),
      ...(traits ? { traits } : {}),
      ...(endpoints ? { endpoints } : {}),
    };
  }

  // Enforce global uniqueness of role ids across the file.
  const seenRoles = new Map<string, string>();
  for (const [typeId, def] of Object.entries(relationshipTypes)) {
    const pair = ensureRoleIds(typeId, def.roleIds);
    def.roleIds = pair;
    for (let endpoint = 0; endpoint < 2; endpoint++) {
      const roleId = pair[endpoint as 0 | 1]!;
      const prev = seenRoles.get(roleId);
      if (prev) {
        throw new Error(
          `associations.json: duplicate relational role id "${roleId}" (${prev} and ${typeId}:${endpoint})`,
        );
      }
      seenRoles.set(roleId, `${typeId}:${endpoint}`);
    }
  }

  return { version: obj.version, relationshipTypes };
}

export function serializeRelationshipTypesFile(file: RelationshipTypesFile): string {
  const sortedRelationshipTypes: Record<string, Record<string, unknown>> = {};
  for (const key of Object.keys(file.relationshipTypes).sort()) {
    const def = file.relationshipTypes[key]!;
    const roleIds = ensureRoleIds(key, def.roleIds);
    sortedRelationshipTypes[key] = {
      roles: [
        serializePerspectiveConfig(def.perspectives[0]!),
        serializePerspectiveConfig(def.perspectives[1]!),
      ],
      roleIds: [roleIds[0], roleIds[1]],
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
  def: Omit<RelationshipTypeDefinition, "roleIds"> & { roleIds?: RoleIdPair },
): void {
  const id = normalizeRelationshipTypeId(relationshipTypeId);
  if (!isRelationshipTypeId(id)) {
    throw new Error(`Relationship type id must be a ULID, got "${relationshipTypeId}"`);
  }
  // Prefer explicit roleIds; otherwise deterministic bridge ids so the same
  // relationship type ULID gets stable roles across corpora / test fixtures.
  const roleIds =
    def.roleIds && def.roleIds[0] && def.roleIds[1]
      ? ([def.roleIds[0].trim(), def.roleIds[1].trim()] as RoleIdPair)
      : bridgeRoleIdsForType(id);
  if (!isRelationshipTypeId(roleIds[0]) || !isRelationshipTypeId(roleIds[1])) {
    throw new Error(`Relational role ids must be ULIDs for type "${id}"`);
  }
  if (roleIds[0] === roleIds[1]) {
    throw new Error(`Relational role ids must be distinct for type "${id}"`);
  }
  file.relationshipTypes[id] = {
    perspectives: [
      normalizeLabelConfig(def.perspectives[0]!),
      normalizeLabelConfig(def.perspectives[1]!),
    ],
    roleIds,
    ...(def.linkExisting !== undefined ? { linkExisting: def.linkExisting } : {}),
    ...(def.traits ? { traits: [...def.traits] } : {}),
    ...(def.endpoints ? { endpoints: serializeEndpoints(def.endpoints) } : {}),
  };
}

/**
 * Register a dual-role relationship type with display labels.
 * Pass `id` or mint a ULID. Never derives identity from labels. Mints `roleIds` when omitted.
 */
export function registerBidirectionalType(
  file: RelationshipTypesFile,
  labelFromA: PerspectiveLabelConfig,
  labelFromB: PerspectiveLabelConfig,
  id?: string,
  options?: { traits?: TraitEntry[]; roleIds?: RoleIdPair },
): string {
  const relationshipTypeId = id !== undefined ? normalizeRelationshipTypeId(id) : generateRelationshipTypeId();
  registerTypeDefinition(file, relationshipTypeId, {
    perspectives: [labelFromA, labelFromB],
    ...(options?.traits ? { traits: options.traits } : {}),
    ...(options?.roleIds ? { roleIds: options.roleIds } : {}),
  });
  return relationshipTypeId;
}

/** Register a set-trait relationship type with explicit ULID id and role labels. */
export function registerSetRelationshipType(
  file: RelationshipTypesFile,
  options: {
    id: string;
    perspectives: PerspectivePair;
    ordered?: boolean;
    roleIds?: RoleIdPair;
  },
): void {
  const traits: TraitEntry[] = options.ordered ? ["set", "ordered"] : ["set"];
  registerTypeDefinition(file, options.id, {
    perspectives: options.perspectives,
    traits,
    ...(options.roleIds ? { roleIds: options.roleIds } : {}),
  });
}
