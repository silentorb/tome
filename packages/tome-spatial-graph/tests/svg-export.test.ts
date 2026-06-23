import { describe, expect, test } from "bun:test";
import { injectSpatialGraphNodeLinks, SVG_EXPORT_PADDING, trimSpatialGraphSvg } from "../src/svg-export";

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

describe("injectSpatialGraphNodeLinks", () => {
  test("adds anchor overlays for node hit targets", () => {
    const input = '<svg width="100" height="50"><g><circle cx="20" cy="20" r="10"/></g></svg>';
    const output = injectSpatialGraphNodeLinks(input, [
      { nodeId: "city-a", href: "?node=city-a", x: 10, y: 12, width: 24, height: 18 },
    ]);

    expect(output).toContain('class="tome-spatial-graph-node-links"');
    expect(output).toContain('class="tome-spatial-graph-node-link"');
    expect(output).toContain('data-node-id="city-a"');
    expect(output).toContain('href="?node=city-a"');
    expect(output).toContain('rect x="10" y="12" width="24" height="18"');
  });

  test("escapes attribute content in href and node id", () => {
    const input = '<svg width="100" height="50"></svg>';
    const output = injectSpatialGraphNodeLinks(input, [
      {
        nodeId: 'city"\'<&',
        href: '?node=city"<&',
        x: 1,
        y: 2,
        width: 3,
        height: 4,
      },
    ]);

    expect(output).toContain('data-node-id="city&quot;\'&lt;&amp;"');
    expect(output).toContain('href="?node=city&quot;&lt;&amp;"');
  });
});
