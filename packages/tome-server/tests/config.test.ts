import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseServerConfig, startConfiguredServices } from "../src/load-services";
import type { TomeGraphServices } from "tome-graph-interfaces";

function stubGraph(): TomeGraphServices {
  return {
    close() {},
  } as TomeGraphServices;
}

describe("tome-server config", () => {
  test("allows empty services list", () => {
    const config = parseServerConfig({ version: 1, services: [] });
    expect(config.services).toEqual([]);
  });

  test("startConfiguredServices warns and continues when empty", async () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(String(args[0]));
    };
    try {
      const started = await startConfiguredServices(stubGraph(), { version: 1, services: [] });
      expect(started.modules).toEqual([]);
      expect(warnings.some((w) => w.includes("no service modules"))).toBe(true);
      await started.stop();
    } finally {
      console.warn = original;
    }
  });

  test("default config file parses", () => {
    const dir = mkdtempSync(join(tmpdir(), "tome-server-config-"));
    const path = join(dir, "tome-server.json");
    writeFileSync(
      path,
      JSON.stringify({
        version: 1,
        services: [
          {
            id: "http",
            module: "tome-http",
            export: "createTomeHttpService",
            options: { port: 3847 },
          },
        ],
      }),
    );
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    const config = parseServerConfig(raw);
    expect(config.services[0]?.module).toBe("tome-http");
    rmSync(dir, { recursive: true, force: true });
  });
});
