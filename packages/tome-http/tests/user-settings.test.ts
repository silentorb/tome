import { describe, expect, test } from "bun:test";
import {
  applyUserSettingsPatch,
  parseUserSettings,
  sequencingShowDependencyEdges,
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
