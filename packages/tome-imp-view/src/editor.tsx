import { useCallback, useMemo, useState } from "react";
import type { Graph } from "imp-core-types";
import { ImpGraphView, addImpNode, type LayoutBox } from "imp-graph-view";
import "imp-graph-view/styles.css";
import "@xyflow/react/dist/style.css";
import {
  listPaletteNodeTypes,
  resolvePortsFromRegistry,
  type CreateRegistry,
} from "./resolve-ports";
import type { GraphLayout } from "./layout";
import "./styles.css";

export type { CreateRegistry } from "./resolve-ports";
export type { GraphLayout } from "./layout";

export interface TomeImpViewProps {
  graph: Graph;
  layout?: GraphLayout;
  readOnly?: boolean;
  onGraphChange: (graph: Graph) => void;
  onLayoutChange?: (layout: GraphLayout) => void;
  createRegistry: CreateRegistry;
  fitViewKey?: string;
  className?: string;
  showPalette?: boolean;
}

/**
 * Tome tool-panel embed around ImpGraphView: registry→resolvePorts, optional palette,
 * and layout bridging for page-block fences.
 */
export function TomeImpView({
  graph,
  layout = {},
  readOnly,
  onGraphChange,
  onLayoutChange,
  createRegistry,
  fitViewKey,
  className,
  showPalette = true,
}: TomeImpViewProps) {
  const resolvePorts = useMemo(
    () => resolvePortsFromRegistry(createRegistry),
    [createRegistry],
  );
  const palette = useMemo(
    () => (showPalette && !readOnly ? listPaletteNodeTypes(createRegistry) : []),
    [createRegistry, readOnly, showPalette],
  );

  const [localLayout, setLocalLayout] = useState<GraphLayout>(layout);

  const layoutKey = useMemo(() => JSON.stringify(layout), [layout]);
  const [prevLayoutKey, setPrevLayoutKey] = useState(layoutKey);
  if (layoutKey !== prevLayoutKey) {
    setPrevLayoutKey(layoutKey);
    setLocalLayout(layout);
  }

  const emitLayout = useCallback(
    (next: GraphLayout) => {
      setLocalLayout(next);
      onLayoutChange?.(next);
    },
    [onLayoutChange],
  );

  const addNode = (typeId: string) => {
    if (readOnly) return;
    const nextGraph = addImpNode(graph, typeId);
    const addedId = Object.keys(nextGraph.nodes).find((id) => !graph.nodes[id]);
    onGraphChange(nextGraph);
    if (addedId) {
      const count = Object.keys(nextGraph.nodes).length;
      const box: LayoutBox = {
        x: 160 + count * 24,
        y: 80 + count * 24,
      };
      emitLayout({ ...localLayout, [addedId]: box });
    }
  };

  return (
    <div className={["tome-imp-view", className].filter(Boolean).join(" ")}>
      {palette.length > 0 ? (
        <div className="tome-imp-view-palette">
          {palette.map((type) => (
            <button
              key={type.id}
              type="button"
              className="tome-imp-view-palette-btn"
              onClick={() => addNode(type.id)}
            >
              {type.id}
            </button>
          ))}
        </div>
      ) : null}
      <div className="tome-imp-view-canvas">
        <ImpGraphView
          graph={graph}
          layout={localLayout}
          resolvePorts={resolvePorts}
          readOnly={readOnly}
          nodesDraggable={!readOnly}
          onGraphChange={readOnly ? undefined : onGraphChange}
          onLayoutChange={readOnly ? undefined : emitLayout}
          fitViewOnLoad
          fitViewKey={fitViewKey}
          className="tome-imp-view-flow"
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}
