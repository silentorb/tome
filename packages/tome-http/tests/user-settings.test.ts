import { describe, expect, test } from "bun:test";
import {
  applyUserSettingsPatch,
  parseUserSettings,
  sequencingShowDependencyEdges,
  relationshipsOnlyActiveTargets,
  relationshipsRecentAssociationTypes,
  pushRecentAssociationType,
  MAX_RECENT_ASSOCIATION_TYPES,
} from "../src/user-settings";

describe("user-settings sequencing chrome", () => {
  test("showDependencyEdges is sparse and patchable", () => {
    expect(sequencingShowDependencyEdges({ version: 1 })).toBe(false);

    const enabled = applyUserSettingsPatch(
      { version: 1 },
      { sequencing: { showDependencyEdges: true } },
    );
    expect(sequencingShowDependencyEdges(enabled)).toBe(true);

    const cleared = applyUserSettingsPatch(enabled, { sequencing: { showDependencyEdges: false } });
    expect(cleared.sequencing).toBeUndefined();

    const parsed = parseUserSettings({
      version: 1,
      sequencing: { showDependencyEdges: true },
    });
    expect(sequencingShowDependencyEdges(parsed)).toBe(true);
  });
});

describe("user-settings relationships picker prefs", () => {
  test("onlyActiveTargets defaults true and stores false sparsely", () => {
    expect(relationshipsOnlyActiveTargets({ version: 1 })).toBe(true);

    const disabled = applyUserSettingsPatch(
      { version: 1 },
      { relationships: { onlyActiveTargets: false } },
    );
    expect(relationshipsOnlyActiveTargets(disabled)).toBe(false);
    expect(disabled.relationships).toEqual({ onlyActiveTargets: false });

    const reenabled = applyUserSettingsPatch(disabled, {
      relationships: { onlyActiveTargets: true },
    });
    expect(reenabled.relationships).toBeUndefined();
  });

  test("recentAssociationTypes are MRU and merge with onlyActive", () => {
    expect(pushRecentAssociationType(["a:0"], "b:1")).toEqual(["b:1", "a:0"]);
    const many = Array.from({ length: MAX_RECENT_ASSOCIATION_TYPES + 2 }, (_, i) => `t${i}:0`);
    expect(pushRecentAssociationType(many.slice(1), many[0]!)).toHaveLength(
      MAX_RECENT_ASSOCIATION_TYPES,
    );

    const withRecent = applyUserSettingsPatch(
      { version: 1 },
      { relationships: { recentAssociationTypes: ["x:0"] } },
    );
    expect(relationshipsRecentAssociationTypes(withRecent)).toEqual(["x:0"]);

    const withBoth = applyUserSettingsPatch(withRecent, {
      relationships: { onlyActiveTargets: false },
    });
    expect(withBoth.relationships).toEqual({
      recentAssociationTypes: ["x:0"],
      onlyActiveTargets: false,
    });
  });
});
