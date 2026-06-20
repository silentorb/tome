import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { TableAddRow, TableAddRowFooter, TableAddRowTrigger } from "../../../src/webview/components/TableAddRowFooter";

describe("TableAddRow", () => {
  test("top New button expands the same footer form as the footer trigger", () => {
    const onSubmit = async () => {};

    render(
      <TableAddRow label="New row" onSubmit={onSubmit}>
        <TableAddRowTrigger />
        <TableAddRowFooter />
      </TableAddRow>,
    );

    expect(screen.queryByPlaceholderText("Name")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "New" }));

    expect(screen.getByPlaceholderText("Name")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "+ New row" })).toBeNull();
  });
});
