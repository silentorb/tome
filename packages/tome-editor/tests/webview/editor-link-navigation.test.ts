import { describe, expect, test, afterEach, beforeEach } from "bun:test";
import { handleEditorLinkPointerEvent } from "../../src/webview/editor-link-navigation";
import { setStandaloneNavigationHandler } from "../../src/webview/node-links";

const TARGET_ID = "0000000000000000000000002X";
const BASE = "http://127.0.0.1:5173/?node=AAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("handleEditorLinkPointerEvent", () => {
  let originalAssign: typeof window.location.assign;
  let originalCreateElement: typeof document.createElement;
  let assignedUrl: string | null = null;
  let newTabHref: string | null = null;
  let softNavCalls = 0;

  beforeEach(() => {
    originalAssign = window.location.assign.bind(window.location);
    originalCreateElement = document.createElement.bind(document);
    assignedUrl = null;
    newTabHref = null;
    softNavCalls = 0;
    setStandaloneNavigationHandler(null);
    window.history.replaceState({}, "", BASE);

    document.createElement = ((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") {
        el.click = () => {
          newTabHref = (el as HTMLAnchorElement).href;
        };
      }
      return el;
    }) as typeof document.createElement;
  });

  afterEach(() => {
    window.location.assign = originalAssign;
    document.createElement = originalCreateElement;
    setStandaloneNavigationHandler(null);
    assignedUrl = null;
    newTabHref = null;
    softNavCalls = 0;
  });

  function setupRoot(): { root: HTMLDivElement; anchor: HTMLAnchorElement } {
    const root = document.createElement("div");
    root.innerHTML = `<a href="?node=${TARGET_ID}">Cozy horror</a>`;
    document.body.appendChild(root);
    const anchor = root.querySelector("a") as HTMLAnchorElement;
    return { root, anchor };
  }

  function mockAssign() {
    window.location.assign = ((url: string | URL) => {
      assignedUrl = String(url);
    }) as typeof window.location.assign;
  }

  test("plain click soft-navigates via navigateStandaloneNode", () => {
    setStandaloneNavigationHandler(() => {
      softNavCalls += 1;
    });
    const { root, anchor } = setupRoot();
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    Object.defineProperty(event, "target", { value: anchor, configurable: true });

    const handled = handleEditorLinkPointerEvent(event, root, BASE);
    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(softNavCalls).toBe(1);
    expect(window.location.search).toContain(`node=${TARGET_ID}`);
    expect(assignedUrl).toBeNull();
    root.remove();
  });

  test("plain click falls back to location.assign without handler", () => {
    mockAssign();
    const { root, anchor } = setupRoot();
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    Object.defineProperty(event, "target", { value: anchor, configurable: true });

    const handled = handleEditorLinkPointerEvent(event, root, BASE);
    expect(handled).toBe(true);
    expect(assignedUrl).toContain(`node=${TARGET_ID}`);
    root.remove();
  });

  test("ctrl+click opens the node in a new tab", () => {
    mockAssign();
    const { root, anchor } = setupRoot();
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });
    Object.defineProperty(event, "target", { value: anchor, configurable: true });

    const handled = handleEditorLinkPointerEvent(event, root, BASE);
    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(assignedUrl).toBeNull();
    expect(newTabHref).toContain(`node=${TARGET_ID}`);
    root.remove();
  });

  test("meta+click opens the node in a new tab", () => {
    mockAssign();
    const { root, anchor } = setupRoot();
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      metaKey: true,
    });
    Object.defineProperty(event, "target", { value: anchor, configurable: true });

    const handled = handleEditorLinkPointerEvent(event, root, BASE);
    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(assignedUrl).toBeNull();
    expect(newTabHref).toContain(`node=${TARGET_ID}`);
    root.remove();
  });

  test("ctrl+click on an external anchor opens the href in a new tab", () => {
    const root = document.createElement("div");
    root.innerHTML = `<a href="https://example.com/docs">External</a>`;
    document.body.appendChild(root);
    const anchor = root.querySelector("a") as HTMLAnchorElement;
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });
    Object.defineProperty(event, "target", { value: anchor, configurable: true });

    const handled = handleEditorLinkPointerEvent(event, root, BASE);
    expect(handled).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(newTabHref).toContain("https://example.com/docs");
    root.remove();
  });

  test("shift+click leaves native hard open (no preventDefault)", () => {
    mockAssign();
    const { root, anchor } = setupRoot();
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      shiftKey: true,
    });
    Object.defineProperty(event, "target", { value: anchor, configurable: true });

    const handled = handleEditorLinkPointerEvent(event, root, BASE);
    expect(handled).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(assignedUrl).toBeNull();
    root.remove();
  });

  test("right-click does not navigate", () => {
    mockAssign();
    const { root, anchor } = setupRoot();
    const event = new MouseEvent("auxclick", {
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    Object.defineProperty(event, "target", { value: anchor, configurable: true });

    const handled = handleEditorLinkPointerEvent(event, root, BASE);
    expect(handled).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(assignedUrl).toBeNull();
    root.remove();
  });

  test("does not navigate when default is already prevented", () => {
    setStandaloneNavigationHandler(() => {
      softNavCalls += 1;
    });
    const { root, anchor } = setupRoot();
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    event.preventDefault();
    Object.defineProperty(event, "target", { value: anchor, configurable: true });

    expect(handleEditorLinkPointerEvent(event, root, BASE)).toBe(false);
    expect(softNavCalls).toBe(0);
    expect(window.location.search).not.toContain(`node=${TARGET_ID}`);
    root.remove();
  });

  test("ignores anchors inside interactive page blocks", () => {
    setStandaloneNavigationHandler(() => {
      softNavCalls += 1;
    });
    const root = document.createElement("div");
    root.innerHTML = `<div data-type="tome-page-block-react"><a href="?node=${TARGET_ID}">Event</a></div>`;
    document.body.appendChild(root);
    const anchor = root.querySelector("a") as HTMLAnchorElement;
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    Object.defineProperty(event, "target", { value: anchor, configurable: true });

    expect(handleEditorLinkPointerEvent(event, root, BASE)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(softNavCalls).toBe(0);
    root.remove();
  });

  test("ignores non-node links", () => {
    const root = document.createElement("div");
    root.innerHTML = `<a href="https://example.com">External</a>`;
    document.body.appendChild(root);
    const anchor = root.querySelector("a") as HTMLAnchorElement;
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    Object.defineProperty(event, "target", { value: anchor, configurable: true });

    expect(handleEditorLinkPointerEvent(event, root, BASE)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    root.remove();
  });
});
