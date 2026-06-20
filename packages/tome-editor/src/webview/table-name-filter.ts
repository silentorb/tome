import { sortBySearchRelevance } from "tome-db/search-relevance";

export function matchesTableNameFilter(name: string, query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) return true;
  return name.toLocaleLowerCase().includes(trimmed.toLocaleLowerCase());
}

export function filterRowsByName<T>(
  rows: readonly T[],
  query: string,
  getName: (row: T) => string,
): T[] {
  const trimmed = query.trim();
  if (!trimmed) return [...rows];
  const filtered = rows.filter((row) => matchesTableNameFilter(getName(row), trimmed));
  return sortBySearchRelevance(filtered, trimmed, getName);
}
