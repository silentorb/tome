import { describe, expect, test } from "bun:test";
import {
  DRAFT_NODE_ID,
  isDraftNodeId,
  makeDraftNodePageDetail,
} from "../../src/webview/draft-page";

describe("draft-page", () => {
  test("makeDraftNodePageDetail is an empty client-only page", () => {
    const draft = makeDraftNodePageDetail();
    expect(draft.id).toBe(DRAFT_NODE_ID);
    expect(draft.title).toBe("");
    expect(draft.document).toEqual({ segments: [{ type: "prose", markdown: "" }] });
    expect(draft.sections).toEqual([{ type: "markdown" }]);
    expect(isDraftNodeId(draft.id)).toBe(true);
  });

  test("isDraftNodeId is false for real node ids", () => {
    expect(isDraftNodeId("AAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(false);
    expect(isDraftNodeId(null)).toBe(false);
  });
});
