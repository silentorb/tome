import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  renderRedirectHtml,
  resolveRedirects,
  writeRedirectPages,
} from "../src/lib/redirects";

const ID_A = "0000000000000000000000001S";
const ID_B = "00000000000000000000000026";

describe("resolveRedirects", () => {
  test("resolves path to aliased pagePath", () => {
    const resolved = resolveRedirects({
      redirects: { "old/about": ID_A },
      pathById: { [ID_A]: "design/about" },
      base: "/",
    });
    expect(resolved).toEqual([
      { path: "old/about", nodeId: ID_A, targetHref: "/design/about/" },
    ]);
  });

  test("honors base path", () => {
    const resolved = resolveRedirects({
      redirects: { legacy: ID_A },
      pathById: { [ID_A]: ID_A },
      base: "/design/",
    });
    expect(resolved[0]!.targetHref).toBe(`/design/${ID_A}/`);
  });

  test("throws when node id is unknown", () => {
    expect(() =>
      resolveRedirects({
        redirects: { old: ID_B },
        pathById: { [ID_A]: "design/about" },
      }),
    ).toThrow(/unknown node id/);
  });

  test("throws when path conflicts with a node urlPath", () => {
    expect(() =>
      resolveRedirects({
        redirects: { "design/about": ID_A },
        pathById: { [ID_A]: "design/about" },
      }),
    ).toThrow(/conflicts with an existing static site page/);
  });

  test("throws when path conflicts with a tab route", () => {
    expect(() =>
      resolveRedirects({
        redirects: { "design/about/tabs/all": ID_A },
        pathById: { [ID_A]: "design/about" },
        tabRoutes: [{ nodeId: ID_A, tabId: "all" }],
      }),
    ).toThrow(/conflicts with an existing static site page/);
  });
});

describe("renderRedirectHtml", () => {
  test("includes meta refresh, location.replace, and anchor", () => {
    const html = renderRedirectHtml("/design/about/");
    expect(html).toContain('<meta http-equiv="refresh" content="0;url=/design/about/">');
    expect(html).toContain('location.replace("/design/about/")');
    expect(html).toContain('<link rel="canonical" href="/design/about/">');
    expect(html).toContain('<a href="/design/about/">/design/about/</a>');
  });
});

describe("writeRedirectPages", () => {
  test("writes nested directory index.html stubs", () => {
    const outDir = mkdtempSync(join(tmpdir(), "redirect-out-"));
    try {
      writeRedirectPages(outDir, [
        { path: "old/about", nodeId: ID_A, targetHref: "/design/about/" },
      ]);
      const filePath = join(outDir, "old/about/index.html");
      expect(existsSync(filePath)).toBe(true);
      const html = readFileSync(filePath, "utf8");
      expect(html).toContain('url=/design/about/');
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  test("refuses to overwrite existing output", () => {
    const outDir = mkdtempSync(join(tmpdir(), "redirect-out-"));
    try {
      const filePath = join(outDir, "old/index.html");
      mkdirSync(dirnameSafe(filePath), { recursive: true });
      writeFileSync(filePath, "existing");
      expect(() =>
        writeRedirectPages(outDir, [{ path: "old", nodeId: ID_A, targetHref: "/x/" }]),
      ).toThrow(/refusing to overwrite/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});

function dirnameSafe(filePath: string): string {
  return join(filePath, "..");
}
