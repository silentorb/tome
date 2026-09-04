import { beforeEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { nonessentialTest } from "tome-test-support";
import { ToolPanel, type ToolPanelSession } from "../../../src/webview/components/ToolPanel";
import {
  DEFAULT_TOOL_PANEL_WIDTH_PX,
  MIN_TOOL_PANEL_WIDTH_PX,
  TOOL_PANEL_WIDTH_KEY,
} from "../../../src/webview/tool-panel-preferences";

function Probe({ label }: { label: string }) {
  return <div data-testid="panel-content">{label}</div>;
}

function Harness() {
  const [session, setSession] = useState<ToolPanelSession | null>(null);
  return (
    <div style={{ width: 1200 }}>
      <button
        type="button"
        onClick={() =>
          setSession({
            title: "Edit query",
            Component: Probe as (props: Record<string, unknown>) => unknown,
            props: { label: "flow" },
          })
        }
      >
        Open
      </button>
      <ToolPanel session={session} onClose={() => setSession(null)} />
    </div>
  );
}

describe("ToolPanel", () => {
  beforeEach(() => {
    localStorage.removeItem(TOOL_PANEL_WIDTH_KEY);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1920 });
  });

  test("is hidden until a session is open", () => {
    const { container } = render(<Harness />);
    expect(container.querySelector(".tome-tool-panel")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(container.querySelector(".tome-tool-panel")).toBeTruthy();
    expect(screen.getByText("Edit query")).toBeTruthy();
    expect(screen.getByTestId("panel-content").textContent).toBe("flow");
  });

  test("close button clears the session", () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(container.querySelector(".tome-tool-panel")).toBeNull();
  });

  // Intrinsically brittle under happy-dom fireEvent/act (historically removeChild);
  // close button remains essential onClose coverage.
  nonessentialTest("Escape calls onClose without unmounting during the key event", () => {
    const onClose = mock(() => {});
    const session: ToolPanelSession = {
      title: "Edit query",
      Component: Probe as (props: Record<string, unknown>) => unknown,
      props: { label: "flow" },
    };
    const { container } = render(<ToolPanel session={session} onClose={onClose} />);
    const panel = container.querySelector(".tome-tool-panel");
    expect(panel).toBeTruthy();
    fireEvent.keyDown(panel as HTMLElement, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".tome-tool-panel")).toBeTruthy();
  });

  test("exposes a vertical resize separator", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const handle = screen.getByRole("separator", { name: "Resize tool panel" });
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-valuenow")).toBe(String(DEFAULT_TOOL_PANEL_WIDTH_PX));
    expect(handle.getAttribute("aria-valuemin")).toBe(String(MIN_TOOL_PANEL_WIDTH_PX));
  });

  test("pointer drag widens the panel and persists width", () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const handle = screen.getByRole("separator", { name: "Resize tool panel" });
    const panel = container.querySelector(".tome-tool-panel") as HTMLElement;

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 800 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 700 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientX: 700 });

    expect(panel.style.width).toBe(`${DEFAULT_TOOL_PANEL_WIDTH_PX + 100}px`);
    expect(localStorage.getItem(TOOL_PANEL_WIDTH_KEY)).toBe(String(DEFAULT_TOOL_PANEL_WIDTH_PX + 100));
  });

  test("ArrowLeft widens the panel via the separator", () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const handle = screen.getByRole("separator", { name: "Resize tool panel" });
    const panel = container.querySelector(".tome-tool-panel") as HTMLElement;

    fireEvent.keyDown(handle, { key: "ArrowLeft" });

    expect(panel.style.width).toBe(`${DEFAULT_TOOL_PANEL_WIDTH_PX + 16}px`);
    expect(localStorage.getItem(TOOL_PANEL_WIDTH_KEY)).toBe(String(DEFAULT_TOOL_PANEL_WIDTH_PX + 16));
  });
});
