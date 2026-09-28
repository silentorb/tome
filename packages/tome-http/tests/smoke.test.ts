import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TomeServiceHost } from "tome-service-interfaces";
import { getProfilingStore, resetProfilingForTests } from "tome-service-interfaces";
import { createTomeHttpService } from "../src/service";

describe("tome-http", () => {
  test("createTomeHttpService returns a service module", () => {
    const mod = createTomeHttpService();
    expect(mod.id).toBe("http");
    expect(typeof mod.start).toBe("function");
  });
});

describe("tome-http profiling startup", () => {
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
