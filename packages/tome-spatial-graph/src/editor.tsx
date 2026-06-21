import type { EditorPageBlockHost } from "tome-interfaces/page-block/editor";
import { defaultSpatialGraphBlockData } from "./config";

const COMPONENT_ID = "spatial-graph.block";
const IMPLEMENTATION_ID = "spatial-graph";

export function register(host: EditorPageBlockHost): void {
  host.registerPageBlock({
    implementationId: IMPLEMENTATION_ID,
    slashMenu: { label: "Spatial graph", group: "custom", order: 20 },
    insertDefaultData: () => defaultSpatialGraphBlockData(),
    Component({ ctx, blockData }) {
      const data =
        blockData && typeof blockData === "object" && !Array.isArray(blockData)
          ? blockData
          : defaultSpatialGraphBlockData();
      const relationships =
        data && typeof data === "object" && "relationships" in data
          ? (data as { relationships?: unknown }).relationships
          : undefined;
      const rel =
        relationships && typeof relationships === "object" && !Array.isArray(relationships)
          ? (relationships as Record<string, unknown>)
          : {};
      const parentTypes = Array.isArray(rel.parentTypes) ? rel.parentTypes.join(", ") : "parents";
      const neighborTypes = Array.isArray(rel.neighborTypes) ? rel.neighborTypes.join(", ") : "neighbor";

      return (
        <div className="tome-page-block-spatial-graph" data-component-id={ctx.component.id}>
          <strong>{ctx.component.label}</strong>
          <p>
            Type scope: this page ({ctx.nodeId.slice(0, 8)}…). Relationships: parent [{parentTypes}],
            neighbor [{neighborTypes}].
          </p>
        </div>
      );
    },
  });
}

export { COMPONENT_ID, IMPLEMENTATION_ID };
