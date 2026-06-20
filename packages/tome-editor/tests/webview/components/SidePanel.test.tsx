import { describe, expect, test } from "bun:test";
import { TEST_HOME_NODE_ID } from "tome-db/content/test-helpers";
import { isHomeNavActive } from "../../../src/webview/components/SidePanel";

describe("SidePanel home nav", () => {
  const featuresNodeId = "dd0de9867cc345b898929306bdf9fc83";

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
