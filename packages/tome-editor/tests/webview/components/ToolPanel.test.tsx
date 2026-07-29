import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ToolPanel, type ToolPanelSession } from "../../../src/webview/components/ToolPanel";

function Probe({ label }: { label: string }) {
  return <div data-testid="panel-content">{label}</div>;
}

function Harness() {
  const [session, setSession] = useState<ToolPanelSession | null>(null);
  return (
    <div>
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

  test("Escape closes the panel", () => {
    const { container } = render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".tome-tool-panel")).toBeNull();
  });
});
