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
import type { SequenceEndpoint } from "tome-sequencing-interfaces";
import { eventBarRect } from "./bar-geometry";
import { dependsEdgePath } from "./depends-edge-path";
import { dependsKindLabel } from "./depends-endpoints";
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
  pickStart: "rgba(122, 196, 186, 0.92)",
  pickEnd: "rgba(210, 170, 90, 0.88)",
} as const;

/** Gear / cog for view settings menus (matches Graph Explorer convention). */
const SETTINGS_ICON = "⚙";

/** Fixed lane height so concurrent events stay readable. */
export const LANE_HEIGHT = 48;

export type DependsPickDirection = "dependency" | "dependent";

function barEndpointX(
  rect: { x: number; width: number },
  endpoint: SequenceEndpoint,
): number {
  return endpoint === "start" ? rect.x : rect.x + rect.width;
}

function isUnmodifiedPrimaryClick(
  event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean },
): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

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

/** Flat concurrency lanes (query groups occupy stacked bands). */
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
  selectedEventId,
  pickModeEventId,
  pickActive,
  onEventActivate,
  onPickEndpoint,
}: {
  layout: TimelineLayout;
  width: number;
  viewOptions: TimelineViewOptions;
  nodePageHref: (id: string) => string;
  selectedEventId: string | null;
  pickModeEventId: string | null;
  pickActive: boolean;
  onEventActivate: (eventId: string) => void;
  onPickEndpoint: (eventId: string, endpoint: SequenceEndpoint) => void;
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
              cursor: pickModeEventId
                ? "pointer"
                : zoom.isDragging
                  ? "grabbing"
                  : "grab",
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
                layout.depends.map((edge, index) => {
                  const from = byId.get(edge.prerequisiteId);
                  const to = byId.get(edge.dependentId);
                  if (!from || !to) return null;
                  const fromRect = eventBarRect(x, from.start, from.end);
                  const toRect = eventBarRect(x, to.start, to.end);
                  const x1 = barEndpointX(fromRect, edge.from);
                  const x2 = barEndpointX(toRect, edge.to);
                  const y1 = yLayout.eventY(from.lane) + LANE_HEIGHT / 2;
                  const y2 = yLayout.eventY(to.lane) + LANE_HEIGHT / 2;
                  const bulgeSign = index % 2 === 0 ? 1 : -1;
                  return (
                    <path
                      key={`${edge.prerequisiteId}:${edge.from}-${edge.dependentId}:${edge.to}`}
                      d={dependsEdgePath(x1, y1, x2, y2, bulgeSign)}
                      className="tome-sequencing-depends-edge"
                      stroke={TIMELINE_COLORS.edge}
                      strokeWidth={1.5}
                      fill="none"
                      pointerEvents="none"
                    />
                  );
                })}
              {layout.events.map((event) => {
                const barY = yLayout.eventY(event.lane) + barPad;
                const { x: barX, width: barW } = eventBarRect(x, event.start, event.end);
                const href = nodePageHref(event.id);
                const isSource = pickModeEventId === event.id || selectedEventId === event.id;
                const showPickTargets = pickActive && pickModeEventId !== event.id;
                const bandW = Math.max(2, barW / 2);
                return (
                  <a
                    key={event.id}
                    href={href}
                    className={
                      "tome-sequencing-event-link" +
                      (isSource ? " tome-sequencing-event-link-selected" : "")
                    }
                    data-event-id={event.id}
                    onClick={(clickEvent) => {
                      if (!isUnmodifiedPrimaryClick(clickEvent)) return;
                      clickEvent.preventDefault();
                      clickEvent.stopPropagation();
                      if (pickActive) return;
                      onEventActivate(event.id);
                    }}
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
                    {showPickTargets && (
                      <>
                        <g
                          role="button"
                          aria-label={`Pick start of ${event.title}`}
                          data-event-id={event.id}
                          data-pick-endpoint="start"
                          onClick={(clickEvent) => {
                            if (!isUnmodifiedPrimaryClick(clickEvent)) return;
                            clickEvent.preventDefault();
                            clickEvent.stopPropagation();
                            onPickEndpoint(event.id, "start");
                          }}
                        >
                          <rect
                            x={barX}
                            y={barY}
                            width={bandW}
                            height={barH}
                            className="tome-sequencing-pick-start"
                            fill={TIMELINE_COLORS.pickStart}
                            rx={3}
                          />
                        </g>
                        <g
                          role="button"
                          aria-label={`Pick end of ${event.title}`}
                          data-event-id={event.id}
                          data-pick-endpoint="end"
                          onClick={(clickEvent) => {
                            if (!isUnmodifiedPrimaryClick(clickEvent)) return;
                            clickEvent.preventDefault();
                            clickEvent.stopPropagation();
                            onPickEndpoint(event.id, "end");
                          }}
                        >
                          <rect
                            x={barX + bandW}
                            y={barY}
                            width={Math.max(2, barW - bandW)}
                            height={barH}
                            className="tome-sequencing-pick-end"
                            fill={TIMELINE_COLORS.pickEnd}
                            rx={3}
                          />
                        </g>
                      </>
                    )}
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

function DependsPopup({
  layout,
  eventId,
  nodePageHref,
  readOnly,
  onClose,
  onAdd,
  onRemove,
}: {
  layout: TimelineLayout;
  eventId: string;
  nodePageHref: (id: string) => string;
  readOnly: boolean;
  onClose: () => void;
  onAdd: (direction: DependsPickDirection, endpoint: SequenceEndpoint) => void;
  onRemove: (
    prerequisiteId: string,
    dependentId: string,
    from: SequenceEndpoint,
    to: SequenceEndpoint,
  ) => void;
}) {
  const event = layout.events.find((item) => item.id === eventId);
  const titleById = useMemo(
    () => new Map(layout.events.map((item) => [item.id, item.title])),
    [layout.events],
  );
  const dependencies = layout.depends.filter((edge) => edge.dependentId === eventId);
  const dependents = layout.depends.filter((edge) => edge.prerequisiteId === eventId);
  const title = event?.title ?? eventId;

  return (
    <div
      className="tome-sequencing-depends-popup"
      role="dialog"
      aria-label={`Dependencies for ${title}`}
    >
      <div className="tome-sequencing-depends-popup-header">
        <a href={nodePageHref(eventId)} className="tome-sequencing-depends-popup-title">
          {title}
        </a>
        <button
          type="button"
          className="tome-sequencing-depends-popup-close"
          aria-label="Close dependency editor"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="tome-sequencing-depends-popup-columns">
        <div className="tome-sequencing-depends-column">
          <h3>Dependencies</h3>
          <ul>
            {dependencies.length === 0 && (
              <li className="tome-sequencing-depends-empty">None</li>
            )}
            {dependencies.map((edge) => {
              const otherTitle = titleById.get(edge.prerequisiteId) ?? edge.prerequisiteId;
              const kind = dependsKindLabel(edge.from, edge.to);
              return (
                <li key={`${edge.prerequisiteId}:${edge.from}-${edge.dependentId}:${edge.to}`}>
                  <span className="tome-sequencing-depends-item">
                    <span>{otherTitle}</span>
                    <span className="tome-sequencing-depends-kind">{kind}</span>
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      aria-label={`Remove dependency ${otherTitle} ${kind}`}
                      onClick={() =>
                        onRemove(edge.prerequisiteId, edge.dependentId, edge.from, edge.to)
                      }
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {!readOnly && (
            <div className="tome-sequencing-depends-add-row">
              <button
                type="button"
                aria-label="Add start dependency"
                onClick={() => onAdd("dependency", "start")}
              >
                Add Start
              </button>
              <button
                type="button"
                aria-label="Add end dependency"
                onClick={() => onAdd("dependency", "end")}
              >
                Add End
              </button>
            </div>
          )}
        </div>
        <div className="tome-sequencing-depends-column">
          <h3>Dependents</h3>
          <ul>
            {dependents.length === 0 && (
              <li className="tome-sequencing-depends-empty">None</li>
            )}
            {dependents.map((edge) => {
              const otherTitle = titleById.get(edge.dependentId) ?? edge.dependentId;
              const kind = dependsKindLabel(edge.from, edge.to);
              return (
                <li key={`${edge.prerequisiteId}:${edge.from}-${edge.dependentId}:${edge.to}`}>
                  <span className="tome-sequencing-depends-item">
                    <span>{otherTitle}</span>
                    <span className="tome-sequencing-depends-kind">{kind}</span>
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      aria-label={`Remove dependent ${otherTitle} ${kind}`}
                      onClick={() =>
                        onRemove(edge.prerequisiteId, edge.dependentId, edge.from, edge.to)
                      }
                    >
                      ×
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {!readOnly && (
            <div className="tome-sequencing-depends-add-row">
              <button
                type="button"
                aria-label="Add start dependent"
                onClick={() => onAdd("dependent", "start")}
              >
                Add Start
              </button>
              <button
                type="button"
                aria-label="Add end dependent"
                onClick={() => onAdd("dependent", "end")}
              >
                Add End
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SequencingTimelineView({
  layout,
  nodePageHref = sequencingNodePageHref,
  graphParameters = [],
  parameterValues = {},
  onParameterChange,
  showDependencyEdges: showDependencyEdgesProp,
  onShowDependencyEdgesChange,
  onAddDepends,
  onRemoveDepends,
  readOnly,
}: {
  layout: TimelineLayout;
  nodePageHref?: (id: string) => string;
  graphParameters?: GraphParameterSpec[];
  parameterValues?: Record<string, GraphParameterValue>;
  onParameterChange?: (paramId: string, value: GraphParameterValue) => void;
  showDependencyEdges?: boolean;
  onShowDependencyEdgesChange?: (value: boolean) => void;
  onAddDepends?: (
    prerequisiteId: string,
    dependentId: string,
    from: SequenceEndpoint,
    to: SequenceEndpoint,
  ) => Promise<void> | void;
  onRemoveDepends?: (
    prerequisiteId: string,
    dependentId: string,
    from: SequenceEndpoint,
    to: SequenceEndpoint,
  ) => Promise<void> | void;
  readOnly?: boolean;
}) {
  const [showChronologyUnits, setShowChronologyUnits] = useState(
    DEFAULT_VIEW_OPTIONS.showChronologyUnits,
  );
  const [showDependencyEdges, setShowDependencyEdges] = useState(
    () => showDependencyEdgesProp ?? DEFAULT_VIEW_OPTIONS.showDependencyEdges,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [pickMode, setPickMode] = useState<{
    eventId: string;
    direction: DependsPickDirection;
    endpoint: SequenceEndpoint;
  } | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const viewOnly = Boolean(readOnly) || !onAddDepends || !onRemoveDepends;

  useEffect(() => {
    if (showDependencyEdgesProp === undefined) return;
    setShowDependencyEdges(showDependencyEdgesProp);
  }, [showDependencyEdgesProp]);

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

  useEffect(() => {
    if (!selectedEventId && !pickMode) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (pickMode) {
        setPickMode(null);
        setSelectedEventId(pickMode.eventId);
        return;
      }
      setSelectedEventId(null);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedEventId, pickMode]);

  const viewOptions: TimelineViewOptions = {
    showChronologyUnits,
    showDependencyEdges,
  };

  const handleEventActivate = (eventId: string) => {
    setSelectedEventId(eventId);
  };

  const handlePickEndpoint = (eventId: string, endpoint: SequenceEndpoint) => {
    if (!pickMode || eventId === pickMode.eventId) return;
    const prerequisiteId =
      pickMode.direction === "dependency" ? eventId : pickMode.eventId;
    const dependentId =
      pickMode.direction === "dependency" ? pickMode.eventId : eventId;
    const from = pickMode.direction === "dependency" ? endpoint : pickMode.endpoint;
    const to = pickMode.direction === "dependency" ? pickMode.endpoint : endpoint;
    const originId = pickMode.eventId;
    setPickMode(null);
    setSelectedEventId(originId);
    void onAddDepends?.(prerequisiteId, dependentId, from, to);
  };

  const startPick = (direction: DependsPickDirection, endpoint: SequenceEndpoint) => {
    if (!selectedEventId) return;
    setPickMode({ eventId: selectedEventId, direction, endpoint });
  };

  const cancelPick = () => {
    if (!pickMode) return;
    setSelectedEventId(pickMode.eventId);
    setPickMode(null);
  };

  return (
    <div className="tome-sequencing-timeline">
      <div className="tome-sequencing-chrome">
        {pickMode ? (
          <div className="tome-sequencing-pick-banner">
            <span>
              {pickMode.direction === "dependency"
                ? "Click a start or end to add a dependency"
                : "Click a start or end to add a dependent"}
            </span>
            <button type="button" onClick={cancelPick}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="tome-sequencing-chrome-spacer" />
        )}
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
                  checked={showChronologyUnits}
                  onChange={(e) => setShowChronologyUnits(e.target.checked)}
                />
                <span>Show chronology units</span>
              </label>
              <label className="tome-sequencing-settings-item">
                <input
                  type="checkbox"
                  checked={showDependencyEdges}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setShowDependencyEdges(checked);
                    onShowDependencyEdgesChange?.(checked);
                  }}
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
        {selectedEventId && !pickMode && (
          <DependsPopup
            layout={layout}
            eventId={selectedEventId}
            nodePageHref={nodePageHref}
            readOnly={viewOnly}
            onClose={() => setSelectedEventId(null)}
            onAdd={startPick}
            onRemove={(prerequisiteId, dependentId, from, to) => {
              void onRemoveDepends?.(prerequisiteId, dependentId, from, to);
            }}
          />
        )}
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
                selectedEventId={selectedEventId}
                pickModeEventId={pickMode?.eventId ?? null}
                pickActive={Boolean(pickMode)}
                onEventActivate={handleEventActivate}
                onPickEndpoint={handlePickEndpoint}
              />
            );
          }}
        </ParentSize>
      </div>
    </div>
  );
}
