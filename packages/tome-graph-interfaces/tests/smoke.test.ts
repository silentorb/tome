import { describe, expect, test } from "bun:test";
import type { TomeGraphServices } from "../src/index";

describe("tome-graph-interfaces", () => {
  test("exports TomeGraphServices as a type", () => {
    const _check: TomeGraphServices | null = null;
    expect(_check).toBeNull();
  });
});
