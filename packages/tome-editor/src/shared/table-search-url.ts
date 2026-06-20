const TABLE_SEARCH_PARAM_PREFIX = "search_";

export function itemsTableSearchParamKey(): string {
  return "search_items";
}

export function relationTableSearchParamKey(label: string): string {
  return `${TABLE_SEARCH_PARAM_PREFIX}${label}`;
}

export function tableSearchFromLocation(key: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(key) ?? "";
}

export function syncTableSearchParam(key: string, query: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const trimmed = query.trim();
  if (trimmed) url.searchParams.set(key, trimmed);
  else url.searchParams.delete(key);
  window.history.replaceState({}, "", url.toString());
}

export function stripTableSearchParams(url: URL): void {
  for (const paramKey of [...url.searchParams.keys()]) {
    if (paramKey.startsWith(TABLE_SEARCH_PARAM_PREFIX)) {
      url.searchParams.delete(paramKey);
    }
  }
}
