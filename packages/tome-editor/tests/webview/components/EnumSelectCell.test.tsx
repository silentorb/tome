import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { EnumSelectCell } from "../../../src/webview/components/EnumSelectCell";

const columnDef = {
  key: "priority",
  name: "Priority",
  type: "enum" as const,
  enumId: "priority",
  options: ["Low", "High"],
  defaultValue: "Low",
};

describe("EnumSelectCell", () => {
  test("collapsed trigger shows current value as pill", () => {
    render(<EnumSelectCell def={columnDef} value="High" onChange={async () => {}} />);

    const trigger = screen.getByRole("button", { name: "Priority" });
    expect(trigger.textContent).toBe("High");
    expect(trigger.className).toContain("tome-database-cell-badge");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("empty value shows placeholder, not schema default", () => {
    render(<EnumSelectCell def={columnDef} value="" onChange={async () => {}} />);

    const trigger = screen.getByRole("button", { name: "Priority" });
    expect(trigger.textContent).toBe("—");
    expect(trigger.className).toContain("is-empty");
  });

  test("click opens options and selecting calls onChange", () => {
    const onChange = mock(async () => {});

    render(<EnumSelectCell def={columnDef} value="High" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Priority" }));
    expect(screen.getByRole("listbox", { name: "Priority" })).toBeTruthy();

    fireEvent.click(screen.getByRole("option", { name: /Low/ }));
    expect(onChange).toHaveBeenCalledWith("Low");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("selecting current value does not call onChange", () => {
    const onChange = mock(async () => {});

    render(<EnumSelectCell def={columnDef} value="High" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Priority" }));
    fireEvent.click(screen.getByRole("option", { name: /High/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  test("empty value can pick default without spurious display", () => {
    const onChange = mock(async () => {});

    render(<EnumSelectCell def={columnDef} value="" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Priority" }));
    fireEvent.click(screen.getByRole("option", { name: /Low/ }));
    expect(onChange).toHaveBeenCalledWith("Low");
  });

  test("disabled trigger does not open menu", () => {
    render(<EnumSelectCell def={columnDef} value="High" disabled onChange={async () => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Priority" }));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("defaultOrder desc reverses dropdown option order", () => {
    render(
      <EnumSelectCell
        def={{ ...columnDef, defaultOrder: "desc" }}
        value="High"
        onChange={async () => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Priority" }));
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent?.replace("✓", "").trim())).toEqual([
      "High",
      "Low",
    ]);
  });
});
