import { describe, expect, test } from "bun:test";
import type {
  ExtensionGraphMutateServices,
  ExtensionGraphQueryServices,
  GraphQueryEdge,
  GraphQueryNode,
} from "tome-interfaces/extension-services";
import type { HtmlPageBlockRenderer } from "tome-interfaces/page-block/html";

describe("extension graph query types", () => {
  test("sync graph query services satisfy the contract", () => {
    const nodes: GraphQueryNode[] = [{ id: "a", title: "A" }];
    const edges: GraphQueryEdge[] = [{ id: "e1", sourceId: "a", targetId: "b", type: "neighbor" }];
    const services: ExtensionGraphQueryServices = {
      listTypeMembers() {
        return nodes;
      },
      listEdges() {
        return edges;
      },
    };
    expect(services.listTypeMembers("type1")).toEqual(nodes);
    expect(services.listEdges({ nodeIds: ["a"] })).toEqual(edges);
  });

  test("graph mutate services satisfy the contract", async () => {
    const services: ExtensionGraphMutateServices = {
      linkOutgoing() {
        return null;
      },
      unlinkOutgoing() {
        return "not_found";
      },
      replaceOutgoingProperties() {
        return "not_found";
      },
    };
    expect(services.linkOutgoing({ sourceId: "a", targetId: "b", type: "assoc" })).toBeNull();
    expect(services.unlinkOutgoing("a", "b", "assoc")).toBe("not_found");
    expect(
      services.replaceOutgoingProperties("a", "b", "assoc", { endpoints: [] }),
    ).toBe("not_found");
  });

  test("async html renderer return type is accepted", async () => {
    const renderer: HtmlPageBlockRenderer = {
      implementationId: "async-demo",
      async renderHtml() {
        return "<p>ok</p>";
      },
    };
    await expect(renderer.renderHtml({} as never, {})).resolves.toBe("<p>ok</p>");
  });
});
