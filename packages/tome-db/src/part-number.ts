/** Derive a Part's narrative number from its display title. */
export function partNumberFromTitle(title: string): number | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  if (/^prelude$/i.test(trimmed)) return 0;
  const match = trimmed.match(/^Part\s+(\d+)/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1]!, 10);
  return Number.isFinite(parsed) ? parsed : null;
}
