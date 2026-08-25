import type { DependsConstraint } from "tome-sequencing-interfaces";
import { layoutEvents, type LaidOutEvent } from "tome-sequencing-resolution";

export interface TimelineEventLayout {
  id: string;
  title: string;
  /** ASAP start — exclusive layout box. */
  start: number;
  /** ASAP end — exclusive layout box. */
  end: number;
  /** 0-based concurrency lane (flat timeline; query groups occupy consecutive bands). */
  lane: number;
  /** Slack metadata only; not drawn as exclusive width. */
  latestStart?: number;
  latestEnd?: number;
}

export interface TimelineLayout {
  events: TimelineEventLayout[];
  depends: DependsConstraint[];
  /** Concurrency lanes used (at least 1 when there is any event). */
  laneCount: number;
  timeMin: number;
  timeMax: number;
}

/** Map resolution placements + titles into the timeline DTO. */
export function buildTimelineLayout(input: {
  laidOut: LaidOutEvent[];
  laneCount: number;
  titles: Map<string, string>;
  depends: DependsConstraint[];
}): TimelineLayout {
  const events: TimelineEventLayout[] = input.laidOut.map((e) => ({
    id: e.id,
    title: input.titles.get(e.id) ?? e.id,
    start: e.start,
    end: e.end,
    lane: e.lane,
    latestStart: e.latestStart,
    latestEnd: e.latestEnd,
  }));

  let timeMin = 0;
  let timeMax = 1;
  if (events.length > 0) {
    timeMin = Infinity;
    timeMax = -Infinity;
    for (const e of events) {
      timeMin = Math.min(timeMin, e.start);
      timeMax = Math.max(timeMax, e.end);
    }
  }
  if (timeMax <= timeMin) timeMax = timeMin + 1;

  return {
    events,
    depends: input.depends,
    laneCount: events.length === 0 ? 0 : Math.max(1, input.laneCount),
    timeMin,
    timeMax,
  };
}

/** Resolve windows → non-overlapping placements → timeline DTO. */
export function buildTimelineLayoutFromResolved(input: {
  resolved: Parameters<typeof layoutEvents>[0];
  titles: Map<string, string>;
  depends: DependsConstraint[];
}): TimelineLayout {
  const { events: laidOut, laneCount } = layoutEvents(input.resolved);
  return buildTimelineLayout({
    laidOut,
    laneCount,
    titles: input.titles,
    depends: input.depends,
  });
}

/** Pack each query group independently, then stack their lanes top-to-bottom. */
export function buildTimelineLayoutFromGroupedResolved(input: {
  groups: Array<{
    resolved: Parameters<typeof layoutEvents>[0];
    titles: Map<string, string>;
  }>;
  depends: DependsConstraint[];
}): TimelineLayout {
  const laidOut: LaidOutEvent[] = [];
  const titles = new Map<string, string>();
  let offset = 0;
  for (const group of input.groups) {
    for (const [id, title] of group.titles) titles.set(id, title);
    const packed = layoutEvents(group.resolved);
    for (const event of packed.events) {
      laidOut.push({ ...event, lane: event.lane + offset });
    }
    offset += packed.laneCount;
  }
  return buildTimelineLayout({
    laidOut,
    laneCount: offset,
    titles,
    depends: input.depends,
  });
}
