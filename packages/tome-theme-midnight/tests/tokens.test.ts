import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const srcDir = join(import.meta.dir, "../src");
const tokensCss = readFileSync(join(srcDir, "tokens.css"), "utf8");

const EXPECTED_TOKENS = [
  "--tome-font",
  "--tome-bg",
  "--tome-surface",
  "--tome-inset",
  "--tome-text",
  "--tome-muted",
  "--tome-border",
  "--tome-hover",
  "--tome-callout-bg",
  "--tome-callout-border",
  "--tome-callout-radius",
  "--tome-link",
  "--tome-relation-cell-link",
  "--tome-graph-link",
  "--tome-graph-link-strong",
  "--tome-graph-cluster-node",
  "--tome-graph-anchor-node",
  "--tome-graph-label-bg",
  "--tome-graph-label-border",
  "--tome-danger",
  "--tome-accent",
  "--tome-text-primary",
  "--tome-bg-hover",
  "--tome-fg",
];

describe("midnight tokens", () => {
  test("defines core --tome-* variables on :root", () => {
    for (const token of EXPECTED_TOKENS) {
      expect(tokensCss).toContain(`${token}:`);
    }
  });

  test("uses dark color scheme", () => {
    expect(tokensCss).toMatch(/color-scheme:\s*dark/);
    expect(tokensCss).toMatch(/--tome-bg:\s*#191919/);
  });
});
