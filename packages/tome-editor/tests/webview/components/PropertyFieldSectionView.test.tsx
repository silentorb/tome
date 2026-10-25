import { afterEach, describe, expect, test } from "bun:test";
import { useEffect, useState } from "react";
import { render, screen } from "@testing-library/react";
import type { PropertyFieldSection } from "tome-graph-interfaces";
import { PropertyFieldSectionView } from "../../../src/webview/components/PropertyFieldSectionView";
import {
  getPropertyFieldRegistration,
  registerInteractivePageBlockForTests,
  resetPageBlockRegistryForTests,
} from "../../../src/webview/extensions/page-block-registry";
import { makeMockEditorApi } from "../test-fixtures/mock-api";

const IMP_GRAPH_SECTION: PropertyFieldSection = {
  type: "property",
  key: "predicate",
  title: "Selection filter",
  columnType: "imp_graph",
  storage: "node",
  databaseId: "01PREDTYPEHUB0000000000000",
  value: { nodes: {}, edges: {} },
};

afterEach(() => {
  resetPageBlockRegistryForTests();
});

describe("PropertyFieldSectionView", () => {
  test("imp_graph mounts registered Component as a child after registry loads (hooks-safe)", () => {
    resetPageBlockRegistryForTests();
    const api = makeMockEditorApi();

    function renderView() {
      return (
        <PropertyFieldSectionView
          api={api}
          nodeId="01M452X8E6TY4RZCSTTEEECZAH"
          section={IMP_GRAPH_SECTION}
          onUpdated={() => {}}
        />
      );
    }

    const { rerender } = render(renderView());
    expect(document.querySelector(".tome-property-field-json")).toBeTruthy();
    expect(getPropertyFieldRegistration("imp_graph")).toBeNull();

    registerInteractivePageBlockForTests(
      {
        id: "ontology.node-filter",
        roles: ["ontology.node-filter"],
        extensionId: "tome-ontology-ui",
        implementationId: "tome-ontology-ui.node-filter",
        label: "Node filter",
        interactive: true,
      },
      {
        implementationId: "tome-ontology-ui.node-filter",
        interactive: true,
        propertyColumnTypes: ["imp_graph"],
        Component({ ctx }: { ctx: { component: { label: string } } }) {
          const [ready, setReady] = useState(false);
          useEffect(() => {
            setReady(true);
          }, []);
          return (
            <div data-testid="imp-graph-field">
              {ctx.component.label}
              {ready ? " ready" : ""}
            </div>
          );
        },
      },
    );
    expect(getPropertyFieldRegistration("imp_graph")).not.toBeNull();

    // Fresh element after late registration — must not throw hooks mismatch from
    // calling the field Component as a plain function.
    expect(() => rerender(renderView())).not.toThrow();
    expect(screen.getByTestId("imp-graph-field")).toBeTruthy();
    expect(document.querySelector(".tome-property-field-json")).toBeNull();
  });
});
