import { afterEach, describe, expect, test } from "bun:test";
import { createApiHandler, UserSettingsStore } from "../src/index";
import {
  configureProfiler,
  getProfileSnapshot,
  resetProfilerForTests,
} from "tome-service-interfaces";
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

describe("createApiHandler profiling", () => {
  afterEach(() => {
    resetProfilerForTests();
  });

  test("GET /api/debug/profile is 404 when profiling is off", async () => {
    configureProfiler({ enabled: false, verbose: false, slowMs: 100 });
    const handler = createApiHandler(
      stubServices(),
      new UserSettingsStore("/tmp/tome-http-profile-off-settings.json"),
    );
    const res = await handler(new Request("http://127.0.0.1/api/debug/profile"));
    expect(res.status).toBe(404);
    handler.close();
  });

  test("records slow HTTP samples and exposes /api/debug/profile when enabled", async () => {
    configureProfiler({ enabled: true, verbose: false, slowMs: 0 });
    const handler = createApiHandler(
      stubServices(),
      new UserSettingsStore("/tmp/tome-http-profile-on-settings.json"),
    );

    const homeRes = await handler(new Request("http://127.0.0.1/api/home"));
    expect(homeRes.status).toBe(200);

    const profileRes = await handler(new Request("http://127.0.0.1/api/debug/profile"));
    expect(profileRes.status).toBe(200);
    const body = (await profileRes.json()) as {
      config: { enabled: boolean; slowMs: number };
      samples: { kind: string; detail: string }[];
    };
    expect(body.config.enabled).toBe(true);
    expect(body.samples.some((s) => s.kind === "http" && s.detail.includes("/api/home"))).toBe(
      true,
    );
    expect(getProfileSnapshot().samples.length).toBeGreaterThan(0);

    handler.close();
  });
});
