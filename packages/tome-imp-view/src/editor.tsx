import { useCallback, useMemo, useRef, useState } from "react";
import { graphSource, type Graph } from "imp-core-types";
import { ImpGraphView, applyGraphEdits, type GraphEdit } from "imp-graph-view";
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
  /**
   * Offer the add-node picker (Shift+A over the canvas, double-click empty canvas, or the
   * + control). Default true; ignored when `readOnly`.
   */
  showPalette?: boolean;
}

/**
 * Tome tool-panel embed around ImpGraphView: registry→resolvePorts, the add-node picker's
 * node types, and layout bridging for page-block fences.
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

  // Tome pages hold one Imp document; edits apply to it. Latest emitted graph, so edits that
  // arrive before the host re-renders still compose.
  const latestGraph = useRef(graph);
  latestGraph.current = graph;
  const source = useMemo(() => graphSource(graph), [graph]);
  const applyEdits = useCallback(
    (edits: GraphEdit[]) => {
      const next = applyGraphEdits(latestGraph.current, edits);
      latestGraph.current = next;
      onGraphChange(next);
    },
    [onGraphChange],
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

  return (
    <div className={["tome-imp-view", className].filter(Boolean).join(" ")}>
      <div className="tome-imp-view-canvas">
        <ImpGraphView
          source={source}
          addableNodeTypes={palette}
          layout={localLayout}
          resolvePorts={resolvePorts}
          readOnly={readOnly}
          nodesDraggable={!readOnly}
          onEdit={readOnly ? undefined : applyEdits}
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
