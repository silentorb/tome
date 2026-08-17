import { describe, expect, test } from "bun:test";
import {
  metadataExpandedFromLocation,
  navigateStandaloneNode,
  pushStandaloneHistory,
  replaceStandaloneHistory,
  resolveGraphExplorerAnchor,
  resolveNodeLinkTarget,
  resolveNodePageTarget,
  setStandaloneNavigationHandler,
  standaloneCreatePageUrl,
  standaloneViewUrl,
  syncMetadataExpandedParam,
} from "../../src/webview/node-links";
import { TEST_GRAPH_ANCHOR_NODE_ID } from "tome-db/content/test-helpers";
import { editorDynamicNodeHref } from "tome-flatfile/dynamic-node-links";
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
    expect(standaloneCreatePageUrl(null, "http://127.0.0.1:5173/")).toBe(
      "http://127.0.0.1:5173/?view=create",
    );
  });

  test("standaloneCreatePageUrl pins the active corpus", () => {
    expect(standaloneCreatePageUrl("translucence", "http://127.0.0.1:5173/")).toBe(
      "http://127.0.0.1:5173/?view=create&corpus=translucence",
    );
    expect(
      standaloneCreatePageUrl("marloth", "http://127.0.0.1:5173/?view=create&corpus=translucence"),
    ).toBe("http://127.0.0.1:5173/?view=create&corpus=marloth");
  });

  test("node and view URLs drop the create-page corpus pin", () => {
    expect(
      standaloneNodeUrl(
        "00000000000000000000000014",
        "http://127.0.0.1:5173/?view=create&corpus=translucence",
      ),
    ).toBe("http://127.0.0.1:5173/?node=00000000000000000000000014");
    expect(
      standaloneViewUrl(
        "graph-explorer",
        null,
        "http://127.0.0.1:5173/?corpus=translucence",
        null,
        "0000000000000000000000002V",
      ),
    ).toBe("http://127.0.0.1:5173/?view=explorer&anchor=0000000000000000000000002V");
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

  test("pushStandaloneHistory updates URL", () => {
    const original = window.location.href;
    window.history.replaceState({}, "", "http://127.0.0.1:5173/?node=AAAAAAAAAAAAAAAAAAAAAAAAAA");
    pushStandaloneHistory("http://127.0.0.1:5173/?node=CCCCCCCCCCCCCCCCCCCCCCCCCC");
    expect(window.location.search).toContain("node=CCCCCCCCCCCCCCCCCCCCCCCCCC");
    window.history.replaceState({}, "", original);
  });

  test("navigateStandaloneNode uses handler when registered", () => {
    const original = window.location.href;
    window.history.replaceState({}, "", "http://127.0.0.1:5173/?node=AAAAAAAAAAAAAAAAAAAAAAAAAA");
    let calls = 0;
    setStandaloneNavigationHandler(() => {
      calls += 1;
    });
    navigateStandaloneNode("CCCCCCCCCCCCCCCCCCCCCCCCCC");
    expect(calls).toBe(1);
    expect(window.location.search).toContain("node=CCCCCCCCCCCCCCCCCCCCCCCCCC");
    setStandaloneNavigationHandler(null);
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

  test("standaloneNodeUrl strips dynamicTitle and dynnode params", () => {
    window.history.replaceState(
      {},
      "",
      "http://127.0.0.1:5173/?dynnode=AAAAAAAAAAAAAAAAAAAAAAAAAA&dynamicTitle=1&node=BBBBBBBBBBBBBBBBBBBBBBBBBB",
    );
    const url = new URL(standaloneNodeUrl("CCCCCCCCCCCCCCCCCCCCCCCCCC"));
    expect(url.searchParams.get("node")).toBe("CCCCCCCCCCCCCCCCCCCCCCCCCC");
    expect(url.searchParams.get("dynamicTitle")).toBeNull();
    expect(url.searchParams.get("dynnode")).toBeNull();
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
