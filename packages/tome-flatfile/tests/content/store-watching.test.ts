import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ContentStore } from "../../src/content/store";
import { contentModelDir, viewsFilePath } from "../../src/content/paths";
import type { StoreChangeEvent } from "tome-service-interfaces";

describe("ContentStore watching", () => {
  test("subscribe receives debounced StoreChangeEvent for model files", async () => {
    const root = mkdtempSync(join(tmpdir(), "tome-store-watch-"));
    const contentDir = join(root, "content");
    mkdirSync(contentModelDir(contentDir), { recursive: true });
    const store = new ContentStore(contentDir);
    const events: StoreChangeEvent[] = [];
    store.subscribe((e) => events.push(e));
    store.startWatching();

    writeFileSync(
      viewsFilePath(contentDir),
      JSON.stringify({ version: 2, views: [] }) + "\n",
      "utf-8",
    );

    await new Promise((r) => setTimeout(r, 350));
    store.close();

    expect(events.some((e) => e.kind === "views" && e.path === "views.json")).toBe(true);
  });
});
