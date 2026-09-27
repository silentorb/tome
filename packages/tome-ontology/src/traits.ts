import type { TraitEntry } from "tome-graph-interfaces";
import { normalizeTraitKey } from "./trait-keys";
import type { TraitMapValue } from "./types";

export function traitEntryKey(entry: TraitEntry): string {
  return typeof entry === "string" ? entry : entry.key;
}

/** Normalize traits array to a lookup map (internal; not persisted). */
export function traitMapFromEntries(
  traits: readonly TraitEntry[] | undefined,
): Map<string, TraitMapValue> {
  const map = new Map<string, TraitMapValue>();
  if (!traits) return map;
  for (const entry of traits) {
    if (typeof entry === "string") {
      map.set(entry, true);
      continue;
    }
    const { key, ...config } = entry;
    map.set(key, Object.keys(config).length > 0 ? config : true);
  }
  return map;
}

export function hasTraitInEntries(
  traits: readonly TraitEntry[] | undefined,
  key: string,
): boolean {
  return traitMapFromEntries(traits).has(normalizeTraitKey(key));
}

export function traitConfigFromEntries(
  traits: readonly TraitEntry[] | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = traitMapFromEntries(traits).get(normalizeTraitKey(key));
  if (value === undefined || value === true) return undefined;
  return value;
}

/** Merge trait maps; later entries overwrite earlier keys. */
export function mergeTraitMaps(
  maps: Iterable<Map<string, TraitMapValue>>,
): Map<string, TraitMapValue> {
  const out = new Map<string, TraitMapValue>();
  for (const map of maps) {
    for (const [k, v] of map) {
      out.set(k, v);
    }
  }
  return out;
}
