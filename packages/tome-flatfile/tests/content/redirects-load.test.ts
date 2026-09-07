import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  invalidateRedirectsCache,
  loadRedirectsFromContent,
} from "../../src/redirects/load";

describe("loadRedirectsFromContent", () => {
  const dirs: string[] = [];

  afterEach(() => {
    invalidateRedirectsCache();
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns empty map when file is missing", () => {
    const contentDir = mkdtempSync(join(tmpdir(), "redirects-load-"));
    dirs.push(contentDir);
    expect(loadRedirectsFromContent(contentDir)).toEqual({ version: 1, redirects: {} });
  });

  test("loads redirects.json from model/", () => {
    const contentDir = mkdtempSync(join(tmpdir(), "redirects-load-"));
    dirs.push(contentDir);
    mkdirSync(join(contentDir, "model"), { recursive: true });
    writeFileSync(
      join(contentDir, "model", "redirects.json"),
      JSON.stringify({
        version: 1,
        redirects: { "old/page": "01KWN86X6KNBWXKBG5EGFMQJXA" },
      }),
    );
    expect(loadRedirectsFromContent(contentDir).redirects).toEqual({
      "old/page": "01KWN86X6KNBWXKBG5EGFMQJXA",
    });
  });
});
