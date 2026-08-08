import { describe, expect, test, afterEach, beforeEach } from "bun:test";
import {
  navigateStandaloneNode,
  pushStandaloneHistory,
  setStandaloneNavigationHandler,
} from "../../src/webview/node-links";
import {
  attachStandaloneChromeNavigation,
  handleStandaloneAnchorClick,
  isStandaloneAppNavigableUrl,
} from "../../src/webview/standalone-navigation";

const NODE_A = "AAAAAAAAAAAAAAAAAAAAAAAAAA";
const NODE_B = "BBBBBBBBBBBBBBBBBBBBBBBBBB";
const BASE = `http://127.0.0.1:5173/?node=${NODE_A}`;

describe("standalone soft navigation", () => {
  let originalAssign: typeof window.location.assign;
  let assignedUrl: string | null = null;
  let softNavCalls = 0;

  beforeEach(() => {
    originalAssign = window.location.assign.bind(window.location);
    assignedUrl = null;
    softNavCalls = 0;
    setStandaloneNavigationHandler(null);
    window.history.replaceState({}, "", BASE);
    window.location.assign = ((url: string | URL) => {
      assignedUrl = String(url);
    }) as typeof window.location.assign;
  });

  afterEach(() => {
    window.location.assign = originalAssign;
    setStandaloneNavigationHandler(null);
  });

  test("isStandaloneAppNavigableUrl accepts node, create, and explorer", () => {
    expect(isStandaloneAppNavigableUrl(new URL(`http://127.0.0.1:5173/?node=${NODE_B}`))).toBe(
      true,
    );
    expect(isStandaloneAppNavigableUrl(new URL("http://127.0.0.1:5173/?view=create"))).toBe(true);
    expect(isStandaloneAppNavigableUrl(new URL("http://127.0.0.1:5173/?view=explorer"))).toBe(
      true,
    );
    expect(isStandaloneAppNavigableUrl(new URL("https://example.com/?node=${NODE_B}"))).toBe(
      false,
    );
  });

  test("navigateStandaloneNode pushState + handler when registered", () => {
    setStandaloneNavigationHandler(() => {
      softNavCalls += 1;
    });
    const lengthBefore = window.history.length;
    navigateStandaloneNode(NODE_B, BASE);
    expect(softNavCalls).toBe(1);
    expect(window.location.search).toContain(`node=${NODE_B}`);
    expect(window.history.length).toBeGreaterThanOrEqual(lengthBefore);
    expect(assignedUrl).toBeNull();
  });

  test("navigateStandaloneNode assigns without handler", () => {
    navigateStandaloneNode(NODE_B, BASE);
    expect(assignedUrl).toContain(`node=${NODE_B}`);
  });

  test("pushStandaloneHistory updates URL and grows history", () => {
    const lengthBefore = window.history.length;
    pushStandaloneHistory(`http://127.0.0.1:5173/?node=${NODE_B}`);
    expect(window.location.search).toContain(`node=${NODE_B}`);
    expect(window.history.length).toBeGreaterThanOrEqual(lengthBefore);
  });

  test("chrome interceptor soft-navigates plain clicks", () => {
    setStandaloneNavigationHandler(() => {
      softNavCalls += 1;
    });
    const root = document.createElement("div");
    root.innerHTML = `<a href="?node=${NODE_B}">Target</a>`;
    document.body.appendChild(root);
    const anchor = root.querySelector("a") as HTMLAnchorElement;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(event, "target", { value: anchor, configurable: true });

    expect(handleStandaloneAnchorClick(event, BASE)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(softNavCalls).toBe(1);
    expect(window.location.search).toContain(`node=${NODE_B}`);
    root.remove();
  });

  test("chrome interceptor leaves ctrl+click alone", () => {
    setStandaloneNavigationHandler(() => {
      softNavCalls += 1;
    });
    const root = document.createElement("div");
    root.innerHTML = `<a href="?node=${NODE_B}">Target</a>`;
    document.body.appendChild(root);
    const anchor = root.querySelector("a") as HTMLAnchorElement;
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });
    Object.defineProperty(event, "target", { value: anchor, configurable: true });

    expect(handleStandaloneAnchorClick(event, BASE)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(softNavCalls).toBe(0);
    root.remove();
  });

  test("chrome interceptor leaves shift+click alone", () => {
    const root = document.createElement("div");
    root.innerHTML = `<a href="?node=${NODE_B}">Target</a>`;
    document.body.appendChild(root);
    const anchor = root.querySelector("a") as HTMLAnchorElement;
    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      button: 0,
      shiftKey: true,
    });
    Object.defineProperty(event, "target", { value: anchor, configurable: true });

    expect(handleStandaloneAnchorClick(event, BASE)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    root.remove();
  });

  test("attachStandaloneChromeNavigation wires document clicks", () => {
    setStandaloneNavigationHandler(() => {
      softNavCalls += 1;
    });
    const root = document.createElement("div");
    root.innerHTML = `<a href="?node=${NODE_B}">Target</a>`;
    document.body.appendChild(root);
    const detach = attachStandaloneChromeNavigation(root);
    const anchor = root.querySelector("a") as HTMLAnchorElement;
    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(softNavCalls).toBe(1);
    detach();
    root.remove();
  });
});
