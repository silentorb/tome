import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { ColumnHeaderMenu } from "../../../src/webview/components/ColumnHeaderMenu";

describe("ColumnHeaderMenu", () => {
  test("opens delete menu on context menu and confirms deletion", () => {
    let deleted = false;

    render(
      <ColumnHeaderMenu
        columnLabel="Priority"
        onDelete={async () => {
          deleted = true;
        }}
      >
        <span>Priority</span>
      </ColumnHeaderMenu>,
    );

    fireEvent.contextMenu(screen.getByText("Priority"));
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeTruthy();

    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(screen.getByRole("alertdialog", { name: "Delete column?" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Delete column" }));
    expect(deleted).toBe(true);
  });

  test("shows relation-specific confirm message", () => {
    render(
      <ColumnHeaderMenu columnLabel="Parents" isRelation onDelete={async () => {}}>
        <span>Parents</span>
      </ColumnHeaderMenu>,
    );

    fireEvent.contextMenu(screen.getByText("Parents"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(screen.getByText(/unlinks all related records from every row/)).toBeTruthy();
  });
});
