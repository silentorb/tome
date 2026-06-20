import { resolveContentPath } from "./content/paths";
import type { DatabaseColumnDef } from "./database-view";
import { loadSchemaFromContent } from "./schema-rules/load";
import type { EnumDefinition, SchemaFile } from "./schema-rules/schema-file";
import {
  FALLBACK_PRIORITY,
  isPriorityColumnKey,
  isPriorityPropertyName,
  PRIORITY_ENUM_ID,
  resolvePriorityEnum,
  resolvePropertyEnum,
  type PriorityValue,
} from "./property-enums-core";

export {
  FALLBACK_PRIORITY,
  isPriorityColumnKey,
  isPriorityPropertyName,
  PRIORITY_ENUM_ID,
  resolvePriorityEnum,
  resolvePropertyEnum,
  type PriorityValue,
} from "./property-enums-core";

/** @deprecated Use getPriorityOptions() */
export const PRIORITY_OPTIONS = FALLBACK_PRIORITY.options;

/** @deprecated Use getPriorityDefault() */
export const PRIORITY_DEFAULT: PriorityValue = FALLBACK_PRIORITY.default as PriorityValue;

/** @deprecated Use getPriorityValues() */
export const PRIORITY_WEIGHT: Record<string, number> = FALLBACK_PRIORITY.values ?? {};

export function resolvePropertyEnumFromContent(
  enumId: string,
  contentDir?: string,
): EnumDefinition | null {
  const schema = loadSchemaFromContent(contentDir ?? resolveContentPath());
  return resolvePropertyEnum(enumId, schema);
}

function activePriority(): EnumDefinition {
  return resolvePropertyEnumFromContent(PRIORITY_ENUM_ID) ?? FALLBACK_PRIORITY;
}

/** Priority labels from schema.json (or fallback when schema is missing). */
export function getPriorityOptions(): readonly string[] {
  return activePriority().options;
}

/** Default priority label from schema.json (or fallback). */
export function getPriorityDefault(): string {
  return activePriority().default;
}

/** Priority numeric values from schema.json, interpreted as weights by consumers. */
export function getPriorityValues(): Record<string, number> {
  return { ...(activePriority().values ?? {}) };
}

function enumIdForColumn(def: DatabaseColumnDef, schema: SchemaFile): string | null {
  const key = def.key.trim().toLowerCase();
  if (schema.enums[key]) return key;
  const name = def.name.trim().toLowerCase();
  if (schema.enums[name]) return name;
  if (name === "priority" && schema.enums[PRIORITY_ENUM_ID]) return PRIORITY_ENUM_ID;
  if (key === PRIORITY_ENUM_ID && resolvePropertyEnum(PRIORITY_ENUM_ID, schema)) return PRIORITY_ENUM_ID;
  return null;
}

export function isPriorityValue(value: string): value is PriorityValue {
  return getPriorityOptions().includes(value);
}

export function priorityWeight(priority: unknown): number {
  const def = activePriority();
  const values = def.values ?? {};
  const defaultValue = def.default;
  if (typeof priority !== "string" || !priority.trim()) {
    return values[defaultValue] ?? 0;
  }
  return values[priority] ?? 0;
}

/** Compare priority labels by schema weight (not alphabetical order). */
export function comparePriorityLabels(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  return priorityWeight(left) - priorityWeight(right);
}

export function coalescePriorityValue(value: string | null | undefined): PriorityValue {
  if (value && isPriorityValue(value)) return value;
  return getPriorityDefault() as PriorityValue;
}

export function isUnsetPriority(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && !value.trim());
}

export function enrichColumnDef(def: DatabaseColumnDef, schema?: SchemaFile): DatabaseColumnDef {
  const resolvedSchema = schema ?? loadSchemaFromContent(resolveContentPath());
  const explicitEnumId = def.enumId?.trim();
  const enumId =
    (explicitEnumId && resolvePropertyEnum(explicitEnumId, resolvedSchema)
      ? explicitEnumId
      : null) ?? enumIdForColumn(def, resolvedSchema);
  if (!enumId) {
    return def;
  }
  const enumDef = resolvePropertyEnum(enumId, resolvedSchema);
  if (!enumDef) {
    return def;
  }
  return {
    ...def,
    type: "enum",
    enumId,
    options: [...enumDef.options],
    defaultValue: enumDef.default,
    defaultOrder: enumDef.defaultOrder,
  };
}

export function enrichColumnDefs(defs: DatabaseColumnDef[], schema?: SchemaFile): DatabaseColumnDef[] {
  const resolvedSchema = schema ?? loadSchemaFromContent(resolveContentPath());
  return defs.map((def) => enrichColumnDef(def, resolvedSchema));
}
