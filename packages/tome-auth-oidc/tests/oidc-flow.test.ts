import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TomeGraphServices } from "tome-graph-interfaces";
import {
  createApiHandler,
  InMemorySessionStore,
  SESSION_COOKIE_NAME,
  UserSettingsStore,
} from "tome-http";
import { createOidcAuthenticationProvider } from "../src/oidc-provider";
import { startMockOidcIdp } from "./mock-idp";

function mockGraphServices(): TomeGraphServices {
  return {
    close: async () => {},
  } as unknown as TomeGraphServices;
}

function locationOf(res: Response): string {
  return res.headers.get("Location") ?? "";
}

describe("tome-auth-oidc authorization code + PKCE", () => {
  test("login → IdP → callback sets cookie; /api/me resolves principal", async () => {
    const idp = startMockOidcIdp({ subjectId: "alice@example.com" });
    const dir = mkdtempSync(join(tmpdir(), "tome-auth-oidc-"));
    try {
      const sessionStore = new InMemorySessionStore();
      const redirectUri = "http://127.0.0.1:5173/api/auth/callback";
      const provider = createOidcAuthenticationProvider({
        params: {
          issuer: idp.issuer,
          clientId: idp.clientId,
          clientSecret: idp.clientSecret,
          redirectUri,
          postLoginRedirect: "/",
        },
        createSession: (input) => sessionStore.create(input),
        sessionCookieHeader: (sessionId, req) => {
          const secure = new URL(req.url).protocol === "https:";
          const parts = [
            `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
            "Path=/",
            "HttpOnly",
            "SameSite=Lax",
          ];
          if (secure) parts.push("Secure");
          return parts.join("; ");
        },
      });

      const handler = createApiHandler(
        mockGraphServices(),
        new UserSettingsStore(join(dir, "settings.json")),
        {
          sessionStore,
          getAuthenticationProvider: () => provider,
        },
      );

      const loginRes = await handler(
        new Request("http://127.0.0.1:5173/api/auth/login"),
      );
      expect(loginRes.status).toBe(302);
      const authorizeUrl = locationOf(loginRes);
      expect(authorizeUrl).toContain("/authorize?");

      const idpRes = await fetch(authorizeUrl, { redirect: "manual" });
      expect(idpRes.status).toBe(302);
      const callbackUrl = locationOf(idpRes);
      expect(callbackUrl.startsWith(redirectUri)).toBe(true);

      const callbackRes = await handler(new Request(callbackUrl));
      expect(callbackRes.status).toBe(302);
      expect(locationOf(callbackRes)).toBe("/");
      const setCookie = callbackRes.headers.get("Set-Cookie") ?? "";
      expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
      expect(setCookie).toContain("HttpOnly");

      const cookieMatch = new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`).exec(setCookie);
      expect(cookieMatch?.[1]).toBeTruthy();
      const sessionId = decodeURIComponent(cookieMatch![1]!);

      const meRes = await handler(
        new Request("http://127.0.0.1:5173/api/me", {
          headers: { Cookie: `${SESSION_COOKIE_NAME}=${sessionId}` },
        }),
      );
      expect(await meRes.json()).toEqual({
        principal: { accountNodeId: "alice@example.com" },
      });

      const headerMe = await handler(
        new Request("http://127.0.0.1:5173/api/me", {
          headers: { Authorization: `Session ${sessionId}` },
        }),
      );
      expect(await headerMe.json()).toEqual({
        principal: { accountNodeId: "alice@example.com" },
      });

      await handler.close();
    } finally {
      idp.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("/api/auth/login returns 404 when provider absent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-auth-oidc-none-"));
    try {
      const handler = createApiHandler(
        mockGraphServices(),
        new UserSettingsStore(join(dir, "settings.json")),
        { sessionStore: new InMemorySessionStore() },
      );
      const res = await handler(new Request("http://localhost/api/auth/login"));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "authentication_not_configured" });
      await handler.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
