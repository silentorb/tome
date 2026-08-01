import type { TableRowsQuery, ViewSortSpec } from "tome-graph-interfaces";
import { DEFAULT_TABLE_ROW_LIMIT } from "tome-graph-interfaces";

export { DEFAULT_TABLE_ROW_LIMIT };

function parsePositiveInt(raw: string | null): number | undefined {
  if (raw === null || raw === "") return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

function parseSorts(raw: string | null): ViewSortSpec[] | undefined {
  if (!raw?.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    const sorts: ViewSortSpec[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const column = (entry as { column?: unknown }).column;
      const direction = (entry as { direction?: unknown }).direction;
      if (typeof column !== "string" || !column) continue;
      sorts.push({
        column,
        direction: direction === "desc" ? "desc" : "asc",
      });
    }
    return sorts.length > 0 ? sorts : undefined;
  } catch {
    return undefined;
  }
}

/** Parse limit/offset/q/sorts from URL search params. */
export function tableRowsQueryFromSearchParams(
  params: URLSearchParams,
  options?: { defaultLimit?: number | null },
): TableRowsQuery {
  const defaultLimit = options?.defaultLimit === undefined ? DEFAULT_TABLE_ROW_LIMIT : options.defaultLimit;
  const limitParam = params.get("limit");
  const limit =
    limitParam === null
      ? defaultLimit === null
        ? undefined
        : defaultLimit
      : parsePositiveInt(limitParam);
  const offset = parsePositiveInt(params.get("offset"));
  const q = params.get("q") ?? undefined;
  const sorts = parseSorts(params.get("sorts"));
  const query: TableRowsQuery = {};
  if (limit !== undefined) query.limit = limit;
  if (offset !== undefined) query.offset = offset;
  if (q !== undefined) query.q = q;
  if (sorts) query.sorts = sorts;
  return query;
}

export function appendTableRowsQueryParams(
  params: URLSearchParams,
  rows?: TableRowsQuery,
): void {
  if (!rows) return;
  if (rows.limit !== undefined) params.set("limit", String(rows.limit));
  if (rows.offset !== undefined) params.set("offset", String(rows.offset));
  if (rows.q !== undefined) params.set("q", rows.q);
  if (rows.sorts && rows.sorts.length > 0) {
    params.set("sorts", JSON.stringify(rows.sorts));
  }
}
