import { useEffect, useMemo, useRef, useState } from "react";
import { Group } from "@visx/group";
import { AxisBottom } from "@visx/axis";
import { scaleLinear } from "@visx/scale";
import { Bar } from "@visx/shape";
import { ParentSize } from "@visx/responsive";
import { Zoom } from "@visx/zoom";
import type { TransformMatrix } from "@visx/zoom/lib/types";
import { GraphParameterControls } from "tome-query/graph-parameter-controls";
import type {
  GraphParameterSpec,
  GraphParameterValue,
} from "tome-query/parameters";
import { eventBarRect } from "./bar-geometry";
import type { TimelineLayout } from "./layout";
import { sequencingNodePageHref } from "./node-links";

export interface TimelineViewOptions {
  showDependencyEdges: boolean;
  /** When true, show the chronological (relative time) axis ticks/labels. */
  showChronologyUnits: boolean;
}

const DEFAULT_VIEW_OPTIONS: TimelineViewOptions = {
  showDependencyEdges: false,
  showChronologyUnits: true,
};

/** Timeline color tokens — also set as SVG presentation attrs so bars stay dark
 * even if extension CSS injection races or fails. */
const TIMELINE_COLORS = {
  canvas: "#12151a",
  core: "#1f6b75",
  label: "#e8eef2",
  muted: "#9aa3ad",
  axis: "#6b7380",
  edge: "rgba(210, 170, 90, 0.75)",
} as const;

/** Gear / cog for view settings menus (matches Graph Explorer convention). */
const SETTINGS_ICON = "⚙";

/** Fixed lane height so concurrent events stay readable. */
export const LANE_HEIGHT = 48;

function rescaleX(
  scale: ReturnType<typeof scaleLinear<number>>,
  transform: { translateX: number; scaleX: number },
) {
  const range = scale.range() as [number, number];
  const domain = range.map((r) =>
    scale.invert((r - transform.translateX) / transform.scaleX),
  ) as [number, number];
  return scale.copy().domain(domain);
}

/** Lock vertical transform so zoom/pan only affect the time axis. */
function constrainHorizontalZoom(matrix: TransformMatrix): TransformMatrix {
  return {
    ...matrix,
    scaleY: 1,
    translateY: 0,
  };
}

export interface LaneYLayout {
  laneCount: number;
  contentHeight: number;
  eventY(lane: number): number;
}

/** Flat concurrency lanes (no macro tracks). */
export function buildLaneYLayout(layout: TimelineLayout): LaneYLayout {
  const laneCount = Math.max(1, layout.laneCount || 1);
  return {
    laneCount,
    contentHeight: laneCount * LANE_HEIGHT,
    eventY(lane: number) {
      return lane * LANE_HEIGHT;
    },
  };
}

/** @deprecated Use buildLaneYLayout — kept name alias for older test imports. */
export function buildTrackYLayout(layout: TimelineLayout): LaneYLayout {
  return buildLaneYLayout(layout);
}

export function timelineSvgHeight(
  contentHeight: number,
  showChronologyUnits: boolean,
): number {
  const top = 16;
  const bottom = showChronologyUnits ? 36 : 12;
  return top + bottom + contentHeight;
}

function TimelineCanvas({
  layout,
  width,
  viewOptions,
  nodePageHref,
}: {
  layout: TimelineLayout;
  width: number;
  viewOptions: TimelineViewOptions;
  nodePageHref: (id: string) => string;
}) {
  const margin = {
    top: 16,
    right: 16,
    bottom: viewOptions.showChronologyUnits ? 36 : 12,
    left: 16,
  };
  const yLayout = useMemo(() => buildLaneYLayout(layout), [layout]);
  const svgH = timelineSvgHeight(yLayout.contentHeight, viewOptions.showChronologyUnits);
  const innerW = Math.max(40, width - margin.left - margin.right);
  const axisBottomY = yLayout.contentHeight;
  const barPad = LANE_HEIGHT * 0.1;
  const barH = Math.max(2, LANE_HEIGHT - barPad * 2);

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [layout.timeMin, layout.timeMax],
        range: [0, innerW],
        nice: true,
      }),
    [layout.timeMin, layout.timeMax, innerW],
  );

  const byId = useMemo(
    () => new Map(layout.events.map((e) => [e.id, e])),
    [layout.events],
  );

  return (
    <Zoom<SVGSVGElement>
      width={width}
      height={svgH}
      scaleXMin={0.25}
      scaleXMax={16}
      scaleYMin={1}
      scaleYMax={1}
      constrain={constrainHorizontalZoom}
      wheelDelta={(event) => {
        const factor = event.deltaY > 0 ? 0.95 : 1.05;
        return { scaleX: factor, scaleY: 1 };
      }}
    >
      {(zoom) => {
        const x = rescaleX(xScale, zoom.transformMatrix);
        return (
          <svg
            width={width}
            height={svgH}
            className="tome-sequencing-svg"
            ref={zoom.containerRef}
            style={{
              cursor: zoom.isDragging ? "grabbing" : "grab",
              touchAction: "none",
              background: TIMELINE_COLORS.canvas,
            }}
          >
            <rect
              width={width}
              height={svgH}
              fill={TIMELINE_COLORS.canvas}
              onMouseDown={zoom.dragStart}
              onMouseMove={zoom.dragMove}
              onMouseUp={zoom.dragEnd}
              onMouseLeave={() => {
                if (zoom.isDragging) zoom.dragEnd();
              }}
            />
            <Group left={margin.left} top={margin.top}>
              {viewOptions.showChronologyUnits && (
                <AxisBottom
                  top={axisBottomY}
                  scale={x}
                  stroke={TIMELINE_COLORS.axis}
                  tickStroke={TIMELINE_COLORS.axis}
                  tickLabelProps={() => ({
                    fill: TIMELINE_COLORS.muted,
                    fontSize: 11,
                    textAnchor: "middle",
                  })}
                />
              )}
              {viewOptions.showDependencyEdges &&
                layout.depends.map((edge) => {
                  const from = byId.get(edge.prerequisiteId);
                  const to = byId.get(edge.dependentId);
                  if (!from || !to) return null;
                  const x1 = x(from.end);
                  const x2 = x(to.start);
                  const y1 = yLayout.eventY(from.lane) + LANE_HEIGHT / 2;
                  const y2 = yLayout.eventY(to.lane) + LANE_HEIGHT / 2;
                  return (
                    <line
                      key={`${edge.prerequisiteId}-${edge.dependentId}`}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      className="tome-sequencing-depends-edge"
                      stroke={TIMELINE_COLORS.edge}
                      strokeWidth={1.5}
                    />
                  );
                })}
              {layout.events.map((event) => {
                const barY = yLayout.eventY(event.lane) + barPad;
                const { x: barX, width: barW } = eventBarRect(x, event.start, event.end);
                const href = nodePageHref(event.id);
                return (
                  <a
                    key={event.id}
                    href={href}
                    className="tome-sequencing-event-link"
                  >
                    <Bar
                      x={barX}
                      y={barY}
                      width={barW}
                      height={barH}
                      className="tome-sequencing-event-core"
                      fill={TIMELINE_COLORS.core}
                      rx={3}
                    />
                    <text
                      x={barX + 6}
                      y={barY + barH / 2}
                      dy="0.35em"
                      className="tome-sequencing-event-label"
                      fill={TIMELINE_COLORS.label}
                      fontSize={11}
                    >
                      {event.title}
                    </text>
                    <title>{event.title}</title>
                  </a>
                );
              })}
            </Group>
          </svg>
        );
      }}
    </Zoom>
  );
}

export function SequencingTimelineView({
  layout,
  nodePageHref = sequencingNodePageHref,
  graphParameters = [],
  parameterValues = {},
  onParameterChange,
}: {
  layout: TimelineLayout;
  nodePageHref?: (id: string) => string;
  graphParameters?: GraphParameterSpec[];
  parameterValues?: Record<string, GraphParameterValue>;
  onParameterChange?: (paramId: string, value: GraphParameterValue) => void;
}) {
  const [viewOptions, setViewOptions] = useState<TimelineViewOptions>(DEFAULT_VIEW_OPTIONS);
  const [menuOpen, setMenuOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="tome-sequencing-timeline">
      <div className="tome-sequencing-chrome">
        <div className="tome-sequencing-chrome-spacer" />
        <div className="tome-sequencing-settings" ref={settingsRef}>
          <button
            type="button"
            className="tome-sequencing-settings-trigger"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Timeline settings"
            title="Timeline settings"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="tome-sequencing-settings-icon" aria-hidden="true">
              {SETTINGS_ICON}
            </span>
          </button>
          {menuOpen && (
            <div className="tome-sequencing-settings-menu" role="menu">
              <label className="tome-sequencing-settings-item">
                <input
                  type="checkbox"
                  checked={viewOptions.showChronologyUnits}
                  onChange={(e) =>
                    setViewOptions((prev) => ({
                      ...prev,
                      showChronologyUnits: e.target.checked,
                    }))
                  }
                />
                <span>Show chronology units</span>
              </label>
              <label className="tome-sequencing-settings-item">
                <input
                  type="checkbox"
                  checked={viewOptions.showDependencyEdges}
                  onChange={(e) =>
                    setViewOptions((prev) => ({
                      ...prev,
                      showDependencyEdges: e.target.checked,
                    }))
                  }
                />
                <span>Show dependency edges</span>
              </label>
              {graphParameters.length > 0 && onParameterChange ? (
                <GraphParameterControls
                  parameters={graphParameters}
                  values={parameterValues}
                  onChange={onParameterChange}
                  className="tome-sequencing-graph-parameters"
                />
              ) : null}
            </div>
          )}
        </div>
      </div>
      <div className="tome-sequencing-canvas">
        <ParentSize
          parentSizeStyles={{ width: "100%", height: "auto" }}
          ignoreDimensions={["height", "top", "left"]}
        >
          {({ width }) => {
            const w = width > 0 ? width : 640;
            return (
              <TimelineCanvas
                layout={layout}
                width={w}
                viewOptions={viewOptions}
                nodePageHref={nodePageHref}
              />
            );
          }}
        </ParentSize>
      </div>
    </div>
  );
}
