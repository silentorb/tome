import { normalizeRelationshipType } from "../relation-type";

export const SCHEMA_FILE_VERSION = 1;

export interface RelationshipRuleEntry {
  id: string;
  sourceTypeId: string;
  type: string;
  allowedTargetTypeIds: string[];
}

export type EnumDefaultOrder = "asc" | "desc";

export interface EnumDefinition {
  options: string[];
  default: string;
  /** Dropdown display order (UI only); defaults to asc when omitted in schema.json. */
  defaultOrder: EnumDefaultOrder;
  values?: Record<string, number>;
}

export interface SchemaFile {
  version: number;
  relationshipRules: RelationshipRuleEntry[];
  enums: Record<string, EnumDefinition>;
}

export function emptySchemaFile(): SchemaFile {
  return { version: SCHEMA_FILE_VERSION, relationshipRules: [], enums: {} };
}

function parseEnumDefinition(enumId: string, raw: unknown): EnumDefinition {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`schema.json: enums.${enumId} must be an object`);
  }
  const entry = raw as Record<string, unknown>;
  if (!Array.isArray(entry.options) || entry.options.length === 0) {
    throw new Error(`schema.json: enums.${enumId}.options must be a non-empty array`);
  }
  const options = entry.options.filter(
    (option): option is string => typeof option === "string" && option.trim().length > 0,
  );
  if (options.length === 0) {
    throw new Error(`schema.json: enums.${enumId}.options must contain non-empty strings`);
  }
  if (typeof entry.default !== "string" || !entry.default.trim()) {
    throw new Error(`schema.json: enums.${enumId}.default is required`);
  }
  const defaultValue = entry.default.trim();
  if (!options.includes(defaultValue)) {
    throw new Error(`schema.json: enums.${enumId}.default must be one of options`);
  }

  let defaultOrder: EnumDefaultOrder = "asc";
  if (entry.defaultOrder !== undefined) {
    if (entry.defaultOrder !== "asc" && entry.defaultOrder !== "desc") {
      throw new Error(`schema.json: enums.${enumId}.defaultOrder must be "asc" or "desc"`);
    }
    defaultOrder = entry.defaultOrder;
  }

  let values: Record<string, number> | undefined;
  if (entry.values !== undefined) {
    if (!entry.values || typeof entry.values !== "object" || Array.isArray(entry.values)) {
      throw new Error(`schema.json: enums.${enumId}.values must be an object`);
    }
    values = {};
    const optionSet = new Set(options);
    for (const [key, value] of Object.entries(entry.values as Record<string, unknown>)) {
      if (!optionSet.has(key)) {
        throw new Error(`schema.json: enums.${enumId}.values key "${key}" is not in options`);
      }
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`schema.json: enums.${enumId}.values.${key} must be a number`);
      }
      values[key] = value;
    }
  }

  return { options, default: defaultValue, defaultOrder, ...(values ? { values } : {}) };
}

function parseEnums(raw: unknown): Record<string, EnumDefinition> {
  if (raw === undefined) {
    return {};
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("schema.json: enums must be an object");
  }
  const enums: Record<string, EnumDefinition> = {};
  for (const [enumId, entry] of Object.entries(raw as Record<string, unknown>)) {
    const id = enumId.trim();
    if (!id) {
      throw new Error("schema.json: each enum id must be non-empty");
    }
    enums[id] = parseEnumDefinition(id, entry);
  }
  return enums;
}

export function parseSchemaFile(raw: string): SchemaFile {
  const data = JSON.parse(raw) as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("schema.json: root must be an object");
  }
  const obj = data as Record<string, unknown>;
  if (typeof obj.version !== "number") {
    throw new Error("schema.json: version is required");
  }
  if (!Array.isArray(obj.relationshipRules)) {
    throw new Error("schema.json: relationshipRules must be an array");
  }

  const relationshipRules: RelationshipRuleEntry[] = [];
  for (const entry of obj.relationshipRules) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("schema.json: each relationship rule must be an object");
    }
    const rule = entry as Record<string, unknown>;
    if (typeof rule.id !== "string" || !rule.id.trim()) {
      throw new Error("schema.json: relationship rule id is required");
    }
    if (typeof rule.sourceTypeId !== "string" || !rule.sourceTypeId.trim()) {
      throw new Error(`schema.json: relationship rule ${rule.id} sourceTypeId is required`);
    }
    const rawType = rule.type ?? rule.label;
    if (typeof rawType !== "string" || !rawType.trim()) {
      throw new Error(`schema.json: relationship rule ${rule.id} type is required`);
    }
    if (!Array.isArray(rule.allowedTargetTypeIds)) {
      throw new Error(`schema.json: relationship rule ${rule.id} allowedTargetTypeIds must be an array`);
    }
    relationshipRules.push({
      id: rule.id.trim(),
      sourceTypeId: rule.sourceTypeId.trim().toLowerCase(),
      type: normalizeRelationshipType(rawType),
      allowedTargetTypeIds: rule.allowedTargetTypeIds
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .map((id) => id.trim().toLowerCase()),
    });
  }

  const enums = parseEnums(obj.enums);

  return { version: obj.version, relationshipRules, enums };
}

export function serializeSchemaFile(file: SchemaFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}
