import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TomeGraphServices } from "tome-graph-interfaces";
import {
  createAllowEverythingAuthorizer,
  createDenyEverythingAuthorizer,
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

  test("single authorizer drives both Imp and modification families", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-http-authz-single-"));
    try {
      const deny = createDenyEverythingAuthorizer();
      const handler = createApiHandler(
        mockGraphServices(),
        new UserSettingsStore(join(dir, "settings.json")),
        { getAuthorizer: () => deny },
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
      expect(createRes.status).toBe(403);

      await handler.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("allow authorizer permits both families", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-http-authz-allow-both-"));
    try {
      const allow = createAllowEverythingAuthorizer();
      const handler = createApiHandler(
        mockGraphServices(),
        new UserSettingsStore(join(dir, "settings.json")),
        { getAuthorizer: () => allow },
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
