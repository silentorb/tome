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
  test("resolveNodeLinkTarget accepts marloth and relative hrefs", () => {
    const id = "00000000000000000000000014";
    expect(resolveNodeLinkTarget(tomeHref(id))).toBe(id);
    expect(resolveNodeLinkTarget(`./${id}.md`)).toBe(id);
    expect(resolveNodeLinkTarget("Marloth/Page%20abc.md")).toBeNull();
  });

  test("standaloneViewUrl maps app views to query params", () => {
    expect(
      standaloneViewUrl(
        "graph-explorer",
        null,
        "http://127.0.0.1:5173/",
        null,
        "0000000000000000000000002V",
      ),
    ).toBe(
      "http://127.0.0.1:5173/?view=explorer&anchor=0000000000000000000000002V",
    );
    expect(
      standaloneViewUrl("node-page", "00000000000000000000000014", "http://127.0.0.1:5173/"),
    ).toBe("http://127.0.0.1:5173/?node=00000000000000000000000014");
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
    window.history.replaceState({}, "", "http://127.0.0.1:5173/?node=AAAAAAAAAAAAAAAAAAAAAAAAAA");
    const lengthBefore = window.history.length;
    replaceStandaloneHistory("http://127.0.0.1:5173/?node=CCCCCCCCCCCCCCCCCCCCCCCCCC");
    expect(window.history.length).toBe(lengthBefore);
    expect(window.location.search).toContain("node=CCCCCCCCCCCCCCCCCCCCCCCCCC");
    window.history.replaceState({}, "", original);
  });

  test("resolveNodePageTarget accepts ?node= and marloth:// URIs", () => {
    expect(
      resolveNodePageTarget(
        "http://127.0.0.1:5173/?node=00000000000000000000000014",
      ),
    ).toBe("00000000000000000000000014");
    expect(resolveNodePageTarget(tomeHref("00000000000000000000000014"))).toBe(
      "00000000000000000000000014",
    );
    expect(resolveNodePageTarget("marloth://node/00000000000000000000000014")).toBe(
      "00000000000000000000000014",
    );
    expect(
      resolveNodePageTarget(
        `http://127.0.0.1:5173/${editorDynamicNodeHref("00000000000000000000000014")}`,
      ),
    ).toBe("00000000000000000000000014");
  });

  test("standaloneNodeUrl strips meta param", () => {
    expect(
      standaloneNodeUrl("00000000000000000000000014", "http://127.0.0.1:5173/?meta=1"),
    ).toBe("http://127.0.0.1:5173/?node=00000000000000000000000014");
  });

  test("resolveGraphExplorerAnchor uses explicit anchor when valid", () => {
    expect(
      resolveGraphExplorerAnchor(
        "AAAAAAAAAAAAAAAAAAAAAAAAAA",
        TEST_GRAPH_ANCHOR_NODE_ID,
      ),
    ).toBe("AAAAAAAAAAAAAAAAAAAAAAAAAA");
  });

  test("resolveGraphExplorerAnchor falls back to workspace default", () => {
    expect(resolveGraphExplorerAnchor(undefined, TEST_GRAPH_ANCHOR_NODE_ID)).toBe(
      TEST_GRAPH_ANCHOR_NODE_ID,
    );
  });
});
