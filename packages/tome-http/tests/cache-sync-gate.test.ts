import { describe, expect, test } from "bun:test";
import { createApiHandler, UserSettingsStore } from "../src/index";
import type { CacheSyncPublicStatus } from "tome-service-interfaces";
import type { TomeGraphServices } from "tome-graph-interfaces";

function stubServices(): TomeGraphServices {
  return {
    getHomeId: () => "AAAAAAAAAAAAAAAAAAAAAAAAAA",
    listCorpora: () => [],
    getWorkspace: () => {
      throw new Error("not used");
    },
  } as unknown as TomeGraphServices;
}

describe("createApiHandler cache sync gate", () => {
  test("health reports syncing and data routes return 503 until ready", async () => {
    let status: CacheSyncPublicStatus = {
      ready: false,
      syncing: true,
      phase: "rebuild_nodes",
      progress: 0.42,
      current: 42,
      total: 100,
      message: "nodes 42/100",
    };
    const handler = createApiHandler(
      stubServices(),
      new UserSettingsStore("/tmp/tome-http-sync-gate-settings.json"),
      { getCacheSyncStatus: () => status },
    );

    const healthRes = await handler(new Request("http://127.0.0.1/api/health"));
    expect(healthRes.status).toBe(200);
    const health = (await healthRes.json()) as Record<string, unknown>;
    expect(health.ok).toBe(true);
    expect(health.ready).toBe(false);
    expect(health.syncing).toBe(true);
    expect(health.progress).toBe(0.42);
    expect(health.phase).toBe("rebuild_nodes");

    const homeRes = await handler(new Request("http://127.0.0.1/api/home"));
    expect(homeRes.status).toBe(503);
    const body = (await homeRes.json()) as Record<string, unknown>;
    expect(body.error).toBe("cache_syncing");
    expect(body.syncing).toBe(true);
    expect(body.progress).toBe(0.42);

    status = { ready: true, syncing: false, phase: "ready", progress: 1 };
    const readyHealth = await handler(new Request("http://127.0.0.1/api/health"));
    expect(((await readyHealth.json()) as { ready: boolean }).ready).toBe(true);

    const readyHome = await handler(new Request("http://127.0.0.1/api/home"));
    expect(readyHome.status).toBe(200);
    expect(((await readyHome.json()) as { id: string }).id).toBe("AAAAAAAAAAAAAAAAAAAAAAAAAA");

    handler.close();
  });
});
