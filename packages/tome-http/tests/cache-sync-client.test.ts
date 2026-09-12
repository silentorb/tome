import { describe, expect, test } from "bun:test";
import {
  CacheSyncingError,
  createHttpClient,
  isCacheSyncingError,
  waitForApi,
} from "../src/create-http-client";

describe("HTTP client cache syncing", () => {
  test("fetchJson throws CacheSyncingError on 503 cache_syncing", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: "cache_syncing",
          syncing: true,
          phase: "reconcile",
          progress: 0.5,
          current: 50,
          total: 100,
          message: "reconciling…",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      )) as unknown as typeof fetch;

    try {
      const client = createHttpClient("http://127.0.0.1:3847");
      await expect(client.listCorpora()).rejects.toBeInstanceOf(CacheSyncingError);
      try {
        await client.listCorpora();
      } catch (err) {
        expect(isCacheSyncingError(err)).toBe(true);
        if (isCacheSyncingError(err)) {
          expect(err.phase).toBe("reconcile");
          expect(err.progress).toBe(0.5);
        }
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("waitForApi waits until health.ready is not false", async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      const ready = calls >= 3;
      return new Response(
        JSON.stringify({ ok: true, ready, syncing: !ready }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    try {
      const ok = await waitForApi("http://127.0.0.1:3847", 10);
      expect(ok).toBe(true);
      expect(calls).toBeGreaterThanOrEqual(3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
