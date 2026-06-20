import { describe, expect, test } from "bun:test";
import {
  applyUserSettingsPatch,
  databaseTableSortKey,
  DEFAULT_SIDEBAR_RECENT_MAX_ITEMS,
  effectiveTableTab,
  globalSearchIncludeBody,
  nodeTableTabKey,
  sidebarRecentMaxItems,
  isDefaultTableSort,
  nextSortOnColumnClick,
  normalizeTableSort,
  parseUserSettings,
  relationTableSortKey,
  sortTableRows,
  effectiveTableSort,
  tableSortForKey,
  tableTabOverrideForKey,
  viewSortsToTableSort,
} from "../../src/shared/user-settings";

describe("user-settings", () => {
  test("relation and database table keys are stable", () => {
    expect(relationTableSortKey("abc", "RELATED")).toBe("records/abc/relations/RELATED");
    expect(databaseTableSortKey("page", "db", "Default")).toBe(
      "records/page/database/db/Default",
    );
    expect(nodeTableTabKey("page")).toBe("records/page/tab");
  });

  test("table tab overrides are sparse and URL wins over saved tab", () => {
    const settings = {
      version: 1 as const,
      tableTabs: {
        "records/db/tab": "Weighted",
      },
    };
    expect(tableTabOverrideForKey(settings, "records/db/tab")).toBe("Weighted");
    expect(effectiveTableTab(settings, "db")).toBe("Weighted");
    expect(effectiveTableTab(settings, "db", "all")).toBe("all");

    const patched = applyUserSettingsPatch(settings, {
      tableTabs: { "records/db/tab": "prioritized" },
    });
    expect(patched.tableTabs?.["records/db/tab"]).toBe("prioritized");

    const cleared = applyUserSettingsPatch(patched, {
      tableTabs: { "records/db/tab": null },
    });
    expect(cleared.tableTabs).toBeUndefined();
  });

  test("default sort is name ascending and is not persisted", () => {
    expect(isDefaultTableSort({ orderBy: [{ column: "name", direction: "asc" }] })).toBe(true);
    expect(isDefaultTableSort({ orderBy: [{ column: "name", direction: "desc" }] })).toBe(false);
  });

  test("nextSortOnColumnClick toggles active column and switches columns", () => {
    const current = { orderBy: [{ column: "name", direction: "asc" as const }] };
    expect(nextSortOnColumnClick(current, "name")).toEqual([
      { column: "name", direction: "desc" },
    ]);
    expect(nextSortOnColumnClick(current, "priority")).toEqual([
      { column: "priority", direction: "asc" },
    ]);
  });

  test("effectiveTableSort uses tab default until user overrides", () => {
    const settings = {
      version: 1 as const,
      tableSorts: {
        "records/db": { orderBy: [{ column: "name", direction: "desc" as const }] },
      },
    };
    const tabDefault = viewSortsToTableSort([{ column: "priority", direction: "desc" }]);

    expect(effectiveTableSort({ version: 1 }, "records/db", tabDefault)).toEqual(tabDefault);
    expect(effectiveTableSort(settings, "records/db", tabDefault).orderBy[0]?.column).toBe("name");
  });

  test("viewSortsToTableSort maps view sort specs to table sort specs", () => {
    expect(
      viewSortsToTableSort([
        { column: "priority", direction: "desc" },
        { column: "name", direction: "asc" },
      ]),
    ).toEqual({
      orderBy: [
        { column: "priority", direction: "desc" },
        { column: "name", direction: "asc" },
      ],
    });
  });

  test("sortTableRows supports multi-column order specs", () => {
    const rows = [
      { id: "1", name: "Beta", cells: { priority: "High" } },
      { id: "2", name: "Alpha", cells: { priority: "High" } },
      { id: "3", name: "Gamma", cells: { priority: "Low" } },
    ];

    const byPriorityDesc = sortTableRows(rows, {
      orderBy: [
        { column: "priority", direction: "desc" },
        { column: "name", direction: "asc" },
      ],
    });

    expect(byPriorityDesc.map((row) => row.name)).toEqual(["Alpha", "Beta", "Gamma"]);

    const byPriorityAsc = sortTableRows(rows, {
      orderBy: [
        { column: "priority", direction: "asc" },
        { column: "name", direction: "asc" },
      ],
    });

    expect(byPriorityAsc.map((row) => row.name)).toEqual(["Gamma", "Alpha", "Beta"]);
  });

  test("sortTableRows sorts relation fields by link count", () => {
    const rows = [
      {
        id: "1",
        name: "Few",
        cells: { inspirations: "Alpha, Beta" },
        relationCells: {
          inspirations: [
            { targetId: "a", title: "Alpha" },
            { targetId: "b", title: "Beta" },
          ],
        },
      },
      {
        id: "2",
        name: "Many",
        cells: { inspirations: "One, Two, Three" },
        relationCells: {
          inspirations: [
            { targetId: "1", title: "One" },
            { targetId: "2", title: "Two" },
            { targetId: "3", title: "Three" },
          ],
        },
      },
      {
        id: "3",
        name: "None",
        cells: {} as Record<string, string>,
        relationCells: { inspirations: [] },
      },
    ];

    const sorted = sortTableRows(rows, {
      orderBy: [{ column: "inspirations", direction: "desc" }],
    });

    expect(sorted.map((row) => row.name)).toEqual(["Many", "Few", "None"]);
  });

  test("applyUserSettingsPatch stores sparse overrides only", () => {
    const base = { version: 1 as const };
    const withOverride = applyUserSettingsPatch(base, {
      tableSorts: {
        "records/a/relations/X": { orderBy: [{ column: "priority", direction: "desc" }] },
      },
    });
    expect(withOverride.tableSorts?.["records/a/relations/X"]).toEqual({
      orderBy: [{ column: "priority", direction: "desc" }],
    });

    const cleared = applyUserSettingsPatch(withOverride, {
      tableSorts: {
        "records/a/relations/X": { orderBy: [{ column: "name", direction: "asc" }] },
      },
    });
    expect(cleared.tableSorts).toBeUndefined();
  });

  test("globalSearch includeBody is sparse and patchable", () => {
    expect(globalSearchIncludeBody({ version: 1 })).toBe(false);

    const enabled = applyUserSettingsPatch(
      { version: 1 },
      { globalSearch: { includeBody: true } },
    );
    expect(globalSearchIncludeBody(enabled)).toBe(true);
    expect(enabled.globalSearch).toEqual({ includeBody: true });

    const cleared = applyUserSettingsPatch(enabled, { globalSearch: null });
    expect(cleared.globalSearch).toBeUndefined();

    const parsed = parseUserSettings({
      version: 1,
      globalSearch: { includeBody: true },
    });
    expect(globalSearchIncludeBody(parsed)).toBe(true);

    const parsedOff = parseUserSettings({
      version: 1,
      globalSearch: { includeBody: false },
    });
    expect(parsedOff.globalSearch).toBeUndefined();
  });

  test("sidebarRecentMaxItems defaults and clamps", () => {
    expect(sidebarRecentMaxItems({ version: 1 })).toBe(DEFAULT_SIDEBAR_RECENT_MAX_ITEMS);
    expect(
      sidebarRecentMaxItems({ version: 1, sidebar: { recentMaxItems: 12 } }),
    ).toBe(12);
    expect(
      sidebarRecentMaxItems({ version: 1, sidebar: { recentMaxItems: 0 } }),
    ).toBe(1);
    expect(
      sidebarRecentMaxItems({ version: 1, sidebar: { recentMaxItems: 500 } }),
    ).toBe(100);
  });

  test("sidebar recentMaxItems is sparse and patchable", () => {
    const enabled = applyUserSettingsPatch(
      { version: 1 },
      { sidebar: { recentMaxItems: 12 } },
    );
    expect(sidebarRecentMaxItems(enabled)).toBe(12);
    expect(enabled.sidebar).toEqual({ recentMaxItems: 12 });

    const cleared = applyUserSettingsPatch(enabled, { sidebar: null });
    expect(cleared.sidebar).toBeUndefined();
    expect(sidebarRecentMaxItems(cleared)).toBe(DEFAULT_SIDEBAR_RECENT_MAX_ITEMS);

    const parsed = parseUserSettings({
      version: 1,
      sidebar: { recentMaxItems: 10 },
    });
    expect(sidebarRecentMaxItems(parsed)).toBe(10);

    const parsedDefault = parseUserSettings({
      version: 1,
      sidebar: { recentMaxItems: DEFAULT_SIDEBAR_RECENT_MAX_ITEMS },
    });
    expect(parsedDefault.sidebar).toBeUndefined();
  });

  test("parseUserSettings drops default sorts and invalid entries", () => {
    const parsed = parseUserSettings({
      version: 1,
      tableSorts: {
        keep: { orderBy: [{ column: "priority", direction: "asc" }] },
        drop: { orderBy: [{ column: "name", direction: "asc" }] },
        bad: { orderBy: [] },
      },
      tableTabs: {
        keep: "Weighted",
        drop: "",
        bad: 1,
      },
    });

    expect(tableSortForKey(parsed, "keep").orderBy[0]?.column).toBe("priority");
    expect(parsed.tableSorts?.drop).toBeUndefined();
    expect(parsed.tableSorts?.bad).toBeUndefined();
    expect(parsed.tableTabs?.keep).toBe("Weighted");
    expect(parsed.tableTabs?.drop).toBeUndefined();
    expect(parsed.tableTabs?.bad).toBeUndefined();
    expect(normalizeTableSort(undefined)).toEqual({
      orderBy: [{ column: "name", direction: "asc" }],
    });
  });
});
