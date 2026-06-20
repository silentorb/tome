import { describe, expect, test } from "bun:test";
import {
  metadataExpandedFromLocation,
  replaceStandaloneHistory,
  resolveGraphExplorerAnchor,
  resolveNodeLinkTarget,
  resolveNodePageTarget,
  standaloneCreatePageUrl,
  standaloneViewUrl,
  syncMetadataExpandedParam,
} from "../../src/webview/node-links";
import { TEST_GRAPH_ANCHOR_NODE_ID } from "tome-db/content/test-helpers";
import { editorDynamicNodeHref } from "tome-db/dynamic-node-links";
import { tomeHref, standaloneNodeUrl } from "../../src/shared/types";

describe("node-links", () => {
  test("resolveNodeLinkTarget accepts marloth, relative, and legacy notion hrefs", () => {
    const id = "72b6fb455b824b78962b0e509cc091c9";
    expect(resolveNodeLinkTarget(tomeHref(id))).toBe(id);
    expect(resolveNodeLinkTarget(`./${id}.md`)).toBe(id);
    expect(resolveNodeLinkTarget("Marloth/Page%20abc.md")).toBeNull();
    expect(resolveNodeLinkTarget("Marloth/Features%20dd0de9867cc345b898929306bdf9fc83.csv")).toBe(
      "dd0de9867cc345b898929306bdf9fc83",
    );
    expect(resolveNodeLinkTarget("Marloth/TWOLD%20design%2013458e628ba28073850dea0edb9acde1.md")).toBe(
      "13458e628ba28073850dea0edb9acde1",
    );
  });

  test("standaloneViewUrl maps app views to query params", () => {
    expect(
      standaloneViewUrl(
        "graph-explorer",
        null,
        "http://127.0.0.1:5173/",
        null,
        "e028aa0786f5449984a4f497c1d746fa",
      ),
    ).toBe(
      "http://127.0.0.1:5173/?view=explorer&anchor=e028aa0786f5449984a4f497c1d746fa",
    );
    expect(
      standaloneViewUrl("node-page", "72b6fb455b824b78962b0e509cc091c9", "http://127.0.0.1:5173/"),
    ).toBe("http://127.0.0.1:5173/?node=72b6fb455b824b78962b0e509cc091c9");
    expect(standaloneCreatePageUrl("http://127.0.0.1:5173/")).toBe(
      "http://127.0.0.1:5173/?view=create",
    );
  });

  test("metadataExpandedFromLocation reads meta query param", () => {
    const original = window.location.href;
    window.history.replaceState({}, "", "http://127.0.0.1:5173/?node=aaa&meta=1");
    expect(metadataExpandedFromLocation()).toBe(true);
    syncMetadataExpandedParam(false);
    expect(metadataExpandedFromLocation()).toBe(false);
    window.history.replaceState({}, "", original);
  });

  test("replaceStandaloneHistory updates URL without growing history", () => {
    const original = window.location.href;
    window.history.replaceState({}, "", "http://127.0.0.1:5173/?node=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const lengthBefore = window.history.length;
    replaceStandaloneHistory("http://127.0.0.1:5173/?node=cccccccccccccccccccccccccccccccc");
    expect(window.history.length).toBe(lengthBefore);
    expect(window.location.search).toContain("node=cccccccccccccccccccccccccccccccc");
    window.history.replaceState({}, "", original);
  });

  test("resolveNodePageTarget accepts ?node= and marloth:// URIs", () => {
    expect(
      resolveNodePageTarget(
        "http://127.0.0.1:5173/?node=72b6fb455b824b78962b0e509cc091c9",
      ),
    ).toBe("72b6fb455b824b78962b0e509cc091c9");
    expect(resolveNodePageTarget(tomeHref("72b6fb455b824b78962b0e509cc091c9"))).toBe(
      "72b6fb455b824b78962b0e509cc091c9",
    );
    expect(resolveNodePageTarget("marloth://node/72b6fb455b824b78962b0e509cc091c9")).toBe(
      "72b6fb455b824b78962b0e509cc091c9",
    );
    expect(
      resolveNodePageTarget(
        `http://127.0.0.1:5173/${editorDynamicNodeHref("72b6fb455b824b78962b0e509cc091c9")}`,
      ),
    ).toBe("72b6fb455b824b78962b0e509cc091c9");
  });

  test("standaloneNodeUrl strips meta param", () => {
    expect(
      standaloneNodeUrl("72b6fb455b824b78962b0e509cc091c9", "http://127.0.0.1:5173/?meta=1"),
    ).toBe("http://127.0.0.1:5173/?node=72b6fb455b824b78962b0e509cc091c9");
  });

  test("resolveGraphExplorerAnchor uses explicit anchor when valid", () => {
    expect(
      resolveGraphExplorerAnchor(
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        TEST_GRAPH_ANCHOR_NODE_ID,
      ),
    ).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  });

  test("resolveGraphExplorerAnchor falls back to workspace default", () => {
    expect(resolveGraphExplorerAnchor(undefined, TEST_GRAPH_ANCHOR_NODE_ID)).toBe(
      TEST_GRAPH_ANCHOR_NODE_ID,
    );
  });
});
