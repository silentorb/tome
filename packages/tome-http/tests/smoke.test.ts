import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TomeServiceHost } from "tome-service-interfaces";
import { getProfilingStore, resetProfilingForTests } from "tome-service-interfaces";
import { createTomeHttpService } from "../src/service";
import { createApiHandler } from "../src/handler";
import { UserSettingsStore } from "../src/user-settings-store";

describe("tome-http", () => {
  test("createTomeHttpService returns a service module", () => {
    const mod = createTomeHttpService();
    expect(mod.id).toBe("http");
    expect(typeof mod.start).toBe("function");
  });

  test("uncaught route error returns 500 JSON when profiling is disabled", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-http-err-"));
    try {
      const handler = createApiHandler(
        {
          getNode: async () => {
            throw new Error("boom from route");
          },
        } as unknown as TomeServiceHost["services"],
        new UserSettingsStore(join(dir, "settings.json")),
      );
      const res = await handler(
        new Request("http://127.0.0.1/api/nodes/01KWN86X6NJZMP5ZESZTNDXXW0"),
      );
      expect(res.status).toBe(500);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(await res.json()).toEqual({ error: "boom from route" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("tome-http profiling startup", async () => {
  let tempDirs: string[] = [];
  let mod: ReturnType<typeof createTomeHttpService> | null = null;

  afterEach(() => {
    if (mod?.stop) {
      try {
        mod.stop();
      } catch {
        // ignore
      }
    }
    mod = null;
    resetProfilingForTests();
    delete process.env.TOME_PROFILING;
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
    tempDirs = [];
  });

  test("start continues when profiling store cannot open", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-http-prof-"));
    tempDirs.push(dir);
    const notADir = join(dir, "not-a-dir");
    writeFileSync(notADir, "x");
    const badDbPath = join(notADir, "tome-profiling.sqlite");

    process.env.TOME_PROFILING = "1";
    mod = createTomeHttpService();
    const host = {
      options: {
        port: 0,
        profilingDbPath: badDbPath,
        userSettingsPath: join(dir, "settings.json"),
      },
      services: {} as TomeServiceHost["services"],
      getCacheSyncStatus: undefined,
    } as unknown as TomeServiceHost;

    await mod.start(host);
    expect(mod.id).toBe("http");
    expect(getProfilingStore()).toBeNull();
  });
});
