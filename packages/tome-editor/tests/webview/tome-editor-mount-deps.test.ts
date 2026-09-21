import { describe, expect, test } from "bun:test";
import { TOME_EDITOR_MOUNT_DEPS } from "../../src/webview/components/TomeEditor";

describe("TomeEditor mount deps", () => {
  test("Milkdown remount deps exclude save callbacks and title", () => {
    expect(TOME_EDITOR_MOUNT_DEPS).toEqual(["api", "nodeId", "initialDocumentKey"]);
    for (const forbidden of ["onBodyChange", "onEditorBaseline", "title"] as const) {
      expect(
        (TOME_EDITOR_MOUNT_DEPS as readonly string[]).includes(forbidden),
      ).toBe(false);
    }
  });
});
