import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSearchSqliteModule } from "../src/module";
import { buildFtsMatchQuery } from "../src/fts-search";
import { register } from "../src/search";
import type { SearchDocument } from "../src/fts-store";
import type { SearcherHost, SearcherRegistration } from "tome-interfaces/search";
import type { SyncSourceRead } from "tome-db/sync";

describe("tome-search-sqlite", () => {
  let tempDir: string;

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  function openWithDocs(docs: SearchDocument[]) {
    tempDir = mkdtempSync(join(tmpdir(), "tome-search-sqlite-"));
    const dbPath = join(tempDir, "fts.sqlite");
    const byId = new Map(docs.map((d) => [d.id, d]));
    const handle = createSearchSqliteModule().open({
      dbPath,
      clean: true,
      listDocuments: () => docs,
      getDocument: (id) => byId.get(id) ?? null,
    });
    return handle;
  }

  const emptySource: SyncSourceRead = {
    executeImp() {
      return { columns: ["id"], rows: [] };
    },
  };

  test("buildFtsMatchQuery phrases and escapes quotes", () => {
    expect(buildFtsMatchQuery("  hello world  ")).toBe('"hello world"*');
    expect(buildFtsMatchQuery('say "hi"')).toBe('"say ""hi"""*');
    expect(buildFtsMatchQuery("   ")).toBeNull();
  });

  test("apply full + search returns ranked hits", async () => {
    const handle = openWithDocs([
      {
        id: "n1",
        title: "Dragon Quest",
        body: "an adventure about dragons",
        typeIds: ["creature"],
      },
      {
        id: "n2",
        title: "Quiet Lake",
        body: "no dragons here",
        typeIds: ["place"],
      },
      {
        id: "n3",
        title: "Unrelated",
        body: "something else",
      },
    ]);

    await handle.endpoint.apply({ source: emptySource, scope: { mode: "full" } });
    const hits = await handle.search.search({ query: "dragon", limit: 10 });
    expect(hits.map((h) => h.id)).toContain("n1");
    expect(hits.map((h) => h.id)).toContain("n2");
    expect(hits.map((h) => h.id)).not.toContain("n3");
    handle.close();
  });

  test("allowedTypeIds filters via node_type_ids join", async () => {
    const handle = openWithDocs([
      { id: "a", title: "Alpha Mark", typeIds: ["features"] },
      { id: "b", title: "Beta Mark", typeIds: ["other"] },
    ]);
    await handle.endpoint.apply({ source: emptySource, scope: { mode: "full" } });

    const hits = await handle.search.search({
      query: "Mark",
      limit: 10,
      allowedTypeIds: ["features"],
    });
    expect(hits.map((h) => h.id)).toEqual(["a"]);
    handle.close();
  });

  test("allowedNodeIds filters in SQL", async () => {
    const handle = openWithDocs([
      { id: "keep", title: "Shared Token" },
      { id: "drop", title: "Shared Token Two" },
    ]);
    await handle.endpoint.apply({ source: emptySource, scope: { mode: "full" } });

    const hits = await handle.search.search({
      query: "Shared",
      limit: 10,
      allowedNodeIds: new Set(["keep"]),
    });
    expect(hits.map((h) => h.id)).toEqual(["keep"]);
    handle.close();
  });

  test("partial apply upserts and deletes", async () => {
    const docs: SearchDocument[] = [
      { id: "p1", title: "Partial One", body: "alpha marker" },
    ];
    const byId = new Map(docs.map((d) => [d.id, d]));
    tempDir = mkdtempSync(join(tmpdir(), "tome-search-sqlite-"));
    const handle = createSearchSqliteModule().open({
      dbPath: join(tempDir, "partial.sqlite"),
      clean: true,
      listDocuments: () => [...byId.values()],
      getDocument: (id) => byId.get(id) ?? null,
    });

    await handle.endpoint.apply({ source: emptySource, scope: { mode: "full" } });
    expect(
      (await handle.search.search({ query: "alpha", limit: 5 })).map((h) => h.id),
    ).toEqual(["p1"]);

    byId.set("p2", { id: "p2", title: "Partial Two", body: "alpha marker too" });
    await handle.endpoint.apply({
      source: emptySource,
      scope: {
        mode: "partial",
        changes: {
          nodes: { created: ["p2"], modified: [], deleted: [] },
          relationships: { created: [], modified: [], deleted: [] },
        },
      },
    });
    expect(
      (await handle.search.search({ query: "alpha", limit: 5 })).map((h) => h.id).sort(),
    ).toEqual(["p1", "p2"]);

    byId.delete("p1");
    await handle.endpoint.apply({
      source: emptySource,
      scope: {
        mode: "partial",
        changes: {
          nodes: { created: [], modified: [], deleted: ["p1"] },
          relationships: { created: [], modified: [], deleted: [] },
        },
      },
    });
    expect(
      (await handle.search.search({ query: "alpha", limit: 5 })).map((h) => h.id),
    ).toEqual(["p2"]);

    handle.close();
  });

  test("body match attaches matchPreview", async () => {
    const handle = openWithDocs([
      {
        id: "body1",
        title: "Title Without Term",
        body: "prefix unique-fts-preview-marker suffix",
      },
    ]);
    await handle.endpoint.apply({ source: emptySource, scope: { mode: "full" } });
    const hits = await handle.search.search({
      query: "unique-fts-preview-marker",
      limit: 5,
    });
    expect(hits[0]?.matchPreview?.parts.some((p) => p.highlight)).toBe(true);
    handle.close();
  });

  test("register resolves backend via getSearcherBackend", async () => {
    const handle = openWithDocs([{ id: "r1", title: "Registry Hit" }]);
    await handle.endpoint.apply({ source: emptySource, scope: { mode: "full" } });

    const registrations: SearcherRegistration[] = [];
    const host: SearcherHost = {
      registerSearcher(registration) {
        registrations.push(registration);
      },
    };
    register(host);
    const opened = await registrations[0]!.open({
      params: { dataStoreId: "fts" },
      host: {
        getSearcherBackend(id) {
          expect(id).toBe("fts");
          return handle.search;
        },
      },
    });
    const hits = await opened.search({ query: "Registry", limit: 5 });
    expect(hits.map((h) => h.id)).toEqual(["r1"]);
    handle.close();
  });
});
