import { compareEnumLabelsForColumn } from "tome-db/enum-codec";
import {
  isRelationColumnSort,
  relationLinkCount,
  type RelationSortRow,
} from "tome-db/row-sort-helpers";
import { emptySchemaFile } from "tome-flatfile/schema-file";
import type { SchemaFile } from "tome-graph-interfaces";

/** Local user preferences persisted outside git (see `.tome/user-settings.json`). */

export const USER_SETTINGS_VERSION = 1;

export type SortDirection = "asc" | "desc";

export interface SortColumn {
  column: string;
  direction: SortDirection;
}

/** SQL-style multi-column sort spec for a section table. */
export interface TableSortSpec {
  orderBy: SortColumn[];
}

export interface GlobalSearchSettings {
  includeBody?: boolean;
}

export interface SidebarSettings {
  recentMaxItems?: number;
}

/** Timeline chrome overrides (sparse; omit defaults). */
export interface SequencingSettings {
  showDependencyEdges?: boolean;
}

/** Primitive values for Imp graph parameter overrides. */
export type BlockParameterValue = string | number | boolean | null;

export interface UserSettings {
  version: typeof USER_SETTINGS_VERSION;
  /** Sparse overrides keyed by table id (see `tableSortKey` helpers). */
  tableSorts?: Record<string, TableSortSpec>;
  /** Active table tab id per node page (see `nodeTableTabKey`). */
  tableTabs?: Record<string, string>;
  /**
   * Sparse Imp graph parameter overrides per page block.
   * Outer key: `blockParametersKey(nodeId, componentId)`.
   * Inner key: parameter node id → value.
   */
  blockParameters?: Record<string, Record<string, BlockParameterValue>>;
  globalSearch?: GlobalSearchSettings;
  sidebar?: SidebarSettings;
  sequencing?: SequencingSettings;
}

export type UserSettingsPatch = {
  tableSorts?: Record<string, TableSortSpec | null>;
  tableTabs?: Record<string, string | null>;
  /** Per-block map patches; inner `null` deletes a param; outer `null` clears the block. */
  blockParameters?: Record<string, Record<string, BlockParameterValue | null> | null>;
  globalSearch?: GlobalSearchSettings | null;
  sidebar?: SidebarSettings | null;
  sequencing?: SequencingSettings | null;
};

export const DEFAULT_SIDEBAR_RECENT_MAX_ITEMS = 8;
export const MAX_SIDEBAR_RECENT_MAX_ITEMS = 100;

export const DEFAULT_TABLE_SORT: TableSortSpec = {
  orderBy: [{ column: "name", direction: "asc" }],
};

export function emptyUserSettings(): UserSettings {
  return { version: USER_SETTINGS_VERSION };
}

export function globalSearchIncludeBody(settings: UserSettings): boolean {
  return settings.globalSearch?.includeBody === true;
}

export function sequencingShowDependencyEdges(settings: UserSettings): boolean {
  return settings.sequencing?.showDependencyEdges === true;
}

export function sidebarRecentMaxItems(settings: UserSettings): number {
  const raw = settings.sidebar?.recentMaxItems;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_SIDEBAR_RECENT_MAX_ITEMS;
  }
  return Math.max(1, Math.min(Math.floor(raw), MAX_SIDEBAR_RECENT_MAX_ITEMS));
}

function normalizeSidebar(value: SidebarSettings | undefined): SidebarSettings | undefined {
  if (!value || typeof value.recentMaxItems !== "number" || !Number.isFinite(value.recentMaxItems)) {
    return undefined;
  }
  const recentMaxItems = sidebarRecentMaxItems({ version: USER_SETTINGS_VERSION, sidebar: value });
  if (recentMaxItems === DEFAULT_SIDEBAR_RECENT_MAX_ITEMS) return undefined;
  return { recentMaxItems };
}

function normalizeGlobalSearch(
  value: GlobalSearchSettings | undefined,
): GlobalSearchSettings | undefined {
  if (!value || value.includeBody !== true) return undefined;
  return { includeBody: true };
}

function normalizeSequencing(
  value: SequencingSettings | undefined,
): SequencingSettings | undefined {
  if (!value || value.showDependencyEdges !== true) return undefined;
  return { showDependencyEdges: true };
}

/** Stable key for Imp graph parameter overrides on a page block. */
export function blockParametersKey(nodeId: string, componentId: string): string {
  return `blocks/${nodeId}/${componentId}`;
}

export function blockParametersForKey(
  settings: UserSettings,
  key: string,
): Record<string, BlockParameterValue> {
  const stored = settings.blockParameters?.[key];
  if (!stored || typeof stored !== "object") return {};
  return { ...stored };
}

function isBlockParameterValue(value: unknown): value is BlockParameterValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

function normalizeBlockParameterMap(
  value: Record<string, unknown> | undefined,
): Record<string, BlockParameterValue> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const parsed: Record<string, BlockParameterValue> = {};
  for (const [paramId, raw] of Object.entries(value)) {
    if (!paramId || !isBlockParameterValue(raw)) continue;
    if (typeof raw === "number" && !Number.isFinite(raw)) continue;
    parsed[paramId] = raw;
  }
  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

export function relationTableSortKey(nodeId: string, relationLabel: string): string {
  return `records/${nodeId}/relations/${relationLabel}`;
}

export function databaseTableSortKey(
  nodeId: string,
  databaseId: string,
  viewName: string,
): string {
  return `records/${nodeId}/database/${databaseId}/${viewName}`;
}

/** Stable key for the active table tab on a node page (one tabbed section per type-table node). */
export function nodeTableTabKey(nodeId: string): string {
  return `records/${nodeId}/tab`;
}

export function tableTabOverrideForKey(
  settings: UserSettings,
  tabKey: string,
): string | undefined {
  const stored = settings.tableTabs?.[tabKey];
  return typeof stored === "string" && stored.length > 0 ? stored : undefined;
}

/** URL tab wins when present; otherwise the saved user-settings override. */
export function effectiveTableTab(
  settings: UserSettings,
  nodeId: string,
  urlTab?: string,
): string | undefined {
  return urlTab ?? tableTabOverrideForKey(settings, nodeTableTabKey(nodeId));
}

export function isDefaultTableSort(spec: TableSortSpec): boolean {
  return (
    spec.orderBy.length === 1 &&
    spec.orderBy[0]?.column === "name" &&
    spec.orderBy[0]?.direction === "asc"
  );
}

export function normalizeTableSort(spec: TableSortSpec | undefined): TableSortSpec {
  if (!spec?.orderBy?.length) return DEFAULT_TABLE_SORT;
  const orderBy = spec.orderBy.filter(
    (entry) => typeof entry.column === "string" && entry.column.length > 0,
  );
  if (orderBy.length === 0) return DEFAULT_TABLE_SORT;
  return {
    orderBy: orderBy.map((entry) => ({
      column: entry.column,
      direction: entry.direction === "desc" ? "desc" : "asc",
    })),
  };
}

export function tableSortOverrideForKey(
  settings: UserSettings,
  tableKey: string,
): TableSortSpec | undefined {
  const stored = settings.tableSorts?.[tableKey];
  return stored ? normalizeTableSort(stored) : undefined;
}

/** User override when set; otherwise `defaultSort`, then global default (name asc). */
export function effectiveTableSort(
  settings: UserSettings,
  tableKey: string,
  defaultSort?: TableSortSpec,
): TableSortSpec {
  return tableSortOverrideForKey(settings, tableKey) ?? normalizeTableSort(defaultSort);
}

export function tableSortForKey(
  settings: UserSettings,
  tableKey: string,
): TableSortSpec {
  return effectiveTableSort(settings, tableKey);
}

export interface ViewSortLike {
  column: string;
  direction: SortDirection;
}

export function viewSortsToTableSort(sorts: ViewSortLike[]): TableSortSpec {
  const orderBy: SortColumn[] = sorts
    .filter((sort) => typeof sort.column === "string" && sort.column.length > 0)
    .map((sort) => ({
      column: sort.column,
      direction: (sort.direction === "desc" ? "desc" : "asc") as SortDirection,
    }));
  return orderBy.length > 0
    ? { orderBy }
    : DEFAULT_TABLE_SORT;
}

export function tableSortToViewSorts(spec: TableSortSpec): ViewSortLike[] {
  return normalizeTableSort(spec).orderBy.map((entry) => ({
    column: entry.column,
    direction: entry.direction,
  }));
}

export function nextSortOnColumnClick(
  current: TableSortSpec,
  column: string,
): SortColumn[] {
  const primary = current.orderBy[0];
  if (primary?.column === column) {
    return [{ column, direction: primary.direction === "asc" ? "desc" : "asc" }];
  }
  return [{ column, direction: "asc" }];
}

function compareValues(a: string, b: string): number {
  const aEmpty = !a.trim();
  const bEmpty = !b.trim();
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

export interface SortableTableRow {
  id: string;
  name: string;
  cells: Record<string, string>;
  relationCells?: RelationSortRow["relationCells"];
}

function compareColumnValues(
  column: string,
  leftValue: string,
  rightValue: string,
  schema?: SchemaFile,
): number {
  const enumCmp = compareEnumLabelsForColumn(
    column,
    leftValue,
    rightValue,
    schema ?? emptySchemaFile(),
  );
  if (enumCmp !== null) return enumCmp;
  return compareValues(leftValue, rightValue);
}

export function sortTableRows<T extends SortableTableRow>(
  rows: T[],
  spec: TableSortSpec,
  schema?: SchemaFile,
): T[] {
  const orderBy = normalizeTableSort(spec).orderBy;
  return [...rows].sort((left, right) => {
    for (const { column, direction } of orderBy) {
      if (column !== "name" && isRelationColumnSort(left, right, column)) {
        const cmp = relationLinkCount(left, column) - relationLinkCount(right, column);
        if (cmp !== 0) return direction === "desc" ? -cmp : cmp;
        continue;
      }
      const leftValue = column === "name" ? left.name : (left.cells[column] ?? "");
      const rightValue = column === "name" ? right.name : (right.cells[column] ?? "");
      const cmp = compareColumnValues(column, leftValue, rightValue, schema);
      if (cmp !== 0) return direction === "desc" ? -cmp : cmp;
    }
    return left.id.localeCompare(right.id);
  });
}

function normalizeTableTabId(tabId: string | null | undefined): string | undefined {
  if (typeof tabId !== "string") return undefined;
  const trimmed = tabId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function applyUserSettingsPatch(
  current: UserSettings,
  patch: UserSettingsPatch,
): UserSettings {
  const next: UserSettings = {
    version: USER_SETTINGS_VERSION,
    tableSorts: current.tableSorts ? { ...current.tableSorts } : undefined,
    tableTabs: current.tableTabs ? { ...current.tableTabs } : undefined,
    blockParameters: current.blockParameters
      ? Object.fromEntries(
          Object.entries(current.blockParameters).map(([key, map]) => [key, { ...map }]),
        )
      : undefined,
    globalSearch: current.globalSearch ? { ...current.globalSearch } : undefined,
    sidebar: current.sidebar ? { ...current.sidebar } : undefined,
    sequencing: current.sequencing ? { ...current.sequencing } : undefined,
  };

  if (patch.tableSorts) {
    if (!next.tableSorts) next.tableSorts = {};
    for (const [key, value] of Object.entries(patch.tableSorts)) {
      if (value === null || isDefaultTableSort(normalizeTableSort(value))) {
        delete next.tableSorts[key];
      } else {
        next.tableSorts[key] = normalizeTableSort(value);
      }
    }
    if (Object.keys(next.tableSorts).length === 0) {
      delete next.tableSorts;
    }
  }

  if (patch.tableTabs) {
    if (!next.tableTabs) next.tableTabs = {};
    for (const [key, value] of Object.entries(patch.tableTabs)) {
      const normalized = normalizeTableTabId(value);
      if (normalized) {
        next.tableTabs[key] = normalized;
      } else {
        delete next.tableTabs[key];
      }
    }
    if (Object.keys(next.tableTabs).length === 0) {
      delete next.tableTabs;
    }
  }

  if (patch.blockParameters) {
    if (!next.blockParameters) next.blockParameters = {};
    for (const [blockKey, value] of Object.entries(patch.blockParameters)) {
      if (value === null) {
        delete next.blockParameters[blockKey];
        continue;
      }
      const currentMap = { ...(next.blockParameters[blockKey] ?? {}) };
      for (const [paramId, paramValue] of Object.entries(value)) {
        if (paramValue === null) {
          delete currentMap[paramId];
        } else if (isBlockParameterValue(paramValue)) {
          if (typeof paramValue === "number" && !Number.isFinite(paramValue)) {
            delete currentMap[paramId];
          } else {
            currentMap[paramId] = paramValue;
          }
        }
      }
      if (Object.keys(currentMap).length === 0) {
        delete next.blockParameters[blockKey];
      } else {
        next.blockParameters[blockKey] = currentMap;
      }
    }
    if (Object.keys(next.blockParameters).length === 0) {
      delete next.blockParameters;
    }
  }

  if (patch.globalSearch !== undefined) {
    if (patch.globalSearch === null) {
      delete next.globalSearch;
    } else {
      const normalized = normalizeGlobalSearch(patch.globalSearch);
      if (normalized) {
        next.globalSearch = normalized;
      } else {
        delete next.globalSearch;
      }
    }
  }

  if (patch.sidebar !== undefined) {
    if (patch.sidebar === null) {
      delete next.sidebar;
    } else {
      const normalized = normalizeSidebar(patch.sidebar);
      if (normalized) {
        next.sidebar = normalized;
      } else {
        delete next.sidebar;
      }
    }
  }

  if (patch.sequencing !== undefined) {
    if (patch.sequencing === null) {
      delete next.sequencing;
    } else {
      const normalized = normalizeSequencing(patch.sequencing);
      if (normalized) {
        next.sequencing = normalized;
      } else {
        delete next.sequencing;
      }
    }
  }

  return next;
}

export function parseUserSettings(raw: unknown): UserSettings {
  if (!raw || typeof raw !== "object") return emptyUserSettings();
  const record = raw as Record<string, unknown>;
  const version = record.version;
  if (version !== USER_SETTINGS_VERSION) return emptyUserSettings();

  const settings = emptyUserSettings();
  const tableSorts = record.tableSorts;
  if (tableSorts && typeof tableSorts === "object" && !Array.isArray(tableSorts)) {
    const parsed: Record<string, TableSortSpec> = {};
    for (const [key, value] of Object.entries(tableSorts)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const spec = normalizeTableSort(value as TableSortSpec);
      if (!isDefaultTableSort(spec)) {
        parsed[key] = spec;
      }
    }
    if (Object.keys(parsed).length > 0) {
      settings.tableSorts = parsed;
    }
  }

  const tableTabs = record.tableTabs;
  if (tableTabs && typeof tableTabs === "object" && !Array.isArray(tableTabs)) {
    const parsed: Record<string, string> = {};
    for (const [key, value] of Object.entries(tableTabs)) {
      const normalized = normalizeTableTabId(value as string);
      if (normalized) parsed[key] = normalized;
    }
    if (Object.keys(parsed).length > 0) {
      settings.tableTabs = parsed;
    }
  }

  const blockParameters = record.blockParameters;
  if (blockParameters && typeof blockParameters === "object" && !Array.isArray(blockParameters)) {
    const parsed: Record<string, Record<string, BlockParameterValue>> = {};
    for (const [key, value] of Object.entries(blockParameters)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const map = normalizeBlockParameterMap(value as Record<string, unknown>);
      if (map) parsed[key] = map;
    }
    if (Object.keys(parsed).length > 0) {
      settings.blockParameters = parsed;
    }
  }

  const globalSearch = record.globalSearch;
  if (globalSearch && typeof globalSearch === "object" && !Array.isArray(globalSearch)) {
    const normalized = normalizeGlobalSearch(globalSearch as GlobalSearchSettings);
    if (normalized) {
      settings.globalSearch = normalized;
    }
  }

  const sidebar = record.sidebar;
  if (sidebar && typeof sidebar === "object" && !Array.isArray(sidebar)) {
    const normalized = normalizeSidebar(sidebar as SidebarSettings);
    if (normalized) {
      settings.sidebar = normalized;
    }
  }

  const sequencing = record.sequencing;
  if (sequencing && typeof sequencing === "object" && !Array.isArray(sequencing)) {
    const normalized = normalizeSequencing(sequencing as SequencingSettings);
    if (normalized) {
      settings.sequencing = normalized;
    }
  }

  return settings;
}
