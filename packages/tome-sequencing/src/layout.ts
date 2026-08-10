import type { DependsConstraint } from "tome-sequencing-interfaces";
import type { ResolvedEvent } from "tome-sequencing-resolution";

export interface TimelineEventLayout {
  id: string;
  title: string;
  track: string;
  earliestStart: number;
  latestStart: number;
  earliestEnd: number;
  latestEnd: number;
}

export interface TimelineLayout {
  events: TimelineEventLayout[];
  depends: DependsConstraint[];
  tracks: string[];
  timeMin: number;
  timeMax: number;
}

export function buildTimelineLayout(input: {
  resolved: ResolvedEvent[];
  titles: Map<string, string>;
  trackById: Map<string, string>;
  depends: DependsConstraint[];
}): TimelineLayout {
  const tracksSet = new Set<string>();
  const events: TimelineEventLayout[] = input.resolved.map((r) => {
    const track = input.trackById.get(r.id) ?? "default";
    tracksSet.add(track);
    return {
      id: r.id,
      title: input.titles.get(r.id) ?? r.id,
      track,
      earliestStart: r.earliestStart,
      latestStart: r.latestStart,
      earliestEnd: r.earliestEnd,
      latestEnd: r.latestEnd,
    };
  });
  const tracks = [...tracksSet].sort((a, b) => a.localeCompare(b));
  let timeMin = 0;
  let timeMax = 1;
  for (const e of events) {
    timeMin = Math.min(timeMin, e.earliestStart);
    timeMax = Math.max(timeMax, e.latestEnd);
  }
  if (timeMax <= timeMin) timeMax = timeMin + 1;
  return { events, depends: input.depends, tracks, timeMin, timeMax };
}
