import { describe, expect, test } from "bun:test";
import { classifyDocumentUpdate } from "../../src/webview/editor-markdown-update";

describe("classifyDocumentUpdate", () => {
  test("ignores updates before baseline is captured at create", () => {
    expect(
      classifyDocumentUpdate({
        destroyed: false,
        editorReady: true,
        baselineCaptured: false,
        sameDoc: false,
      }),
    ).toBe("ignore");
  });

  test("saves the first real edit after baseline", () => {
    expect(
      classifyDocumentUpdate({
        destroyed: false,
        editorReady: true,
        baselineCaptured: true,
        sameDoc: false,
      }),
    ).toBe("save");
  });

  test("ignores no-op document updates", () => {
    expect(
      classifyDocumentUpdate({
        destroyed: false,
        editorReady: true,
        baselineCaptured: true,
        sameDoc: true,
      }),
    ).toBe("ignore");
  });
});
