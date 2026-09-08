import { describe, expect, test } from "bun:test";
import { suppressNavigationClickAfterDragReorder } from "../../src/webview/quick-links-nav";

describe("quick-links-nav", () => {
  test("suppressNavigationClickAfterDragReorder prevents only after drag", () => {
    const dragCompleted = { current: false };
    const prevented: boolean[] = [];
    const event = {
      preventDefault: () => {
        prevented.push(true);
      },
    };

    suppressNavigationClickAfterDragReorder(event, dragCompleted);
    expect(prevented).toEqual([]);

    dragCompleted.current = true;
    suppressNavigationClickAfterDragReorder(event, dragCompleted);
    expect(prevented).toEqual([true]);
    expect(dragCompleted.current).toBe(false);
  });
});
