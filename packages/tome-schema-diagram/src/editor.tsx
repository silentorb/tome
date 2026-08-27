import type { EditorPageBlockHost } from "tome-interfaces/page-block/editor";
import {
  defaultSchemaDiagramBlockData,
  type SchemaDiagramBlockData,
} from "./config";

const IMPLEMENTATION_ID = "schema-diagram";

export function register(host: EditorPageBlockHost): void {
  host.registerPageBlock({
    implementationId: IMPLEMENTATION_ID,
    slashMenu: { label: "Schema diagram", group: "custom", order: 30 },
    insertDefaultData: () => defaultSchemaDiagramBlockData(),
    Component({ ctx, blockData }) {
      const data: SchemaDiagramBlockData =
        blockData && typeof blockData === "object" && !Array.isArray(blockData)
          ? (blockData as SchemaDiagramBlockData)
          : defaultSchemaDiagramBlockData();
      const typeIds = Array.isArray(data.typeIds) ? data.typeIds.length : 0;
      const perspectives = Array.isArray(data.perspectives)
        ? data.perspectives.length
        : 0;
      const scope =
        typeIds > 0
          ? `${typeIds} type(s)`
          : perspectives > 0
            ? `all types, ${perspectives} relationship filter(s)`
            : "full project schema";

      return (
        <div className="tome-page-block-schema-diagram" data-component-id={ctx.component.id}>
          <strong>{ctx.component.label}</strong>
          <p>Scope: {scope}. Diagram renders when the page loads in the editor.</p>
        </div>
      );
    },
  });
}

export { IMPLEMENTATION_ID };
