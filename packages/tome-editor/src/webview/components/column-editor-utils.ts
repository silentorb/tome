/** Client-side slug for column keys (matches tome-db `slugifyPropertyKey`). */
export function slugifyColumnKey(label: string): string {
  let s = label.trim().toLowerCase();
  s = s.replace(/[^a-z0-9_]+/g, "_");
  s = s.replace(/^_+|_+$/g, "").replace(/__+/g, "_");
  if (!s) s = "property";
  if (/^\d/.test(s)) s = `prop_${s}`;
  return s;
}

export function relationPerspectiveFromName(name: string): string {
  return slugifyColumnKey(name);
}
