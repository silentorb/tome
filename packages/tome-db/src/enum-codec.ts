import type { Properties } from "./graph";
import { resolvePropertyEnum } from "./property-enums-core";
import type { EnumDefinition, SchemaFile } from "./schema-rules/schema-file";

function enumIdForPropertyKey(key: string, schema: SchemaFile): string | null {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return null;
  if (schema.enums[normalized]) return normalized;
  if (resolvePropertyEnum(normalized, schema)) return normalized;
  return null;
}

export function labelToEnumIndex(enumDef: EnumDefinition, label: string): number {
  const index = enumDef.options.indexOf(label);
  if (index >= 0) return index;
  return enumDef.options.indexOf(enumDef.default);
}

export function indexToEnumLabel(enumDef: EnumDefinition, index: number): string {
  if (Number.isInteger(index) && index >= 0 && index < enumDef.options.length) {
    return enumDef.options[index]!;
  }
  return enumDef.default;
}

function sortIndexForLabel(enumDef: EnumDefinition, label: string | null | undefined): number {
  if (typeof label === "string" && label.trim()) {
    const index = enumDef.options.indexOf(label.trim());
    if (index >= 0) return index;
  }
  return enumDef.options.indexOf(enumDef.default);
}

/** Compare enum labels by `options` array index (not `values` weights). */
export function compareEnumLabels(
  left: string | null | undefined,
  right: string | null | undefined,
  enumDef: EnumDefinition,
): number {
  return sortIndexForLabel(enumDef, left) - sortIndexForLabel(enumDef, right);
}

export function compareEnumLabelsForColumn(
  column: string,
  left: string | null | undefined,
  right: string | null | undefined,
  schema: SchemaFile,
): number | null {
  const enumId = enumIdForPropertyKey(column, schema);
  if (!enumId) return null;
  const enumDef = resolvePropertyEnum(enumId, schema);
  if (!enumDef) return null;
  return compareEnumLabels(left, right, enumDef);
}

export function resolveEnumIdForPropertyName(
  propertyName: string,
  schema: SchemaFile,
): string | null {
  const slug = propertyName.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  return enumIdForPropertyKey(slug, schema) ?? enumIdForPropertyKey(propertyName, schema);
}

export function encodeEnumProperties(properties: Properties, schema: SchemaFile): Properties {
  const out: Properties = { ...properties };
  for (const [key, value] of Object.entries(properties)) {
    const enumId = enumIdForPropertyKey(key, schema);
    if (!enumId) continue;
    const enumDef = resolvePropertyEnum(enumId, schema);
    if (!enumDef) continue;

    if (typeof value === "string" && value.trim()) {
      out[key] = labelToEnumIndex(enumDef, value.trim());
      continue;
    }
    if (typeof value === "number" && Number.isInteger(value)) {
      if (value >= 0 && value < enumDef.options.length) {
        out[key] = value;
      }
    }
  }
  return out;
}

export function decodeEnumProperties(properties: Properties, schema: SchemaFile): Properties {
  const out: Properties = { ...properties };
  for (const [key, value] of Object.entries(properties)) {
    const enumId = enumIdForPropertyKey(key, schema);
    if (!enumId) continue;
    const enumDef = resolvePropertyEnum(enumId, schema);
    if (!enumDef) continue;

    if (typeof value === "number" && Number.isInteger(value)) {
      out[key] = indexToEnumLabel(enumDef, value);
      continue;
    }
    if (typeof value === "string" && value.trim() && enumDef.options.includes(value.trim())) {
      out[key] = value.trim();
    }
  }
  return out;
}
