import { describe, expect, test } from "bun:test";
import { createTomeHttpService } from "../src/service";

describe("tome-http", () => {
  test("createTomeHttpService returns a service module", () => {
    const mod = createTomeHttpService();
    expect(mod.id).toBe("http");
    expect(typeof mod.start).toBe("function");
  });
});
