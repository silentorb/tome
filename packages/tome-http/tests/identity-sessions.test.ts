import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TomeGraphServices } from "tome-graph-interfaces";
import {
  allowEverythingAuthorizerOptions,
  createApiHandler,
  getRequestPrincipal,
  InMemorySessionStore,
  UserSettingsStore,
  type Principal,
} from "../src/index";

function mockGraphServices(): TomeGraphServices {
  return {
    close: async () => {},
  } as unknown as TomeGraphServices;
}

function sessionAuth(sessionId: string): HeadersInit {
  return { Authorization: `Session ${sessionId}` };
}

describe("web API identity sessions", () => {
  test("create session, /api/me and /api/health carry principal, delete clears identity", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-http-identity-"));
    try {
      const store = new InMemorySessionStore();
      const handler = createApiHandler(
        mockGraphServices(),
        new UserSettingsStore(join(dir, "settings.json")),
        { sessionStore: store },
      );

      const anonymousMe = await handler(new Request("http://localhost/api/me"));
      expect(anonymousMe.status).toBe(200);
      expect(await anonymousMe.json()).toEqual({ principal: null });

      const createRes = await handler(
        new Request("http://localhost/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountNodeId: "user-a" }),
        }),
      );
      expect(createRes.status).toBe(201);
      const setCookie = createRes.headers.get("Set-Cookie") ?? "";
      expect(setCookie).toContain("tome_session=");
      expect(setCookie).toContain("HttpOnly");
      const created = (await createRes.json()) as {
        session: { id: string; accountNodeId: string };
      };
      expect(created.session.accountNodeId).toBe("user-a");
      expect(created.session.id.length).toBeGreaterThan(0);

      const meRes = await handler(
        new Request("http://localhost/api/me", {
          headers: sessionAuth(created.session.id),
        }),
      );
      expect(meRes.status).toBe(200);
      expect(await meRes.json()).toEqual({
        principal: { accountNodeId: "user-a" },
      });

      const healthRes = await handler(
        new Request("http://localhost/api/health", {
          headers: sessionAuth(created.session.id),
        }),
      );
      expect(healthRes.status).toBe(200);
      const health = (await healthRes.json()) as {
        ok: boolean;
        principal: { accountNodeId: string } | null;
      };
      expect(health.ok).toBe(true);
      expect(health.principal).toEqual({ accountNodeId: "user-a" });

      const deleteRes = await handler(
        new Request("http://localhost/api/sessions", {
          method: "DELETE",
          headers: sessionAuth(created.session.id),
        }),
      );
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.headers.get("Set-Cookie") ?? "").toContain("Max-Age=0");

      const afterMe = await handler(
        new Request("http://localhost/api/me", {
          headers: sessionAuth(created.session.id),
        }),
      );
      expect(await afterMe.json()).toEqual({ principal: null });

      await handler.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("getRequestPrincipal is set during an authenticated request", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-http-identity-als-"));
    try {
      const store = new InMemorySessionStore();
      const session = store.create({ accountNodeId: "als-user" });
      let seen: Principal | null | undefined;

      const db = {
        ...mockGraphServices(),
        async getWorkspace() {
          seen = getRequestPrincipal();
          return {
            projectName: "test",
            contentModelVersion: 1,
            protectedNodeIds: [],
            features: {},
          };
        },
      } as unknown as TomeGraphServices;

      const handler = createApiHandler(
        db,
        new UserSettingsStore(join(dir, "settings.json")),
        { sessionStore: store },
      );

      const res = await handler(
        new Request("http://localhost/api/workspace", {
          headers: sessionAuth(session.id),
        }),
      );
      expect(res.status).toBe(200);
      expect(seen).toEqual({ accountNodeId: "als-user" });

      await handler.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("POST /api/sessions rejects unknown account when validator is set", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-http-session-validate-"));
    try {
      const handler = createApiHandler(
        mockGraphServices(),
        new UserSettingsStore(join(dir, "settings.json")),
        {
          ...allowEverythingAuthorizerOptions(),
          validateAccountNodeId: (id) => id === "real-account",
        },
      );

      const bad = await handler(
        new Request("http://localhost/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountNodeId: "unknown" }),
        }),
      );
      expect(bad.status).toBe(400);
      expect(await bad.json()).toEqual({ error: "unknown_account" });

      const good = await handler(
        new Request("http://localhost/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountNodeId: "real-account" }),
        }),
      );
      expect(good.status).toBe(201);

      await handler.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("POST /api/sessions rejects empty accountNodeId", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-http-identity-bad-"));
    try {
      const handler = createApiHandler(
        mockGraphServices(),
        new UserSettingsStore(join(dir, "settings.json")),
        { sessionStore: new InMemorySessionStore() },
      );
      const res = await handler(
        new Request("http://localhost/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accountNodeId: "  " }),
        }),
      );
      expect(res.status).toBe(400);
      await handler.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("cookie credential resolves principal; /api/auth/* 404 without provider", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-http-identity-cookie-"));
    try {
      const store = new InMemorySessionStore();
      const session = store.create({ accountNodeId: "cookie-user" });
      const handler = createApiHandler(
        mockGraphServices(),
        new UserSettingsStore(join(dir, "settings.json")),
        { sessionStore: store },
      );

      const meRes = await handler(
        new Request("http://localhost/api/me", {
          headers: { Cookie: `tome_session=${session.id}` },
        }),
      );
      expect(await meRes.json()).toEqual({
        principal: { accountNodeId: "cookie-user" },
      });

      const loginRes = await handler(new Request("http://localhost/api/auth/login"));
      expect(loginRes.status).toBe(404);
      expect(await loginRes.json()).toEqual({ error: "authentication_not_configured" });

      const optionsRes = await handler(
        new Request("http://localhost/api/me", { method: "OPTIONS" }),
      );
      expect(optionsRes.headers.get("Access-Control-Allow-Origin")).toBeNull();

      await handler.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
