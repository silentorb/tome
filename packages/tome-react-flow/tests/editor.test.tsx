import { describe, expect, test } from "bun:test";
import { impFlowDeleteKeyCode } from "../src/editor";

describe("impFlowDeleteKeyCode", () => {
  test("binds Backspace and Delete when editable", () => {
    expect(impFlowDeleteKeyCode()).toEqual(["Backspace", "Delete"]);
    expect(impFlowDeleteKeyCode(false)).toEqual(["Backspace", "Delete"]);
  });

  test("disables delete keys when read-only", () => {
    expect(impFlowDeleteKeyCode(true)).toBeNull();
  });
});
