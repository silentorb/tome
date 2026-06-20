import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GraphDatabase } from "tome-db";
import { pickExistingDbPath } from "../../src/api/paths";

describe("pickExistingDbPath", () => {
  test("prefers populated database over empty stub", () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-editor-db-resolve-"));
    const emptyPath = join(dir, "empty.sqlite");
    const repoPath = join(dir, "full.sqlite");

    new GraphDatabase(emptyPath);
    const repoDb = new GraphDatabase(repoPath);
    repoDb.upsertNode("page1", { title: "Alpha" });
    repoDb.close();

    expect(pickExistingDbPath([emptyPath, repoPath], emptyPath)).toBe(repoPath);

    rmSync(dir, { recursive: true, force: true });
  });
});
