import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAllowEverythingAuthorizer } from "tome-interfaces/authorization";
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
  test("defaults to deny-everything", async () => {
    const registry = new AuthorizationRegistry();
    const authorizer = registry.getAuthorizer();
    expect(await authorizer.authorizeImpQuery(null, { graph: {} })).toBe("deny");
    expect(
      await authorizer.authorizeModification(null, { modification: "node.create" }),
    ).toBe("deny");
  });

  test("built-in allow-everything replaces the authorizer when configured", async () => {
    const registry = new AuthorizationRegistry();
    registry.resetAndApplyBuiltIns({ implementationId: "allow-everything" });
    const authorizer = registry.getAuthorizer();
    expect(await authorizer.authorizeImpQuery(null, { graph: {} })).toBe("allow");
    expect(
      await authorizer.authorizeModification(null, { modification: "node.create" }),
    ).toBe("allow");
  });

  test("extension registration can replace the authorizer", async () => {
    const registry = new AuthorizationRegistry();
    registry.resetAndApplyBuiltIns({ implementationId: "deny-everything" });
    registry.registerAuthorizer(createAllowEverythingAuthorizer());
    expect(await registry.getAuthorizer().authorizeImpQuery(null, { graph: {} })).toBe(
      "allow",
    );
  });

  test("resetAndApplyBuiltIns restores deny then applies config", async () => {
    const registry = new AuthorizationRegistry();
    registry.registerAuthorizer(createAllowEverythingAuthorizer());
    registry.resetAndApplyBuiltIns(null);
    expect(await registry.getAuthorizer().authorizeImpQuery(null, { graph: {} })).toBe(
      "deny",
    );
  });

  test("authorization-model denies and lists instance ids", async () => {
    const contentDir = mkdtempSync(join(tmpdir(), "tome-authz-model-"));
    try {
      mkdirSync(join(contentDir, "model"), { recursive: true });
      writeFileSync(
        join(contentDir, "model", "ontology.json"),
        JSON.stringify({
          version: 1,
          types: { authorizationModel: "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
        }),
      );
      const registry = new AuthorizationRegistry({
        listContentDirs: () => [contentDir],
        contentHasAuthorizationModelType: () => true,
        discoverAuthorizationModelInstanceIds: () => ["01ARZ3NDEKTSV4RRFFQ69G5FB0"],
      });
      registry.resetAndApplyBuiltIns({ implementationId: "authorization-model" });
      const authorizer = registry.getAuthorizer() as {
        authorizeImpQuery: (...args: unknown[]) => Promise<"allow" | "deny"> | "allow" | "deny";
        authorizeModification: (...args: unknown[]) => Promise<"allow" | "deny"> | "allow" | "deny";
        listInstanceIds: () => readonly string[];
      };
      expect(await authorizer.authorizeImpQuery(null, { graph: {} })).toBe("deny");
      expect(
        await authorizer.authorizeModification(null, { modification: "node.create" }),
      ).toBe("deny");
      expect(authorizer.listInstanceIds()).toEqual(["01ARZ3NDEKTSV4RRFFQ69G5FB0"]);
    } finally {
      rmSync(contentDir, { recursive: true, force: true });
    }
  });

  test("authorization-model throws when type is not configured", () => {
    const registry = new AuthorizationRegistry({
      listContentDirs: () => ["/tmp/empty"],
      contentHasAuthorizationModelType: () => false,
      discoverAuthorizationModelInstanceIds: () => [],
    });
    expect(() =>
      registry.resetAndApplyBuiltIns({ implementationId: "authorization-model" }),
    ).toThrow(/types\.authorizationModel/);
  });
});

describe("authorization config parse", () => {
  test("omitted authorization resolves to deny-everything", () => {
    expect(resolveAuthorizationBuiltIns(undefined)).toEqual({
      implementationId: "deny-everything",
    });
    const normalized = normalizeServerConfig({
      version: 1,
      store: STORE_ENTRY,
      cache: CACHE_ENTRY,
      services: [],
    });
    expect(normalized.authorization).toEqual({
      implementationId: "deny-everything",
    });
  });

  test("parses explicit allow-everything", () => {
    const config = parseServerConfig({
      version: 1,
      store: STORE_ENTRY,
      cache: CACHE_ENTRY,
      services: [],
      authorization: {
        implementationId: "allow-everything",
      },
    });
    expect(config.authorization).toEqual({
      implementationId: "allow-everything",
    });
    expect(() => parseAuthorizationConfig({ implementationId: "maybe" })).toThrow(
      /deny-everything|allow-everything|authorization-model/,
    );
  });

  test("parses authorization-model", () => {
    expect(
      parseAuthorizationConfig({ implementationId: "authorization-model" }),
    ).toEqual({ implementationId: "authorization-model" });
  });
});
