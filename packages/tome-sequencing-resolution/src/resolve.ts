import type {
  CanRunParallel,
  DependsConstraint,
  DurationSpec,
  SequenceEvent,
  SequencingProblem,
} from "tome-sequencing-interfaces";
import type { ResolutionResult, ResolvedEvent } from "./types";

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

/** Build successor map from depends + implicit sequential pairs. */
function buildSuccessors(
  ids: string[],
  depends: DependsConstraint[],
  canRunParallel: CanRunParallel,
): Map<string, string[]> {
  const idSet = new Set(ids);
  const successors = new Map<string, string[]>();
  const ensure = (id: string) => {
    if (!successors.has(id)) successors.set(id, []);
  };
  for (const id of ids) ensure(id);

  const addEdge = (from: string, to: string) => {
    const list = successors.get(from)!;
    if (!list.includes(to)) list.push(to);
  };

  for (const edge of depends) {
    if (!idSet.has(edge.prerequisiteId) || !idSet.has(edge.dependentId)) {
      continue;
    }
    addEdge(edge.prerequisiteId, edge.dependentId);
  }

  // Non-parallel pairs without an explicit depends edge get a stable FS order.
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]!;
      const b = ids[j]!;
      if (canRunParallel(a, b) || canRunParallel(b, a)) continue;
      const hasAb = (successors.get(a) ?? []).includes(b);
      const hasBa = (successors.get(b) ?? []).includes(a);
      if (hasAb || hasBa) continue;
      // Stable: lexicographically smaller id finishes before the larger.
      if (a < b) addEdge(a, b);
      else addEdge(b, a);
    }
  }

  return successors;
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
    }

    const byId = new Map(events.map((e) => [e.id, e]));
    const canRunParallel = problem.canRunParallel ?? defaultCanRunParallel();
    const successors = buildSuccessors(ids, problem.depends, canRunParallel);

    const cycle = findCycle(ids, successors);
    if (cycle) {
      return {
        ok: false,
        error: {
          code: "cycle",
          message: `Depends graph contains a cycle: ${cycle.join(" → ")}`,
          eventIds: [...new Set(cycle)],
        },
      };
    }

    const order = topoSort(ids, successors);
    const duration = new Map<string, number>();
    for (const id of ids) {
      duration.set(id, minDuration(byId.get(id)!, problem.defaultDuration));
    }

    const predecessors = new Map<string, string[]>();
    for (const id of ids) predecessors.set(id, []);
    for (const [from, tos] of successors) {
      for (const to of tos) {
        predecessors.get(to)!.push(from);
      }
    }

    const es = new Map<string, number>();
    const ef = new Map<string, number>();
    for (const id of order) {
      const preds = predecessors.get(id) ?? [];
      const start = preds.length === 0 ? 0 : Math.max(...preds.map((p) => ef.get(p)!));
      const d = duration.get(id)!;
      es.set(id, start);
      ef.set(id, start + d);
    }

    const projectEnd = ids.length === 0 ? 0 : Math.max(...ids.map((id) => ef.get(id)!));

    const lf = new Map<string, number>();
    const ls = new Map<string, number>();
    for (const id of [...order].reverse()) {
      const succs = successors.get(id) ?? [];
      const finish = succs.length === 0 ? projectEnd : Math.min(...succs.map((s) => ls.get(s)!));
      const d = duration.get(id)!;
      lf.set(id, finish);
      ls.set(id, finish - d);
    }

    // Flex events may stretch into their float: widen latestEnd to LF while keeping min duration.
    for (const id of ids) {
      const event = byId.get(id)!;
      if (!isFlex(event)) continue;
      // latestEnd already LF; earliest window uses min duration — nothing else required for v1.
      void event;
    }

    // Containment: tighten children to parent windows (M2M → intersection).
    let windows = new Map(
      ids.map((id) => [
        id,
        {
          es: es.get(id)!,
          ls: ls.get(id)!,
          ef: ef.get(id)!,
          lf: lf.get(id)!,
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
