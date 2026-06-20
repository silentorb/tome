import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { renderTableCell } from "../../../src/webview/components/table-cell-render";

describe("renderTableCell", () => {
  test("renders enum dropdown when onEnumChange is provided", () => {
    render(
      <>
        {renderTableCell({
          column: "priority",
          value: "High",
          columnDef: {
            key: "priority",
            name: "Priority",
            type: "enum",
            enumId: "priority",
            options: ["Low", "High"],
          },
          onEnumChange: async () => {},
        })}
      </>,
    );
    expect(screen.getByRole("button", { name: "Priority" })).toBeTruthy();
  });

  test("renders read-only enum as badge without handler", () => {
    render(
      <>
        {renderTableCell({
          column: "priority",
          value: "High",
          columnDef: {
            key: "priority",
            name: "Priority",
            type: "enum",
            enumId: "priority",
            options: ["Low", "High"],
          },
        })}
      </>,
    );
    expect(screen.getByText("High")).toBeTruthy();
  });

  test("renders checkbox values", () => {
    render(
      <>
        {renderTableCell({
          column: "done",
          value: "true",
          columnDef: { key: "done", name: "Done", type: "checkbox" },
        })}
      </>,
    );
    expect(screen.getByText("☑")).toBeTruthy();
  });

  test("renders yes_no enum dropdown for plot_is_driven_by_mc_desire column", () => {
    render(
      <>
        {renderTableCell({
          column: "plot_is_driven_by_mc_desire",
          value: "True",
          columnDef: {
            key: "plot_is_driven_by_mc_desire",
            name: "Plot is driven by MC desire",
            type: "enum",
            enumId: "yes_no",
            options: ["False", "True"],
          },
          onEnumChange: async () => {},
        })}
      </>,
    );
    expect(
      screen.getByRole("button", { name: "Plot is driven by MC desire" }),
    ).toBeTruthy();
  });

  test("renders bare select without enum metadata as read-only badge", () => {
    render(
      <>
        {renderTableCell({
          column: "plot_is_driven_by_mc_desire",
          value: "True",
          columnDef: {
            key: "plot_is_driven_by_mc_desire",
            name: "Plot is driven by MC desire",
            type: "select",
          },
        })}
      </>,
    );
    expect(screen.getByText("True")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Plot is driven by MC desire" })).toBeNull();
  });

  test("renders relation values as badges", () => {
    render(
      <>
        {renderTableCell({
          column: "parents",
          value: "Parent A",
          columnDef: { key: "parents", name: "Parents", type: "relation" },
        })}
      </>,
    );
    expect(screen.getByText("Parent A")).toBeTruthy();
  });
});
