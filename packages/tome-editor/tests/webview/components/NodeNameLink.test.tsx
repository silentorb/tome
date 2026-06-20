import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { NodeNameLink, SectionTitle } from "../../../src/webview/components/NodeNameLink";
import { makeMockEditorApi } from "../test-fixtures/mock-api";
import { FIXTURE_TYPE_ID } from "../test-fixtures/node-page";

describe("NodeNameLink", () => {
  test("link uses native ?node= href", () => {
    render(
      <NodeNameLink api={makeMockEditorApi()} nodeId={FIXTURE_TYPE_ID}>
        Features
      </NodeNameLink>,
    );

    const link = screen.getByRole("link", { name: "Features" });
    expect(link.getAttribute("href")).toContain(`node=${FIXTURE_TYPE_ID}`);
  });
});

describe("SectionTitle", () => {
  test("section title link uses native ?node= href", () => {
    render(
      <SectionTitle
        api={makeMockEditorApi()}
        title="Features"
        typeNodeId={FIXTURE_TYPE_ID}
      />,
    );

    const link = screen.getByRole("link", { name: "Features" });
    expect(link.getAttribute("href")).toContain(`node=${FIXTURE_TYPE_ID}`);
  });
});
