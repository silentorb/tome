import { useEffect, useMemo, useRef, useState } from "react";
import { Group } from "@visx/group";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { scaleLinear, scaleBand } from "@visx/scale";
import { Bar } from "@visx/shape";
import { ParentSize } from "@visx/responsive";
import { Zoom } from "@visx/zoom";
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

/** Gear / cog for view settings menus (matches Graph Explorer convention). */
const SETTINGS_ICON = "⚙";

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

function rescaleYBand(
  scale: ReturnType<typeof scaleBand<string>>,
  transform: { translateY: number; scaleY: number },
  tracks: string[],
) {
  const bandwidth = (scale.bandwidth() || 1) * transform.scaleY;
  const step = (scale.step() || 1) * transform.scaleY;
  return {
    position(track: string): number {
      const base = scale(track) ?? 0;
      return base * transform.scaleY + transform.translateY;
    },
    bandwidth,
    step,
    tracks,
  };
}

function TimelineCanvas({
  layout,
  width,
  height,
  viewOptions,
  nodePageHref,
}: {
  layout: TimelineLayout;
  width: number;
  height: number;
  viewOptions: TimelineViewOptions;
  nodePageHref: (id: string) => string;
}) {
  const margin = {
    top: 16,
    right: 16,
    bottom: viewOptions.showChronologyUnits ? 36 : 12,
    left: 100,
  };
  const innerW = Math.max(40, width - margin.left - margin.right);
  const innerH = Math.max(40, height - margin.top - margin.bottom);

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [layout.timeMin, layout.timeMax],
        range: [0, innerW],
        nice: true,
      }),
    [layout.timeMin, layout.timeMax, innerW],
  );

  const yScale = useMemo(
    () =>
      scaleBand<string>({
        domain: layout.tracks.length > 0 ? layout.tracks : ["default"],
        range: [0, innerH],
        padding: 0.25,
      }),
    [layout.tracks, innerH],
  );

  const byId = useMemo(
    () => new Map(layout.events.map((e) => [e.id, e])),
    [layout.events],
  );

  return (
    <Zoom<SVGSVGElement>
      width={width}
      height={height}
      scaleXMin={0.25}
      scaleXMax={16}
      scaleYMin={0.25}
      scaleYMax={8}
      wheelDelta={(event) => {
        // Plain wheel → X; Shift+wheel → Y (independent axes).
        const factor = event.deltaY > 0 ? 0.95 : 1.05;
        if (event.shiftKey) {
          return { scaleX: 1, scaleY: factor };
        }
        return { scaleX: factor, scaleY: 1 };
      }}
    >
      {(zoom) => {
        const x = rescaleX(xScale, zoom.transformMatrix);
        const y = rescaleYBand(yScale, zoom.transformMatrix, layout.tracks);
        return (
          <svg
            width={width}
            height={height}
            className="tome-sequencing-svg"
            ref={zoom.containerRef}
            style={{ cursor: zoom.isDragging ? "grabbing" : "grab", touchAction: "none" }}
          >
            <rect
              width={width}
              height={height}
              fill="transparent"
              onMouseDown={zoom.dragStart}
              onMouseMove={zoom.dragMove}
              onMouseUp={zoom.dragEnd}
              onMouseLeave={() => {
                if (zoom.isDragging) zoom.dragEnd();
              }}
            />
            <Group left={margin.left} top={margin.top}>
              <AxisLeft
                scale={yScale}
                tickFormat={(v) => String(v)}
                stroke="var(--tome-border, #888)"
                tickStroke="var(--tome-border, #888)"
                tickLabelProps={() => ({
                  fill: "var(--tome-fg, #ccc)",
                  fontSize: 11,
                  textAnchor: "end",
                  dx: -4,
                  dy: 4,
                })}
              />
              {viewOptions.showChronologyUnits && (
                <AxisBottom
                  top={innerH}
                  scale={x}
                  stroke="var(--tome-border, #888)"
                  tickStroke="var(--tome-border, #888)"
                  tickLabelProps={() => ({
                    fill: "var(--tome-fg, #ccc)",
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
                  const x1 = x(from.earliestEnd);
                  const x2 = x(to.earliestStart);
                  const y1 =
                    y.position(from.track) + y.bandwidth / 2;
                  const y2 = y.position(to.track) + y.bandwidth / 2;
                  return (
                    <line
                      key={`${edge.prerequisiteId}-${edge.dependentId}`}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      className="tome-sequencing-depends-edge"
                    />
                  );
                })}
              {layout.events.map((event) => {
                const barY = y.position(event.track);
                const rangeX = x(event.earliestStart);
                const rangeW = Math.max(2, x(event.latestEnd) - rangeX);
                const coreX = x(event.earliestStart);
                const coreW = Math.max(
                  2,
                  x(event.earliestEnd) - coreX,
                );
                const href = nodePageHref(event.id);
                return (
                  <a
                    key={event.id}
                    href={href}
                    className="tome-sequencing-event-link"
                  >
                    <Bar
                      x={rangeX}
                      y={barY}
                      width={rangeW}
                      height={y.bandwidth}
                      className="tome-sequencing-event-range"
                      rx={3}
                    />
                    <Bar
                      x={coreX}
                      y={barY + y.bandwidth * 0.15}
                      width={coreW}
                      height={y.bandwidth * 0.7}
                      className="tome-sequencing-event-core"
                      rx={2}
                    />
                    <text
                      x={rangeX + 6}
                      y={barY + y.bandwidth / 2}
                      dy="0.35em"
                      className="tome-sequencing-event-label"
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
}: {
  layout: TimelineLayout;
  nodePageHref?: (id: string) => string;
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
            </div>
          )}
        </div>
      </div>
      <div className="tome-sequencing-canvas">
        <ParentSize>
          {({ width, height }) => {
            const w = width > 0 ? width : 640;
            const h = height > 0 ? height : 240;
            return (
              <TimelineCanvas
                layout={layout}
                width={w}
                height={h}
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
