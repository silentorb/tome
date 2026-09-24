import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseServerConfig, startConfiguredServices, normalizeServerConfig } from "../src/load-services";
import type { TomeGraphServices } from "tome-graph-interfaces";
import type { TomeServerModuleConfigEntry } from "tome-service-interfaces";

const STORE_ENTRY: TomeServerModuleConfigEntry = {
  id: "flatfile",
  module: "tome-flatfile",
  export: "createFlatfileModule",
  options: {},
};

const CACHE_ENTRY: TomeServerModuleConfigEntry = {
  id: "sqlite",
  module: "tome-sqlite",
  export: "createSqliteModule",
  options: {},
};

function stubGraph(): TomeGraphServices {
  return {
    close() {},
  } as TomeGraphServices;
}

describe("tome-server config", () => {
  test("allows empty services list", () => {
    const config = parseServerConfig({
      version: 1,
      store: STORE_ENTRY,
      cache: CACHE_ENTRY,
      services: [],
    });
    expect(config.services).toEqual([]);
    expect(config.store?.module).toBe("tome-flatfile");
    expect(config.cache?.module).toBe("tome-sqlite");
  });

  test("requires store+cache or dataStores", () => {
    expect(() => parseServerConfig({ version: 1, services: [] })).toThrow(/dataStores|store/);
  });

  test("normalizes legacy store+cache into dataStores", () => {
    const normalized = normalizeServerConfig({
      version: 1,
      store: STORE_ENTRY,
      cache: CACHE_ENTRY,
      services: [],
    });
    expect(normalized.dataStores.flatfile?.module).toBe("tome-flatfile");
    expect(normalized.dataStores.sqlite?.module).toBe("tome-sqlite");
    expect(normalized.dataStores.fts?.module).toBe("tome-search-sqlite");
    expect(normalized.sync.queryStoreId).toBe("sqlite");
  });

  test("does not treat FTS dataStore as the query cache", () => {
    const normalized = normalizeServerConfig({
      version: 2,
      dataStores: {
        marloth: {
          id: "marloth",
          module: "tome-flatfile",
          export: "createFlatfileModule",
          options: { contentPath: "/tmp/m" },
        },
        fts: {
          id: "fts",
          module: "tome-search-sqlite",
          export: "createSearchSqliteModule",
          options: {},
        },
        sqlite: {
          id: "sqlite",
          module: "tome-sqlite",
          export: "createSqliteModule",
          options: { dbPath: "/tmp/t.sqlite" },
        },
      },
      services: [],
    });
    expect(normalized.sync.queryStoreId).toBe("sqlite");
    expect(normalized.dataStores.fts?.module).toBe("tome-search-sqlite");
  });

  test("injects FTS sink when dataStores omit search-sqlite", () => {
    const normalized = normalizeServerConfig({
      version: 2,
      dataStores: {
        marloth: {
          id: "marloth",
          module: "tome-flatfile",
          export: "createFlatfileModule",
          options: { contentPath: "/tmp/m" },
        },
        cache: {
          id: "cache",
          module: "tome-sqlite",
          export: "createSqliteModule",
          options: { dbPath: "/tmp/t.sqlite" },
        },
      },
      sync: { queryStoreId: "cache" },
      services: [],
    });
    expect(normalized.dataStores.fts?.export).toBe("createSearchSqliteModule");
    expect(normalized.sync.queryStoreId).toBe("cache");
  });

  test("parses dataStores config", () => {
    const config = parseServerConfig({
      version: 2,
      dataStores: {
        marloth: {
          id: "marloth",
          module: "tome-flatfile",
          export: "createFlatfileModule",
          options: { contentPath: "/tmp/m", access: "readwrite" },
        },
        cache: {
          id: "cache",
          module: "tome-sqlite",
          export: "createSqliteModule",
          options: { dbPath: "/tmp/t.sqlite" },
        },
      },
      sync: { queryStoreId: "cache" },
      services: [],
    });
    expect(config.dataStores?.marloth?.module).toBe("tome-flatfile");
    const n = normalizeServerConfig(config);
    expect(n.sync.queryStoreId).toBe("cache");
    expect(n.store.id).toBe("marloth");
    expect(n.dataStores.fts?.module).toBe("tome-search-sqlite");
  });

  test("startConfiguredServices warns and continues when empty", async () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(String(args[0]));
    };
    try {
      const started = await startConfiguredServices(stubGraph(), {
        version: 1,
        store: STORE_ENTRY,
        cache: CACHE_ENTRY,
        services: [],
      });
      expect(started.modules).toEqual([]);
      expect(warnings.some((w) => w.includes("no service modules"))).toBe(true);
      await started.stop();
    } finally {
      console.warn = original;
    }
  });

  test("default config file parses", () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-server-config-"));
    const path = join(dir, "tome-server.json");
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        store: STORE_ENTRY,
        cache: CACHE_ENTRY,
        services: [
          {
            id: "http",
            module: "tome-http",
            export: "createTomeHttpService",
            options: { port: 3847 },
          },
        ],
      }),
    );
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    const config = parseServerConfig(raw);
    expect(config.services[0]?.module).toBe("tome-http");
    expect(config.store?.id).toBe("flatfile");
    expect(config.cache?.id).toBe("sqlite");
    rmSync(dir, { recursive: true, force: true });
  });
});
