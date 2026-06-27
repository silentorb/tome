import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const pkgRoot = join(import.meta.dir, "..");
const themeSrc = join(import.meta.dir, "../../tome-theme-midnight/src");
const themeCss = readFileSync(join(themeSrc, "node-page.css"), "utf8");
const overridesCss = readFileSync(join(pkgRoot, "src/lib/node-sections-overrides.css"), "utf8");
const siteChromeCss = readFileSync(join(pkgRoot, "src/lib/site-chrome.css"), "utf8");

describe("node-page metadata collapse CSS (theme package)", () => {
  test("hides metadata body when panel is not expanded", () => {
    expect(themeCss).toMatch(
      /\.tome-record-metadata-panel:not\(\.is-expanded\) \.tome-record-metadata-body[\s\S]*display:\s*none/,
    );
  });

  test("shows metadata body as grid when panel is expanded", () => {
    expect(themeCss).toMatch(
      /\.tome-record-metadata-panel\.is-expanded \.tome-record-metadata-body[\s\S]*display:\s*grid/,
    );
  });
});

describe("static site markdown panel width (node-sections-overrides)", () => {
  test("markdown panel stretches to full column width", () => {
    expect(overridesCss).toMatch(
      /\.tome-markdown-section \.tome-content-panel[\s\S]*align-self:\s*stretch/,
    );
    expect(overridesCss).toMatch(
      /\.tome-markdown-section \.tome-content-panel[\s\S]*min-width:\s*100%/,
    );
  });

  test("markdown panel enforces blog-standard min width at tablet breakpoint", () => {
    expect(overridesCss).toMatch(
      /@media \(min-width:\s*48rem\)[\s\S]*\.tome-markdown-section \.tome-content-panel[\s\S]*min-width:\s*var\(--tome-static-markdown-min\)/,
    );
    expect(siteChromeCss).toMatch(/--tome-static-markdown-min:\s*45rem/);
  });

  test("database table wrap keeps full width without markdown min-width", () => {
    expect(overridesCss).toMatch(/\.tome-database-table-wrap[\s\S]*width:\s*100%/);
    expect(overridesCss).not.toMatch(/\.tome-database-table-wrap[\s\S]*min-width:\s*var\(--tome-static-markdown-min\)/);
  });
});
