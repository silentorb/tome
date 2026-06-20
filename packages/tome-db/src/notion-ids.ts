const HEX32 = /^[a-f0-9]{32}$/i;

export function isNotionHexId(id: string): boolean {
  return HEX32.test(id);
}

/** Normalize API id (with or without dashes) to 32-hex graph node id. */
export function normalizeNotionId(id: string): string | null {
  const compact = id.replace(/-/g, "").toLowerCase();
  if (!isNotionHexId(compact)) return null;
  return compact;
}
