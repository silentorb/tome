import { describe, expect, test } from "bun:test";
import {
  DEFAULT_STATIC_SITE_FOOTER_TEMPLATE,
  resolveStaticSiteFooter,
} from "../src/lib/static-site-footer";

describe("resolveStaticSiteFooter", () => {
  test("returns undefined when neither custom footer nor organization is set", () => {
    expect(resolveStaticSiteFooter(undefined, 2026)).toBeUndefined();
    expect(resolveStaticSiteFooter({}, 2026)).toBeUndefined();
    expect(resolveStaticSiteFooter({ staticSiteHeader: "Tome" }, 2026)).toBeUndefined();
  });

  test("uses default template when only organization is set", () => {
    expect(
      resolveStaticSiteFooter({ staticSiteFooterOrganization: "Silent Orb" }, 2026),
    ).toBe("© Copyright 2026 Silent Orb");
    expect(DEFAULT_STATIC_SITE_FOOTER_TEMPLATE).toBe("© Copyright :year: :organization:");
  });

  test("uses custom template when only custom footer is set", () => {
    expect(
      resolveStaticSiteFooter({ staticSiteFooter: "Built in :year:" }, 2026),
    ).toBe("Built in 2026");
  });

  test("substitutes organization into custom template", () => {
    expect(
      resolveStaticSiteFooter(
        {
          staticSiteFooter: "© :year: :organization:",
          staticSiteFooterOrganization: "Silent Orb",
        },
        2026,
      ),
    ).toBe("© 2026 Silent Orb");
  });
});
