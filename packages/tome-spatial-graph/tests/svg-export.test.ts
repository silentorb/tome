import { describe, expect, test } from "bun:test";
import { injectSpatialGraphNodeLinks } from "../src/svg-export";

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
