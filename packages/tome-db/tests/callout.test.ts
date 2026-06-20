import { describe, expect, test } from "bun:test";
import {
  DEFAULT_CALLOUT_PREFIX,
  extractLeadingCalloutEmoji,
  hasLeadingCalloutEmoji,
} from "../src/callout";

describe("callout", () => {
  test("hasLeadingCalloutEmoji detects leading pictographs", () => {
    expect(hasLeadingCalloutEmoji("💡 There could be two Manors…")).toBe(true);
    expect(hasLeadingCalloutEmoji("⚠️ Watch out")).toBe(true);
    expect(hasLeadingCalloutEmoji("Plain quote text")).toBe(false);
  });

  test("extractLeadingCalloutEmoji returns the glyph prefix", () => {
    expect(extractLeadingCalloutEmoji("💡 Note")).toBe("💡");
    expect(extractLeadingCalloutEmoji("  ⚠️  Alert")).toBe("⚠️");
  });

  test("DEFAULT_CALLOUT_PREFIX ends with space", () => {
    expect(DEFAULT_CALLOUT_PREFIX).toBe("💡 ");
  });
});
