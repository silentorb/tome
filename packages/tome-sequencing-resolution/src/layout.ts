import type { LaidOutEvent, ResolvedEvent } from "./types";

export interface LayoutResult {
  events: LaidOutEvent[];
  /** Number of concurrency lanes used (at least 1 when there is any event). */
  laneCount: number;
}

/**
 * Turn resolved ASAP windows into non-overlapping timeline placements.
 * Exclusive box per event is `[start, end) = [earliestStart, earliestEnd)`.
 * Same-lane intervals do not overlap (abutting ends are allowed).
 */
export function layoutEvents(resolved: ResolvedEvent[]): LayoutResult {
  if (resolved.length === 0) {
    return { events: [], laneCount: 0 };
  }

  const sorted = [...resolved].sort((a, b) => {
    if (a.earliestStart !== b.earliestStart) return a.earliestStart - b.earliestStart;
    if (a.earliestEnd !== b.earliestEnd) return a.earliestEnd - b.earliestEnd;
    return a.id.localeCompare(b.id);
  });

  // laneEnds[i] = end of the last event assigned to lane i
  const laneEnds: number[] = [];
  const laneById = new Map<string, number>();

  for (const e of sorted) {
    const start = e.earliestStart;
    const end = e.earliestEnd;
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane]! > start) {
      lane += 1;
    }
    if (lane === laneEnds.length) laneEnds.push(end);
    else laneEnds[lane] = end;
    laneById.set(e.id, lane);
  }

  const events: LaidOutEvent[] = resolved.map((r) => ({
    id: r.id,
    start: r.earliestStart,
    end: r.earliestEnd,
    lane: laneById.get(r.id) ?? 0,
    latestStart: r.latestStart,
    latestEnd: r.latestEnd,
  }));

  return {
    events,
    laneCount: Math.max(1, laneEnds.length),
  };
}
