import type { SchemaFile } from "./schema-rules/schema-file";

export const ENUM_CONFIG_FINGERPRINT_META_KEY = "enum_config_fingerprint";

/** Fingerprint of enum `options` order — SQLite stores 0-based indices into that array. */
export function enumConfigFingerprint(schema: SchemaFile): string {
  const parts: string[] = [];
  for (const enumId of Object.keys(schema.enums).sort()) {
    const def = schema.enums[enumId]!;
    parts.push(`${enumId}\0${def.options.join("\0")}`);
  }
  return parts.join("\x1e");
}
