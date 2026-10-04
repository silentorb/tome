import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const cssPath = join(import.meta.dir, "../src/query-block.css");
const css = readFileSync(cssPath, "utf8");
const rfCssPath = join(import.meta.dir, "../../tome-react-flow/src/imp-flow-css.css");
const rfCss = readFileSync(rfCssPath, "utf8");

describe("query-block CSS", () => {
  test("does not include Milkdown Crepe specificity override for port inputs", () => {
    expect(css).not.toMatch(/\.tome-query-block-ui\s+input\.tome-query-rf-port-input/);
    expect(css).not.toMatch(/\.tome-query-block-ui\s+input\.tome-rf-port-input/);
    expect(css).not.toContain("Beat Crepe");
  });

  test("tool panel hosts shared tome-react-flow canvas classes", () => {
    expect(css).toMatch(/\.tome-query-tool-panel\s+\.tome-rf-flow/);
    expect(css).toMatch(/\.tome-query-tool-panel\s+\.tome-rf-flow-canvas/);
    expect(rfCss).toMatch(/\.tome-rf-port-input\s*\{/);
  });

  test("result table grows with rows instead of an inner scroll viewport", () => {
    expect(css).toMatch(/\.tome-query-table-wrap\s*\{[^}]*overflow:\s*visible/s);
    expect(css).toMatch(/\.tome-query-table-wrap\s*\{[^}]*max-height:\s*none/s);
    expect(css).not.toMatch(/\.tome-query-table-wrap\s*\{[^}]*max-height:\s*24rem/s);
    expect(css).not.toMatch(/\.tome-query-table-wrap\s*\{[^}]*overflow:\s*auto/s);
  });
});
