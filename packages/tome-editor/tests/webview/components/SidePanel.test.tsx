import { describe, expect, test } from "bun:test";
import { TEST_HOME_NODE_ID } from "tome-db/content/test-helpers";
import { isHomeNavActive } from "../../../src/webview/components/SidePanel";

describe("SidePanel home nav", () => {
  const featuresNodeId = "0000000000000000000000002P";

  test("isHomeNavActive matches home node only on node-page view", () => {
    expect(isHomeNavActive("node-page", TEST_HOME_NODE_ID, TEST_HOME_NODE_ID)).toBe(
      true,
    );
    expect(isHomeNavActive("node-page", featuresNodeId, TEST_HOME_NODE_ID)).toBe(
      false,
    );
    expect(isHomeNavActive("graph-explorer", TEST_HOME_NODE_ID, TEST_HOME_NODE_ID)).toBe(
      false,
    );
    expect(isHomeNavActive("node-page", TEST_HOME_NODE_ID, null)).toBe(false);
  });
});
