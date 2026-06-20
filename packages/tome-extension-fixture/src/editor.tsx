import type { EditorPageBlockHost } from "tome-interfaces/page-block/editor";
import { serializePageBlock } from "tome-interfaces/page-block";

const FIXTURE_COMPONENT_ID = "fixture.demo";

export function register(host: EditorPageBlockHost): void {
  host.registerPageBlock({
    implementationId: "fixture-demo",
    slashMenu: { label: "Fixture block", group: "custom", order: 1 },
    insertDefaultData: () => ({ text: "Fixture" }),
    Component({ ctx, blockData }) {
      const data =
        blockData && typeof blockData === "object" && !Array.isArray(blockData)
          ? (blockData as Record<string, unknown>)
          : {};
      const text = typeof data.text === "string" ? data.text : "Fixture";
      return (
        <div className="tome-page-block-fixture" data-component-id={ctx.component.id}>
          <strong>{ctx.component.label}</strong>: {text}
        </div>
      );
    },
  });
}

export function insertFixtureBlockMarkdown(componentId = FIXTURE_COMPONENT_ID): string {
  return serializePageBlock(componentId, { text: "Fixture" });
}

export { FIXTURE_COMPONENT_ID };
