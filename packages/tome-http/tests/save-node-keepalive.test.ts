import { afterEach, describe, expect, mock, test } from "bun:test";
import { createHttpClient } from "../src/create-http-client";

describe("saveNode keepalive", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("passes keepalive true when requested", async () => {
    const calls: RequestInit[] = [];
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push(init ?? {});
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = createHttpClient("http://127.0.0.1:3847");
    await client.saveNode("AAAAAAAAAAAAAAAAAAAAAAAAAA", { body: "Hi" }, { keepalive: true });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.method).toBe("PUT");
    expect(calls[0]?.keepalive).toBe(true);
    expect(calls[0]?.body).toBe(JSON.stringify({ body: "Hi" }));
  });

  test("omits keepalive for normal saves", async () => {
    const calls: RequestInit[] = [];
    globalThis.fetch = mock(async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push(init ?? {});
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const client = createHttpClient("http://127.0.0.1:3847");
    await client.saveNode("AAAAAAAAAAAAAAAAAAAAAAAAAA", { title: "Alpha", body: "Hi" });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.keepalive).toBe(false);
    expect(calls[0]?.body).toBe(JSON.stringify({ title: "Alpha", body: "Hi" }));
  });
});
