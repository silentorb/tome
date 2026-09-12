import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { CacheSyncProgressPanel } from "../../../src/webview/components/CacheSyncProgressPanel";

describe("CacheSyncProgressPanel", () => {
  test("shows percent when progress is known", () => {
    const { container } = render(
      <CacheSyncProgressPanel
        status={{
          phase: "rebuild_nodes",
          progress: 0.42,
          current: 42,
          total: 100,
          message: "nodes 42/100",
        }}
      />,
    );
    expect(container.textContent).toContain("Rebuilding nodes…");
    expect(container.textContent).toContain("42%");
    expect(container.textContent).toContain("nodes 42/100");
    expect(container.querySelector(".tome-syncing-bar.is-indeterminate")).toBeNull();
  });

  test("shows indeterminate bar without progress", () => {
    const { container } = render(
      <CacheSyncProgressPanel status={{ phase: "expand_relationships", message: "expanding…" }} />,
    );
    expect(container.textContent).toContain("Expanding relationships…");
    expect(container.textContent).toContain("In progress…");
    expect(container.querySelector(".tome-syncing-bar.is-indeterminate")).toBeTruthy();
  });
});
