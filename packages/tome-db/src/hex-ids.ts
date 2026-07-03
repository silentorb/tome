const HEX32 = /^[a-f0-9]{32}$/i;

export function isHex32Id(id: string): boolean {
  return HEX32.test(id);
}

/** Normalize an id (with or without dashes) to a 32-hex graph node id. */
export function normalizeHex32Id(id: string): string | null {
  const compact = id.replace(/-/g, "").toLowerCase();
  if (!isHex32Id(compact)) return null;
  return compact;
}
