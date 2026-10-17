import { describe, expect, test } from "bun:test";
import {
  createAllowEverythingImpQueryAuthorizer,
  createDenyEverythingModificationAuthorizer,
} from "tome-interfaces/authorization";
import {
  AuthorizationRegistry,
  parseAuthorizationConfig,
  resolveAuthorizationBuiltIns,
} from "../src/authorization/registry";
import { normalizeServerConfig, parseServerConfig } from "../src/load-services";
import type { TomeServerModuleConfigEntry } from "tome-service-interfaces";

const STORE_ENTRY: TomeServerModuleConfigEntry = {
  id: "default",
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

describe("authorization registry", () => {
  test("defaults to deny-everything on both slots", async () => {
    const registry = new AuthorizationRegistry();
    expect(await registry.getImpQueryAuthorizer().authorize(null, { graph: {} })).toBe(
      "deny",
    );
    expect(
      await registry.getModificationAuthorizer().authorize(null, { modification: "node.create" }),
    ).toBe("deny");
  });

  test("built-in allow-everything replaces a slot when configured", async () => {
    const registry = new AuthorizationRegistry();
    registry.resetAndApplyBuiltIns({
      impQueryAuthorizer: "allow-everything",
      modificationAuthorizer: "deny-everything",
    });
    expect(await registry.getImpQueryAuthorizer().authorize(null, { graph: {} })).toBe(
      "allow",
    );
    expect(
      await registry.getModificationAuthorizer().authorize(null, { modification: "node.create" }),
    ).toBe("deny");
  });

  test("extension registration can replace slots independently", async () => {
    const registry = new AuthorizationRegistry();
    registry.resetAndApplyBuiltIns({
      impQueryAuthorizer: "deny-everything",
      modificationAuthorizer: "deny-everything",
    });
    registry.registerImpQueryAuthorizer(createAllowEverythingImpQueryAuthorizer());
    registry.registerModificationAuthorizer(createDenyEverythingModificationAuthorizer());
    expect(await registry.getImpQueryAuthorizer().authorize(null, { graph: {} })).toBe(
      "allow",
    );
    expect(
      await registry.getModificationAuthorizer().authorize(null, { modification: "node.create" }),
    ).toBe("deny");
  });

  test("resetAndApplyBuiltIns restores deny then applies config", async () => {
    const registry = new AuthorizationRegistry();
    registry.registerImpQueryAuthorizer(createAllowEverythingImpQueryAuthorizer());
    registry.resetAndApplyBuiltIns(null);
    expect(await registry.getImpQueryAuthorizer().authorize(null, { graph: {} })).toBe(
      "deny",
    );
  });
});

describe("authorization config parse", () => {
  test("omitted authorization resolves to deny-everything", () => {
    expect(resolveAuthorizationBuiltIns(undefined)).toEqual({
      impQueryAuthorizer: "deny-everything",
      modificationAuthorizer: "deny-everything",
    });
    const normalized = normalizeServerConfig({
      version: 1,
      store: STORE_ENTRY,
      cache: CACHE_ENTRY,
      services: [],
    });
    expect(normalized.authorization).toEqual({
      impQueryAuthorizer: "deny-everything",
      modificationAuthorizer: "deny-everything",
    });
  });

  test("parses explicit allow-everything", () => {
    const config = parseServerConfig({
      version: 1,
      store: STORE_ENTRY,
      cache: CACHE_ENTRY,
      services: [],
      authorization: {
        impQueryAuthorizer: "allow-everything",
        modificationAuthorizer: "allow-everything",
      },
    });
    expect(config.authorization).toEqual({
      impQueryAuthorizer: "allow-everything",
      modificationAuthorizer: "allow-everything",
    });
    expect(() =>
      parseAuthorizationConfig({ impQueryAuthorizer: "maybe" }),
    ).toThrow(/deny-everything|allow-everything/);
  });
});
