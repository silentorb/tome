import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cssPath = join(import.meta.dir, "../src/query-block.css");
const css = readFileSync(cssPath, "utf8");

describe("query-block CSS", () => {
  test("does not include Milkdown Crepe specificity override for port inputs", () => {
    expect(css).not.toMatch(/\.tome-query-block-ui\s+input\.tome-query-rf-port-input/);
    expect(css).not.toContain("Beat Crepe");
  });

  test("styles port inputs for the tool panel canvas", () => {
    expect(css).toMatch(/\.tome-query-rf-port-input\s*\{/);
    expect(css).toMatch(/\.tome-query-tool-panel\s+\.tome-query-flow-canvas/);
  });
});
