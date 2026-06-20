import { describe, expect, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { PageTitle } from "../../../src/webview/components/PageTitle";

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
});
