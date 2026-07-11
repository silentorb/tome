import { describe, expect, test } from "bun:test";
import type { TomeServiceModule, TomeServerConfig } from "../src/index";

describe("tome-service-interfaces", () => {
  test("config shape allows empty services", () => {
    const config: TomeServerConfig = { version: 1, services: [] };
    expect(config.services).toEqual([]);
  });

  test("module contract is structural", () => {
    const mod: TomeServiceModule = {
      id: "example",
      start() {},
    };
    expect(mod.id).toBe("example");
  });
});
