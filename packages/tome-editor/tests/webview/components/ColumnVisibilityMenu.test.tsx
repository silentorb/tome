import { describe, expect, test, mock } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { ColumnVisibilityMenu } from "../../../src/webview/components/ColumnVisibilityMenu";

describe("ColumnVisibilityMenu", () => {
  test("lists columns and toggles visibility", () => {
    const onToggle = mock(() => {});

    render(
      <ColumnVisibilityMenu
        columns={["status", "priority"]}
        columnLabels={{ status: "Status", priority: "Priority" }}
        hiddenColumns={["priority"]}
        onToggle={onToggle}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Column visibility" }));
    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.getByText("Priority")).toBeTruthy();

    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Show Priority" }));
    expect(onToggle).toHaveBeenCalledWith("priority");
  });

  test("closes when clicking outside", () => {
    render(
      <ColumnVisibilityMenu
        columns={["status"]}
        hiddenColumns={[]}
        onToggle={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Column visibility" }));
    expect(screen.getByRole("menu", { name: "Column visibility" })).toBeTruthy();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu", { name: "Column visibility" })).toBeNull();
  });
});
