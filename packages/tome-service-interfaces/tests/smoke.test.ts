import { describe, expect, test } from "bun:test";
import type {
  TomeServiceModule,
  TomeServerConfig,
  TomeStoreModule,
  TomeCacheModule,
  TomeDataStore,
  StoreChangeEvent,
} from "../src/index";

describe("tome-service-interfaces", () => {
  test("config shape requires store and cache", () => {
    const config: TomeServerConfig = {
      version: 1,
      store: { id: "flatfile", module: "tome-store-flatfile", export: "createFlatfileStoreModule" },
      cache: { id: "sqlite", module: "tome-cache-sqlite", export: "createSqliteCacheModule" },
      services: [],
    };
    expect(config.services).toEqual([]);
    expect(config.store.id).toBe("flatfile");
    expect(config.cache.id).toBe("sqlite");
  });

  test("service module contract is structural", () => {
    const mod: TomeServiceModule = {
      id: "example",
      start() {},
    };
    expect(mod.id).toBe("example");
  });

  test("store and cache module contracts are structural", () => {
    const storeMod: TomeStoreModule = {
      id: "flatfile",
      open() {
        return {
          contentDir: "/tmp",
        } as TomeDataStore;
      },
    };
    const cacheMod: TomeCacheModule = {
      id: "sqlite",
      open() {
        return { path: "/tmp/x.sqlite", close() {} } as ReturnType<TomeCacheModule["open"]>;
      },
    };
    expect(storeMod.id).toBe("flatfile");
    expect(cacheMod.id).toBe("sqlite");
    const event: StoreChangeEvent = { path: "01ABC.md", kind: "node" };
    expect(event.kind).toBe("node");
  });
});
