import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { EditorApiClient } from "../../shared/http-client";
import type { SchemaFile } from "tome-graph-interfaces";
import { emptySchemaFile } from "tome-flatfile/schema-file";
import {
  applyUserSettingsPatch,
  blockParametersForKey,
  blockParametersKey,
  emptyUserSettings,
  globalSearchIncludeBody,
  sidebarRecentMaxItems,
  isDefaultTableSort,
  nextSortOnColumnClick,
  normalizeTableSort,
  effectiveTableSort,
  tableSortOverrideForKey,
  tableTabOverrideForKey,
  type BlockParameterValue,
  type SortColumn,
  type TableSortSpec,
  type UserSettings,
} from "../../shared/user-settings";

interface UserSettingsContextValue {
  ready: boolean;
  schema: SchemaFile;
  hasTableSortOverride: (tableKey: string) => boolean;
  getTableSort: (tableKey: string, defaultSort?: TableSortSpec) => TableSortSpec;
  setTableSortColumns: (tableKey: string, orderBy: SortColumn[]) => void;
  toggleTableSortColumn: (
    tableKey: string,
    column: string,
    defaultSort?: TableSortSpec,
  ) => void;
  getTableTab: (tabKey: string) => string | undefined;
  setTableTab: (tabKey: string, tabId: string | null) => void;
  getBlockParameters: (
    nodeId: string,
    componentId: string,
  ) => Record<string, BlockParameterValue>;
  setBlockParameter: (
    nodeId: string,
    componentId: string,
    paramId: string,
    value: BlockParameterValue | null,
  ) => void;
  globalSearchIncludeBody: boolean;
  setGlobalSearchIncludeBody: (includeBody: boolean) => void;
  sidebarRecentMaxItems: number;
}

const UserSettingsContext = createContext<UserSettingsContextValue | null>(null);

interface UserSettingsProviderProps {
  api: EditorApiClient;
  children: ReactNode;
}

export function UserSettingsProvider({ api, children }: UserSettingsProviderProps) {
  const [settings, setSettings] = useState<UserSettings>(() => emptyUserSettings());
  const [schema, setSchema] = useState<SchemaFile>(() => emptySchemaFile());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [loaded, loadedSchema] = await Promise.all([
          api.getUserSettings(),
          api.getSchema(),
        ]);
        if (!cancelled) {
          setSettings(loaded);
          setSchema(loadedSchema);
          setReady(true);
        }
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const hasTableSortOverride = useCallback(
    (tableKey: string): boolean => tableSortOverrideForKey(settings, tableKey) !== undefined,
    [settings],
  );

  const getTableSort = useCallback(
    (tableKey: string, defaultSort?: TableSortSpec): TableSortSpec =>
      effectiveTableSort(settings, tableKey, defaultSort),
    [settings],
  );

  const persistTableSort = useCallback(
    (tableKey: string, orderBy: SortColumn[]) => {
      const spec = normalizeTableSort({ orderBy });
      const patchValue = isDefaultTableSort(spec) ? null : spec;

      setSettings((current) => {
        const next = applyUserSettingsPatch(current, {
          tableSorts: { [tableKey]: patchValue },
        });
        void api.patchUserSettings({ tableSorts: { [tableKey]: patchValue } }).catch(() => {
          /* keep optimistic local state */
        });
        return next;
      });
    },
    [api],
  );

  const setTableSortColumns = useCallback(
    (tableKey: string, orderBy: SortColumn[]) => {
      persistTableSort(tableKey, orderBy);
    },
    [persistTableSort],
  );

  const toggleTableSortColumn = useCallback(
    (tableKey: string, column: string, defaultSort?: TableSortSpec) => {
      const current = getTableSort(tableKey, defaultSort);
      persistTableSort(tableKey, nextSortOnColumnClick(current, column));
    },
    [getTableSort, persistTableSort],
  );

  const setGlobalSearchIncludeBody = useCallback(
    (includeBody: boolean) => {
      const patch = { globalSearch: includeBody ? { includeBody: true as const } : null };
      setSettings((current) => {
        const next = applyUserSettingsPatch(current, patch);
        void api.patchUserSettings(patch).catch(() => {
          /* keep optimistic local state */
        });
        return next;
      });
    },
    [api],
  );

  const getTableTab = useCallback(
    (tabKey: string): string | undefined => tableTabOverrideForKey(settings, tabKey),
    [settings],
  );

  const setTableTab = useCallback(
    (tabKey: string, tabId: string | null) => {
      const patch = { tableTabs: { [tabKey]: tabId } };
      setSettings((current) => {
        const next = applyUserSettingsPatch(current, patch);
        void api.patchUserSettings(patch).catch(() => {
          /* keep optimistic local state */
        });
        return next;
      });
    },
    [api],
  );

  const getBlockParameters = useCallback(
    (nodeId: string, componentId: string): Record<string, BlockParameterValue> =>
      blockParametersForKey(settings, blockParametersKey(nodeId, componentId)),
    [settings],
  );

  const setBlockParameter = useCallback(
    (
      nodeId: string,
      componentId: string,
      paramId: string,
      value: BlockParameterValue | null,
    ) => {
      const key = blockParametersKey(nodeId, componentId);
      const patch = { blockParameters: { [key]: { [paramId]: value } } };
      setSettings((current) => {
        const next = applyUserSettingsPatch(current, patch);
        void api.patchUserSettings(patch).catch(() => {
          /* keep optimistic local state */
        });
        return next;
      });
    },
    [api],
  );

  const value = useMemo(
    (): UserSettingsContextValue => ({
      ready,
      schema,
      hasTableSortOverride,
      getTableSort,
      setTableSortColumns,
      toggleTableSortColumn,
      getTableTab,
      setTableTab,
      getBlockParameters,
      setBlockParameter,
      globalSearchIncludeBody: globalSearchIncludeBody(settings),
      setGlobalSearchIncludeBody,
      sidebarRecentMaxItems: sidebarRecentMaxItems(settings),
    }),
    [
      ready,
      schema,
      settings,
      hasTableSortOverride,
      getTableSort,
      setTableSortColumns,
      toggleTableSortColumn,
      getTableTab,
      setTableTab,
      getBlockParameters,
      setBlockParameter,
      setGlobalSearchIncludeBody,
    ],
  );

  return <UserSettingsContext.Provider value={value}>{children}</UserSettingsContext.Provider>;
}

export function useUserSettings(): UserSettingsContextValue {
  const context = useContext(UserSettingsContext);
  if (!context) {
    throw new Error("useUserSettings must be used within UserSettingsProvider");
  }
  return context;
}
