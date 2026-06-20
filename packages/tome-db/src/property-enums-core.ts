import type { EnumDefinition, SchemaFile } from "./schema-rules/schema-file";

/** Workspace-wide priority enum id (shared across table views). */
export const PRIORITY_ENUM_ID = "priority";

const FALLBACK_PRIORITY = {
  options: ["Low", "Medium", "High", "Consideration"] as const,
  default: "Low",
  defaultOrder: "asc",
  values: {
    Low: 1,
    Medium: 2,
    High: 4,
    Consideration: 0,
  },
} satisfies EnumDefinition;

export type PriorityValue = (typeof FALLBACK_PRIORITY.options)[number];

export function resolvePropertyEnum(enumId: string, schema?: SchemaFile): EnumDefinition | null {
  const id = enumId.trim();
  if (!id) return null;
  const def = schema?.enums[id];
  if (def) return def;
  if (id === PRIORITY_ENUM_ID) return FALLBACK_PRIORITY;
  return null;
}

export function resolvePriorityEnum(schema?: SchemaFile): EnumDefinition {
  return resolvePropertyEnum(PRIORITY_ENUM_ID, schema) ?? FALLBACK_PRIORITY;
}

export function isPriorityColumnKey(key: string): boolean {
  return key.trim().toLowerCase() === PRIORITY_ENUM_ID;
}

export function isPriorityPropertyName(name: string): boolean {
  return name.trim().toLowerCase() === "priority";
}

export { FALLBACK_PRIORITY };
