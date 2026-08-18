import { eventBarRect } from "./bar-geometry";
import type { TimelineLayout } from "./layout";
import { sequencingNodePageHref } from "./node-links";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function niceTicks(min: number, max: number, count = 6): number[] {
  if (!(max > min)) return [min];
  const span = max - min;
  const raw = span / Math.max(1, count - 1);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const err = raw / pow;
  const step = (err >= 5 ? 5 : err >= 2 ? 2 : 1) * pow;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max + step * 1e-9; t += step) {
    ticks.push(Number(t.toPrecision(12)));
  }
  return ticks.length > 0 ? ticks : [min, max];
}

const LANE_HEIGHT = 48;

/** Static SVG timeline for htmlModule / editorHtml fallback (no visx). */
export function renderTimelineStaticSvg(
  layout: TimelineLayout,
  options?: {
    width?: number;
    height?: number;
    nodePageHref?: (id: string) => string;
    showChronologyUnits?: boolean;
  },
): string {
  const width = options?.width ?? 720;
  const showChronologyUnits = options?.showChronologyUnits ?? true;
  const hrefFn = options?.nodePageHref ?? sequencingNodePageHref;
  const margin = {
    top: 16,
    right: 16,
    bottom: showChronologyUnits ? 36 : 12,
    left: 16,
  };

  const laneCount = Math.max(1, layout.laneCount || 1);
  const innerH = laneCount * LANE_HEIGHT;
  const height = options?.height ?? margin.top + margin.bottom + innerH + 8;
  const innerW = Math.max(40, width - margin.left - margin.right);
  const barH = LANE_HEIGHT - 16;

  const timeSpan = Math.max(1e-9, layout.timeMax - layout.timeMin);
  const x = (t: number) => margin.left + ((t - layout.timeMin) / timeSpan) * innerW;
  const eventY = (lane: number) => margin.top + lane * LANE_HEIGHT + 8;

  const axis =
    showChronologyUnits
      ? niceTicks(layout.timeMin, layout.timeMax)
          .map((tick) => {
            const tx = x(tick);
            return (
              `<line x1="${tx}" y1="${margin.top + innerH}" x2="${tx}" y2="${margin.top + innerH + 4}" ` +
              `stroke="#6b7380"/>` +
              `<text x="${tx}" y="${margin.top + innerH + 16}" text-anchor="middle" ` +
              `fill="#9aa3ad" font-size="11">${escapeHtml(String(tick))}</text>`
            );
          })
          .join("")
      : "";

  const events = layout.events
    .map((event) => {
      const { x: barX, width: barW } = eventBarRect(x, event.start, event.end);
      const barY = eventY(event.lane);
      const href = escapeHtml(hrefFn(event.id));
      const title = escapeHtml(event.title);
      return (
        `<a href="${href}" class="tome-sequencing-event-link">` +
        `<rect class="tome-sequencing-event-core" x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="3" ` +
        `fill="#1f6b75"/>` +
        `<text class="tome-sequencing-event-label" x="${barX + 6}" y="${barY + barH / 2}" dy="0.35em" ` +
        `fill="#e8eef2" font-size="11">${title}</text>` +
        `<title>${title}</title>` +
        `</a>`
      );
    })
    .join("");

  return (
    `<svg class="tome-sequencing-svg" xmlns="http://www.w3.org/2000/svg" ` +
    `width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" ` +
    `aria-label="Timeline">` +
    `<rect width="${width}" height="${height}" fill="#12151a"/>` +
    `<line x1="${margin.left}" y1="${margin.top + innerH}" x2="${margin.left + innerW}" y2="${margin.top + innerH}" ` +
    `stroke="#6b7380" stroke-opacity="0.9"/>` +
    axis +
    events +
    `</svg>`
  );
}

export function renderTimelineStaticHtml(
  layout: TimelineLayout,
  options?: {
    nodePageHref?: (id: string) => string;
  },
): string {
  const svg = renderTimelineStaticSvg(layout, {
    nodePageHref: options?.nodePageHref,
    showChronologyUnits: true,
  });
  // Keep a single root element so page-block embed HTML end detection stays correct.
  // Inline essentials so htmlModule output looks like a timeline before/without editor bundle CSS.
  const style =
    `<style data-tome-sequencing-static="1">` +
    `.tome-sequencing-block[data-tome-sequencing="1"]{display:flex;flex-direction:column;gap:.5rem;` +
    `min-height:200px;border:1px solid #2a3038;border-radius:6px;padding:.5rem;background:#12151a;color:#e6eaef}` +
    `.tome-sequencing-block[data-tome-sequencing="1"] .tome-sequencing-canvas{overflow:auto;background:#12151a}` +
    `.tome-sequencing-block[data-tome-sequencing="1"] .tome-sequencing-meta{margin:0;font-size:.85rem;color:#9aa3ad}` +
    `.tome-sequencing-block[data-tome-sequencing="1"] .tome-sequencing-svg{display:block;max-width:100%;height:auto;background:#12151a}` +
    `</style>`;
  return (
    `<figure class="tome-sequencing-block" data-tome-sequencing="1">` +
    style +
    `<div class="tome-sequencing-canvas">${svg}</div>` +
    `<p class="tome-sequencing-meta">${layout.events.length} event${layout.events.length === 1 ? "" : "s"}</p>` +
    `</figure>`
  );
}
