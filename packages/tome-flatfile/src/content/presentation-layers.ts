import { isNodeId } from "./paths";
import { isAssociationId, normalizeAssociationId } from "./associations-file";
import type {
  RelationGroupsLayerConfig,
  RelationScopeLayerConfig,
  SequenceLayerConfig,
  TablePresentationLayers,
} from "tome-graph-interfaces";

function parseNodeId(value: unknown, path: string): string {
  if (typeof value !== "string" || !isNodeId(value)) {
    throw new Error(`${path}: must be a node id (ULID)`);
  }
  return value;
}

function parseRequiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path}: must be a non-empty string`);
  }
  return value.trim();
}

function parseStringArray(value: unknown, path: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`${path}: must be an array`);
  }
  return value.map((entry, index) => parseRequiredString(entry, `${path}[${index}]`));
}

function parseAssociationId(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${path}: must be a non-empty string`);
  }
  const id = normalizeAssociationId(value);
  if (!isAssociationId(id)) {
    throw new Error(`${path}: must be an association id (ULID)`);
  }
  return id;
}

function parseScopeLayer(raw: unknown, path: string): RelationScopeLayerConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const layer: RelationScopeLayerConfig = {
    memberToScopeComposite: parseAssociationId(
      obj.memberToScopeComposite,
      `${path}.memberToScopeComposite`,
    ),
  };
  const excludeColumnKeys = parseStringArray(obj.excludeColumnKeys, `${path}.excludeColumnKeys`);
  if (excludeColumnKeys) layer.excludeColumnKeys = excludeColumnKeys;
  return layer;
}

function parseGroupsLayer(raw: unknown, path: string): RelationGroupsLayerConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const layer: RelationGroupsLayerConfig = {
    memberToGroupComposite: parseAssociationId(
      obj.memberToGroupComposite,
      `${path}.memberToGroupComposite`,
    ),
    groupTypeDatabaseId: parseNodeId(obj.groupTypeDatabaseId, `${path}.groupTypeDatabaseId`),
    unassignedGroupTitle: parseRequiredString(
      obj.unassignedGroupTitle,
      `${path}.unassignedGroupTitle`,
    ),
  };
  if (obj.groupToScopeComposite !== undefined) {
    layer.groupToScopeComposite = parseAssociationId(
      obj.groupToScopeComposite,
      `${path}.groupToScopeComposite`,
    );
  }
  if (obj.canonicalGroupByTitle !== undefined) {
    if (typeof obj.canonicalGroupByTitle !== "boolean") {
      throw new Error(`${path}.canonicalGroupByTitle: must be a boolean`);
    }
    layer.canonicalGroupByTitle = obj.canonicalGroupByTitle;
  }
  const excludeColumnKeys = parseStringArray(obj.excludeColumnKeys, `${path}.excludeColumnKeys`);
  if (excludeColumnKeys) layer.excludeColumnKeys = excludeColumnKeys;
  return layer;
}

function parseSequenceLayer(raw: unknown, path: string): SequenceLayerConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  const layer: SequenceLayerConfig = {};
  const excludeColumnKeys = parseStringArray(obj.excludeColumnKeys, `${path}.excludeColumnKeys`);
  if (excludeColumnKeys) layer.excludeColumnKeys = excludeColumnKeys;
  return layer;
}

/** Parse presentation layers for a generated views.json record. */
export function parsePresentationLayers(raw: unknown, path: string): TablePresentationLayers {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (obj.reorder !== undefined) {
    throw new Error(
      `${path}.reorder: removed; use "sequence" for intrinsic edge-sequence pin (no reorder alias)`,
    );
  }
  if (obj.generator !== undefined) {
    throw new Error(`${path}: generator is not supported; inline layers on the view record`);
  }
  if (obj.columnViewName !== undefined) {
    throw new Error(`${path}: columnViewName was removed; use view properties allowlist`);
  }
  if (obj.id !== undefined || obj.typeDatabaseId !== undefined) {
    throw new Error(
      `${path}: id and typeDatabaseId are not allowed; use the view nodeId`,
    );
  }

  const layers: TablePresentationLayers = {};
  if (obj.scope !== undefined) {
    layers.scope = parseScopeLayer(obj.scope, `${path}.scope`);
  }
  if (obj.groups !== undefined) {
    layers.groups = parseGroupsLayer(obj.groups, `${path}.groups`);
  }
  if (obj.sequence !== undefined) {
    layers.sequence = parseSequenceLayer(obj.sequence, `${path}.sequence`);
  }
  const excludeColumnKeys = parseStringArray(obj.excludeColumnKeys, `${path}.excludeColumnKeys`);
  if (excludeColumnKeys) layers.excludeColumnKeys = excludeColumnKeys;

  if (!layers.scope && !layers.groups && !layers.sequence) {
    throw new Error(`${path}: must include at least one of scope, groups, or sequence`);
  }
  return layers;
}
