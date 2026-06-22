import { describe, expect, test } from "bun:test";
import { SVG_EXPORT_PADDING, trimSpatialGraphSvg } from "../src/svg-export";

describe("trimSpatialGraphSvg", () => {
  test("wraps content in a padded viewBox and scales responsively", () => {
    const input = '<svg width="100" height="50"><circle cx="10" cy="10" r="5"/></svg>';
    const output = trimSpatialGraphSvg(input, 10);

    expect(output).toContain(`viewBox="0 0 ${100 + 20} ${50 + 20}"`);
    expect(output).toContain('width="100%"');
    expect(output).not.toContain('width="120"');
    expect(output).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(output).toContain('<g transform="translate(10,10)">');
    expect(output).toContain("<circle");
  });

  test("returns input unchanged when svg tag is missing dimensions", () => {
    const input = "<svg><circle/></svg>";
    expect(trimSpatialGraphSvg(input)).toBe(input);
  });

  test("uses default padding constant", () => {
    const input = '<svg width="10" height="10"></svg>';
    const output = trimSpatialGraphSvg(input);
    expect(output).toContain(`viewBox="0 0 ${10 + SVG_EXPORT_PADDING * 2} ${10 + SVG_EXPORT_PADDING * 2}"`);
  });
});
