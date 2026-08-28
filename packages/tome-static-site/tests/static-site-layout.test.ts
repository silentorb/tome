import { describe, expect, test } from "bun:test";
import {
  parseStaticSiteLayout,
  readStaticSiteLayout,
  STATIC_SITE_LAYOUT_PROPERTY,
} from "../src/lib/static-site-layout";

describe("static site layout", () => {
  test("parseStaticSiteLayout accepts bare and default", () => {
    expect(parseStaticSiteLayout("bare")).toBe("bare");
    expect(parseStaticSiteLayout("BARE")).toBe("bare");
    expect(parseStaticSiteLayout("default")).toBe("default");
    expect(parseStaticSiteLayout("")).toBe("default");
    expect(parseStaticSiteLayout(null)).toBe(null);
  });

  test("parseStaticSiteLayout rejects unknown values", () => {
    expect(() => parseStaticSiteLayout("fancy")).toThrow(/Invalid static_site_layout/);
  });

  test("readStaticSiteLayout reads frontmatter property", () => {
    expect(readStaticSiteLayout({ [STATIC_SITE_LAYOUT_PROPERTY]: "bare" })).toBe("bare");
    expect(readStaticSiteLayout({ [STATIC_SITE_LAYOUT_PROPERTY]: "default" })).toBeUndefined();
    expect(readStaticSiteLayout({})).toBeUndefined();
    expect(readStaticSiteLayout(null)).toBeUndefined();
  });
});
