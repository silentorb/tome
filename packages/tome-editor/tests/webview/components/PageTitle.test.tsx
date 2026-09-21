import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PageTitle, stripTitleNewlines } from "../../../src/webview/components/PageTitle";

describe("stripTitleNewlines", () => {
  test("removes LF, CR, and CRLF", () => {
    expect(stripTitleNewlines("Line\none")).toBe("Lineone");
    expect(stripTitleNewlines("Line\rone")).toBe("Lineone");
    expect(stripTitleNewlines("Line\r\none")).toBe("Lineone");
  });
});

describe("PageTitle", () => {
  test("selectOnMount focuses and selects the full title", async () => {
    let selected = false;
    render(
      <PageTitle
        value="Untitled"
        onChange={() => {}}
        selectOnMount
        onSelected={() => {
          selected = true;
        }}
      />,
    );

    const title = screen.getByRole("textbox", { name: "Page title" }) as HTMLTextAreaElement;

    await waitFor(() => {
      expect(document.activeElement).toBe(title);
      expect(title.selectionStart).toBe(0);
      expect(title.selectionEnd).toBe("Untitled".length);
      expect(selected).toBe(true);
    });
  });

  test("Enter does not insert a newline and calls onEnter", () => {
    const onChange = mock(() => {});
    const onEnter = mock(() => {});
    render(<PageTitle value="Scene One" onChange={onChange} onEnter={onEnter} />);

    const title = screen.getByRole("textbox", { name: "Page title" }) as HTMLTextAreaElement;
    title.focus();
    fireEvent.keyDown(title, { key: "Enter" });

    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(title.value).toBe("Scene One");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("strips newlines from pasted or typed input", () => {
    const values: string[] = [];
    render(
      <PageTitle
        value="Alpha"
        onChange={(next) => {
          values.push(next);
        }}
      />,
    );

    const title = screen.getByRole("textbox", { name: "Page title" }) as HTMLTextAreaElement;
    fireEvent.change(title, { target: { value: "Alpha\nBeta" } });

    expect(values).toEqual(["AlphaBeta"]);
  });
});
