import type {
  CanRunParallel,
  DependsConstraint,
  DurationSpec,
  SequenceEndpoint,
  SequenceEvent,
  SequencingProblem,
} from "tome-sequencing-interfaces";
import type { ResolutionResult, ResolvedEvent } from "./types";

type LaggedSucc = { to: string; lag: number };

function minDuration(event: SequenceEvent, defaultDuration: number): number {
  const spec: DurationSpec | undefined = event.duration;
  if (typeof spec === "number") {
    if (!(spec > 0) || !Number.isFinite(spec)) {
      throw new Error(`Event "${event.id}": duration must be a positive finite number`);
    }
    return spec;
  }
  if (!(defaultDuration > 0) || !Number.isFinite(defaultDuration)) {
    throw new Error("defaultDuration must be a positive finite number");
  }
  return defaultDuration;
}

function isFlex(event: SequenceEvent): boolean {
  return event.duration === "flex" || event.duration === undefined;
}

function timepoint(eventId: string, endpoint: SequenceEndpoint): string {
  return `${eventId}:${endpoint}`;
}

function eventIdFromTimepoint(tp: string): string {
  const sep = tp.lastIndexOf(":");
  return sep === -1 ? tp : tp.slice(0, sep);
}

function isSequenceEndpoint(value: string): value is SequenceEndpoint {
  return value === "start" || value === "end";
}

function findCycle(ids: string[], edges: Map<string, string[]>): string[] | null {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    state.set(id, 1);
    stack.push(id);
    for (const next of edges.get(id) ?? []) {
      const s = state.get(next) ?? 0;
      if (s === 1) {
        const start = stack.indexOf(next);
        return stack.slice(start).concat(next);
      }
      if (s === 0) {
        const cycle = visit(next);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };

  for (const id of ids) {
    if ((state.get(id) ?? 0) === 0) {
      const cycle = visit(id);
      if (cycle) return cycle;
    }
  }
  return null;
}

function topoSort(ids: string[], successors: Map<string, string[]>): string[] {
  const indeg = new Map<string, number>();
  for (const id of ids) indeg.set(id, 0);
  for (const id of ids) {
    for (const s of successors.get(id) ?? []) {
      indeg.set(s, (indeg.get(s) ?? 0) + 1);
    }
  }
  const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0).sort();
  const ordered: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    ordered.push(id);
    const nexts = [...(successors.get(id) ?? [])].sort();
    for (const s of nexts) {
      const n = (indeg.get(s) ?? 0) - 1;
      indeg.set(s, n);
      if (n === 0) queue.push(s);
    }
    queue.sort();
  }
  return ordered;
}

function defaultCanRunParallel(): CanRunParallel {
  return () => true;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}\0${b}` : `${b}\0${a}`;
}

function unweightedSuccessors(lagged: Map<string, LaggedSucc[]>): Map<string, string[]> {
  const successors = new Map<string, string[]>();
  for (const [from, edges] of lagged) {
    successors.set(
      from,
      edges.map((edge) => edge.to),
    );
  }
  return successors;
}

function addLaggedEdge(successors: Map<string, LaggedSucc[]>, from: string, to: string, lag: number) {
  const list = successors.get(from);
  if (!list) {
    successors.set(from, [{ to, lag }]);
    return;
  }
  const existing = list.find((edge) => edge.to === to);
  if (!existing) {
    list.push({ to, lag });
    return;
  }
  if (lag > existing.lag) existing.lag = lag;
}

/** Build lagged timepoint successors from duration, depends, and implicit FS pairs. */
function buildTimepointSuccessors(
  ids: string[],
  depends: DependsConstraint[],
  duration: Map<string, number>,
  canRunParallel: CanRunParallel,
): Map<string, LaggedSucc[]> {
  const idSet = new Set(ids);
  const successors = new Map<string, LaggedSucc[]>();
  for (const id of ids) {
    successors.set(timepoint(id, "start"), []);
    successors.set(timepoint(id, "end"), []);
  }

  for (const id of ids) {
    addLaggedEdge(
      successors,
      timepoint(id, "start"),
      timepoint(id, "end"),
      duration.get(id)!,
    );
  }

  const linkedPairs = new Set<string>();
  for (const edge of depends) {
    if (!idSet.has(edge.prerequisiteId) || !idSet.has(edge.dependentId)) continue;
    if (!isSequenceEndpoint(edge.from) || !isSequenceEndpoint(edge.to)) {
      throw new Error(
        `Depends edge ${edge.prerequisiteId} → ${edge.dependentId} has invalid endpoints`,
      );
    }
    addLaggedEdge(
      successors,
      timepoint(edge.prerequisiteId, edge.from),
      timepoint(edge.dependentId, edge.to),
      0,
    );
    linkedPairs.add(pairKey(edge.prerequisiteId, edge.dependentId));
  }

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]!;
      const b = ids[j]!;
      if (canRunParallel(a, b) || canRunParallel(b, a)) continue;
      if (linkedPairs.has(pairKey(a, b))) continue;
      const first = a < b ? a : b;
      const second = a < b ? b : a;
      addLaggedEdge(successors, timepoint(first, "end"), timepoint(second, "start"), 0);
    }
  }

  return successors;
}

function predecessorLags(successors: Map<string, LaggedSucc[]>): Map<string, LaggedSucc[]> {
  const predecessors = new Map<string, LaggedSucc[]>();
  for (const from of successors.keys()) predecessors.set(from, []);
  for (const [from, edges] of successors) {
    for (const edge of edges) {
      const list = predecessors.get(edge.to);
      if (!list) {
        predecessors.set(edge.to, [{ to: from, lag: edge.lag }]);
      } else {
        list.push({ to: from, lag: edge.lag });
      }
    }
  }
  return predecessors;
}

function propagateEarliest(
  order: string[],
  predecessors: Map<string, LaggedSucc[]>,
  earliest: Map<string, number>,
) {
  for (const tp of order) {
    const preds = predecessors.get(tp) ?? [];
    let value = earliest.get(tp) ?? 0;
    for (const pred of preds) {
      value = Math.max(value, (earliest.get(pred.to) ?? 0) + pred.lag);
    }
    earliest.set(tp, value);
  }
}

function intersectWindow(
  a: { es: number; ls: number; ef: number; lf: number },
  b: { es: number; ls: number; ef: number; lf: number },
): { es: number; ls: number; ef: number; lf: number } | null {
  const es = Math.max(a.es, b.es);
  const lf = Math.min(a.lf, b.lf);
  const ef = Math.max(a.ef, b.ef);
  const ls = Math.min(a.ls, b.ls);
  if (es > ls || ef > lf || es + (ef - a.es) > lf) {
    // Keep structural fields; caller checks es <= ls
  }
  return { es, ls, ef: Math.max(ef, es), lf: Math.max(lf, ls) };
}

/**
 * Resolve a sequencing problem into earliest/latest windows (relative units).
 */
export function resolve(problem: SequencingProblem): ResolutionResult {
  try {
    if (!(problem.defaultDuration > 0) || !Number.isFinite(problem.defaultDuration)) {
      return {
        ok: false,
        error: {
          code: "unsatisfiable",
          message: "defaultDuration must be a positive finite number",
        },
      };
    }

    const events = problem.events;
    const ids = events.map((e) => e.id);
    const unique = new Set(ids);
    if (unique.size !== ids.length) {
      return {
        ok: false,
        error: { code: "unsatisfiable", message: "Duplicate event ids in problem" },
      };
    }

    for (const edge of problem.depends) {
      if (!unique.has(edge.prerequisiteId) || !unique.has(edge.dependentId)) {
        const missing = [edge.prerequisiteId, edge.dependentId].filter((id) => !unique.has(id));
        return {
          ok: false,
          error: {
            code: "unknown_event",
            message: `Depends edge references unknown event(s): ${missing.join(", ")}`,
            eventIds: missing,
          },
        };
      }
      if (!isSequenceEndpoint(edge.from) || !isSequenceEndpoint(edge.to)) {
        return {
          ok: false,
          error: {
            code: "unsatisfiable",
            message: `Depends edge ${edge.prerequisiteId} → ${edge.dependentId} has invalid endpoints`,
            eventIds: [edge.prerequisiteId, edge.dependentId],
          },
        };
      }
    }

    const byId = new Map(events.map((e) => [e.id, e]));
    const duration = new Map<string, number>();
    for (const id of ids) {
      duration.set(id, minDuration(byId.get(id)!, problem.defaultDuration));
    }

    const canRunParallel = problem.canRunParallel ?? defaultCanRunParallel();
    const lagged = buildTimepointSuccessors(ids, problem.depends, duration, canRunParallel);
    const successors = unweightedSuccessors(lagged);
    const timepoints = [...lagged.keys()];

    const cycle = findCycle(timepoints, successors);
    if (cycle) {
      const eventIds = [...new Set(cycle.map(eventIdFromTimepoint))];
      return {
        ok: false,
        error: {
          code: "cycle",
          message: `Depends graph contains a cycle: ${cycle.join(" → ")}`,
          eventIds,
        },
      };
    }

    const order = topoSort(timepoints, successors);
    const predecessors = predecessorLags(lagged);
    const earliest = new Map<string, number>();
    for (const tp of timepoints) earliest.set(tp, 0);
    propagateEarliest(order, predecessors, earliest);

    for (let pass = 0; pass <= ids.length; pass++) {
      let changed = false;
      for (const id of ids) {
        if (isFlex(byId.get(id)!)) continue;
        const startTp = timepoint(id, "start");
        const endTp = timepoint(id, "end");
        const d = duration.get(id)!;
        const start = earliest.get(startTp)!;
        const end = earliest.get(endTp)!;
        if (end > start + d + 1e-9) {
          earliest.set(startTp, end - d);
          changed = true;
        }
      }
      if (!changed) break;
      propagateEarliest(order, predecessors, earliest);
    }

    const projectEnd =
      ids.length === 0 ? 0 : Math.max(...ids.map((id) => earliest.get(timepoint(id, "end"))!));

    const latest = new Map<string, number>();
    for (const tp of [...order].reverse()) {
      const succs = lagged.get(tp) ?? [];
      if (succs.length === 0) {
        latest.set(tp, projectEnd);
        continue;
      }
      let value = Infinity;
      for (const succ of succs) {
        value = Math.min(value, (latest.get(succ.to) ?? projectEnd) - succ.lag);
      }
      latest.set(tp, value);
    }

    const windows = new Map(
      ids.map((id) => [
        id,
        {
          es: earliest.get(timepoint(id, "start"))!,
          ls: latest.get(timepoint(id, "start"))!,
          ef: earliest.get(timepoint(id, "end"))!,
          lf: latest.get(timepoint(id, "end"))!,
        },
      ]),
    );

    for (let pass = 0; pass < ids.length; pass++) {
      let changed = false;
      for (const id of ids) {
        const event = byId.get(id)!;
        const parents = event.parentIds ?? [];
        if (parents.length === 0) continue;
        let w = windows.get(id)!;
        for (const parentId of parents) {
          const parent = windows.get(parentId);
          if (!parent) {
            return {
              ok: false,
              error: {
                code: "unknown_event",
                message: `Event "${id}" references unknown parent "${parentId}"`,
                eventIds: [parentId],
              },
            };
          }
          const next = intersectWindow(w, parent);
          if (!next || next.es > next.ls + 1e-9) {
            return {
              ok: false,
              error: {
                code: "unsatisfiable",
                message: `Containment unsatisfiable for event "${id}" within parent "${parentId}"`,
                eventIds: [id, parentId],
              },
            };
          }
          if (
            next.es !== w.es ||
            next.ls !== w.ls ||
            next.ef !== w.ef ||
            next.lf !== w.lf
          ) {
            changed = true;
          }
          w = next;
        }
        windows.set(id, w);
      }
      if (!changed) break;
    }

    const resolved: ResolvedEvent[] = ids.map((id) => {
      const w = windows.get(id)!;
      return {
        id,
        earliestStart: w.es,
        latestStart: w.ls,
        earliestEnd: w.ef,
        latestEnd: w.lf,
      };
    });

    for (const r of resolved) {
      if (r.earliestStart > r.latestStart + 1e-9 || r.earliestEnd > r.latestEnd + 1e-9) {
        return {
          ok: false,
          error: {
            code: "unsatisfiable",
            message: `No feasible window for event "${r.id}"`,
            eventIds: [r.id],
          },
        };
      }
    }

    return { ok: true, events: resolved };
  } catch (err: unknown) {
    return {
      ok: false,
      error: {
        code: "unsatisfiable",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
