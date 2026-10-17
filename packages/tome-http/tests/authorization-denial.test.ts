import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TomeGraphServices } from "tome-graph-interfaces";
import {
  createAllowEverythingImpQueryAuthorizer,
  createAllowEverythingModificationAuthorizer,
  createDenyEverythingImpQueryAuthorizer,
  createDenyEverythingModificationAuthorizer,
} from "tome-interfaces/authorization";
import {
  allowEverythingAuthorizerOptions,
  createApiHandler,
  UserSettingsStore,
} from "../src/index";

function mockGraphServices(): TomeGraphServices {
  return {
    close: async () => {},
    executeImp: async () => ({ columns: [], rows: [] }),
    createNode: async () => ({ id: "01ARZ3NDEKTSV4RRFFQ69G5FAV", title: "n" }),
  } as unknown as TomeGraphServices;
}

describe("denial authorizers", () => {
  test("default (no options) denies Imp query and node create", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-http-authz-default-"));
    try {
      const handler = createApiHandler(
        mockGraphServices(),
        new UserSettingsStore(join(dir, "settings.json")),
      );

      const queryRes = await handler(
        new Request("http://localhost/api/nodes/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ graph: { nodes: {}, edges: {} } }),
        }),
      );
      expect(queryRes.status).toBe(403);
      expect(await queryRes.json()).toEqual({ error: "forbidden" });

      const createRes = await handler(
        new Request("http://localhost/api/nodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Hello" }),
        }),
      );
      expect(createRes.status).toBe(403);
      expect(await createRes.json()).toEqual({ error: "forbidden" });

      await handler.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("explicit allow-everything permits Imp query and node create", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-http-authz-allow-"));
    try {
      const handler = createApiHandler(
        mockGraphServices(),
        new UserSettingsStore(join(dir, "settings.json")),
        { ...allowEverythingAuthorizerOptions() },
      );

      const queryRes = await handler(
        new Request("http://localhost/api/nodes/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ graph: { nodes: {}, edges: {} } }),
        }),
      );
      expect(queryRes.status).toBe(200);

      const createRes = await handler(
        new Request("http://localhost/api/nodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Hello" }),
        }),
      );
      expect(createRes.status).toBe(200);

      await handler.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("slots mix independently — allow Imp, deny modification", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-http-authz-mix-"));
    try {
      const handler = createApiHandler(
        mockGraphServices(),
        new UserSettingsStore(join(dir, "settings.json")),
        {
          getImpQueryAuthorizer: () => createAllowEverythingImpQueryAuthorizer(),
          getModificationAuthorizer: () => createDenyEverythingModificationAuthorizer(),
        },
      );

      const queryRes = await handler(
        new Request("http://localhost/api/nodes/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ graph: { nodes: {}, edges: {} } }),
        }),
      );
      expect(queryRes.status).toBe(200);

      const createRes = await handler(
        new Request("http://localhost/api/nodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Hello" }),
        }),
      );
      expect(createRes.status).toBe(403);

      await handler.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("slots mix independently — deny Imp, allow modification", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-http-authz-mix2-"));
    try {
      const handler = createApiHandler(
        mockGraphServices(),
        new UserSettingsStore(join(dir, "settings.json")),
        {
          getImpQueryAuthorizer: () => createDenyEverythingImpQueryAuthorizer(),
          getModificationAuthorizer: () => createAllowEverythingModificationAuthorizer(),
        },
      );

      const queryRes = await handler(
        new Request("http://localhost/api/nodes/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ graph: { nodes: {}, edges: {} } }),
        }),
      );
      expect(queryRes.status).toBe(403);

      const createRes = await handler(
        new Request("http://localhost/api/nodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Hello" }),
        }),
      );
      expect(createRes.status).toBe(200);

      await handler.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("identity routes stay ungated under default deny", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-http-authz-identity-"));
    try {
      const handler = createApiHandler(
        mockGraphServices(),
        new UserSettingsStore(join(dir, "settings.json")),
      );
      const me = await handler(new Request("http://localhost/api/me"));
      expect(me.status).toBe(200);
      const health = await handler(new Request("http://localhost/api/health"));
      expect(health.status).toBe(200);
      await handler.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
