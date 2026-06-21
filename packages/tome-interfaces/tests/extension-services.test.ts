import { describe, expect, test } from "bun:test";
import type {
  ExtensionGraphQueryServices,
  GraphQueryEdge,
  GraphQueryNode,
} from "tome-interfaces/extension-services/graph-query";
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
