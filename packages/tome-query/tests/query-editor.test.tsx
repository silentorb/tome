import { describe, expect, test } from "bun:test";
import { queryFlowDeleteKeyCode } from "../src/query-editor";

describe("queryFlowDeleteKeyCode", () => {
  test("binds Backspace and Delete when editable", () => {
    expect(queryFlowDeleteKeyCode()).toEqual(["Backspace", "Delete"]);
    expect(queryFlowDeleteKeyCode(false)).toEqual(["Backspace", "Delete"]);
  });

  test("disables delete keys when read-only", () => {
    expect(queryFlowDeleteKeyCode(true)).toBeNull();
  });
});
