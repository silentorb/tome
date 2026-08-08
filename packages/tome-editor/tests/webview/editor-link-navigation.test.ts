import { describe, expect, test, afterEach, beforeEach } from "bun:test";
import { handleEditorLinkPointerEvent } from "../../src/webview/editor-link-navigation";
import { setStandaloneNavigationHandler } from "../../src/webview/node-links";

const TARGET_ID = "0000000000000000000000002X";
const BASE = "http://127.0.0.1:5173/?node=AAAAAAAAAAAAAAAAAAAAAAAAAA";

describe("handleEditorLinkPointerEvent", () => {
  let originalAssign: typeof window.location.assign;
  let assignedUrl: string | null = null;
  let softNavCalls = 0;

  beforeEach(() => {
    originalAssign = window.location.assign.bind(window.location);
    assignedUrl = null;
    softNavCalls = 0;
    setStandaloneNavigationHandler(null);
    window.history.replaceState({}, "", BASE);
  });

  afterEach(() => {
    window.location.assign = originalAssign;
    setStandaloneNavigationHandler(null);
    assignedUrl = null;
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

  test("ctrl+click leaves native hard open (no preventDefault)", () => {
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
    expect(handled).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(assignedUrl).toBeNull();
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
