import { describe, expect, test, afterEach, beforeEach } from "bun:test";
import { handleEditorLinkPointerEvent } from "../../src/webview/editor-link-navigation";

const TARGET_ID = "e5cc80dc61ed4c629951cdf472b20b7a";
const BASE = "http://127.0.0.1:5173/?node=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("handleEditorLinkPointerEvent", () => {
  let originalAssign: typeof window.location.assign;
  let originalCreateElement: typeof document.createElement;
  let assignedUrl: string | null = null;
  let newTabHref: string | null = null;

  beforeEach(() => {
    originalAssign = window.location.assign.bind(window.location);
    originalCreateElement = document.createElement.bind(document);
  });

  afterEach(() => {
    window.location.assign = originalAssign;
    document.createElement = originalCreateElement;
    assignedUrl = null;
    newTabHref = null;
  });

  function setupRoot(): { root: HTMLDivElement; anchor: HTMLAnchorElement } {
    const root = document.createElement("div");
    root.innerHTML = `<a href="?node=${TARGET_ID}">Cozy horror</a>`;
    document.body.appendChild(root);
    const anchor = root.querySelector("a") as HTMLAnchorElement;
    return { root, anchor };
  }

  function mockNavigation() {
    window.location.assign = ((url: string | URL) => {
      assignedUrl = String(url);
    }) as typeof window.location.assign;

    document.createElement = ((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") {
        el.click = () => {
          newTabHref = (el as HTMLAnchorElement).href;
        };
      }
      return el;
    }) as typeof document.createElement;
  }

  test("plain click navigates same tab via navigateStandaloneNode", () => {
    mockNavigation();
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
    expect(assignedUrl).toContain(`node=${TARGET_ID}`);
    expect(newTabHref).toBeNull();
    root.remove();
  });

  test("ctrl+click opens node in new tab", () => {
    mockNavigation();
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
    expect(assignedUrl).toBeNull();
    expect(newTabHref).toContain(`node=${TARGET_ID}`);
    root.remove();
  });

  test("right-click does not navigate", () => {
    mockNavigation();
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
    expect(newTabHref).toBeNull();
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
