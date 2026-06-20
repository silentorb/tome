import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { UserSettingsStore } from "../../src/api/user-settings-store";

describe("UserSettingsStore", () => {
  test("reads empty settings when file is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-user-settings-"));
    const path = join(dir, "user-settings.json");
    const store = new UserSettingsStore(path);

    expect(store.read()).toEqual({ version: 1 });

    rmSync(dir, { recursive: true, force: true });
  });

  test("persists sparse table sort overrides", () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-user-settings-"));
    const path = join(dir, "user-settings.json");
    const store = new UserSettingsStore(path);
    const tableKey = "records/page/relations/RELATED";

    store.patch({
      tableSorts: {
        [tableKey]: { orderBy: [{ column: "priority", direction: "desc" }] },
      },
    });

    const raw = JSON.parse(readFileSync(path, "utf8")) as {
      tableSorts?: Record<string, unknown>;
    };
    expect(raw.tableSorts?.[tableKey]).toEqual({
      orderBy: [{ column: "priority", direction: "desc" }],
    });

    store.patch({
      tableSorts: {
        [tableKey]: { orderBy: [{ column: "name", direction: "asc" }] },
      },
    });

    const cleared = JSON.parse(readFileSync(path, "utf8")) as {
      tableSorts?: Record<string, unknown>;
    };
    expect(cleared.tableSorts).toBeUndefined();

    rmSync(dir, { recursive: true, force: true });
  });
});
