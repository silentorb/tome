import { describe, expect, test } from "bun:test";
import {
  createLinkHardOpenPlugin,
  handleLinkHardOpenClick,
  isNewTabLinkGesture,
  linkAnchorFromEventTarget,
} from "../../src/webview/editor-link-hard-open";

function mouseEvent(options: MouseEventInit, target?: EventTarget): MouseEvent {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...options,
  });
  if (target) {
    Object.defineProperty(event, "target", { value: target, configurable: true });
  }
  return event;
}

describe("isNewTabLinkGesture", () => {
  test("true for ctrl+primary and meta+primary", () => {
    expect(isNewTabLinkGesture(mouseEvent({ ctrlKey: true }))).toBe(true);
    expect(isNewTabLinkGesture(mouseEvent({ metaKey: true }))).toBe(true);
  });

  test("false for plain, shift, and non-primary", () => {
    expect(isNewTabLinkGesture(mouseEvent({}))).toBe(false);
    expect(isNewTabLinkGesture(mouseEvent({ shiftKey: true }))).toBe(false);
    expect(isNewTabLinkGesture(mouseEvent({ button: 1, ctrlKey: true }))).toBe(false);
  });
});

describe("linkAnchorFromEventTarget", () => {
  test("returns nearest a[href]", () => {
    const root = document.createElement("div");
    root.innerHTML = `<a href="?node=x"><span>label</span></a>`;
    const span = root.querySelector("span")!;
    expect(linkAnchorFromEventTarget(span)?.getAttribute("href")).toBe("?node=x");
  });

  test("returns null for non-anchors", () => {
    const p = document.createElement("p");
    p.textContent = "plain";
    expect(linkAnchorFromEventTarget(p)).toBeNull();
    expect(linkAnchorFromEventTarget(null)).toBeNull();
  });
});

describe("handleLinkHardOpenClick", () => {
  test("returns true for ctrl/meta+click on an anchor", () => {
    const root = document.createElement("div");
    root.innerHTML = `<a href="?node=x">Cozy horror</a>`;
    const anchor = root.querySelector("a")!;
    expect(handleLinkHardOpenClick(null, 0, mouseEvent({ ctrlKey: true }, anchor))).toBe(true);
    expect(handleLinkHardOpenClick(null, 0, mouseEvent({ metaKey: true }, anchor))).toBe(true);
  });

  test("returns false for plain click, shift+click, and non-anchor targets", () => {
    const root = document.createElement("div");
    root.innerHTML = `<a href="?node=x">Cozy horror</a><p>plain</p>`;
    const anchor = root.querySelector("a")!;
    const paragraph = root.querySelector("p")!;
    expect(handleLinkHardOpenClick(null, 0, mouseEvent({}, anchor))).toBe(false);
    expect(handleLinkHardOpenClick(null, 0, mouseEvent({ shiftKey: true }, anchor))).toBe(false);
    expect(handleLinkHardOpenClick(null, 0, mouseEvent({ ctrlKey: true }, paragraph))).toBe(false);
  });

  test("plugin handleClick matches handleLinkHardOpenClick", () => {
    const plugin = createLinkHardOpenPlugin();
    const handleClick = plugin.props.handleClick;
    expect(typeof handleClick).toBe("function");
    const root = document.createElement("div");
    root.innerHTML = `<a href="?node=x">Cozy horror</a>`;
    const anchor = root.querySelector("a")!;
    const view = null as unknown as Parameters<NonNullable<typeof handleClick>>[0];
    expect(handleClick!(view, 0, mouseEvent({ ctrlKey: true }, anchor))).toBe(true);
    expect(handleClick!(view, 0, mouseEvent({}, anchor))).toBe(false);
  });
});
