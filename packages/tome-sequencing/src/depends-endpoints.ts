import type { DependsConstraint, SequenceEndpoint } from "tome-sequencing-interfaces";

export function isSequenceEndpoint(value: unknown): value is SequenceEndpoint {
  return value === "start" || value === "end";
}

export function dependsKindLabel(from: SequenceEndpoint, to: SequenceEndpoint): string {
  return `${from} → ${to}`;
}

export function parseEndpointPairs(
  properties: Record<string, unknown> | undefined,
): Array<{ from: SequenceEndpoint; to: SequenceEndpoint }> | null {
  const raw = properties?.endpoints;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const pairs: Array<{ from: SequenceEndpoint; to: SequenceEndpoint }> = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const from = (item as { from?: unknown }).from;
    const to = (item as { to?: unknown }).to;
    if (!isSequenceEndpoint(from) || !isSequenceEndpoint(to)) return null;
    const key = `${from}\0${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ from, to });
  }
  return pairs.length > 0 ? pairs : null;
}

export function endpointsProperty(
  pairs: Array<{ from: SequenceEndpoint; to: SequenceEndpoint }>,
): { endpoints: Array<{ from: SequenceEndpoint; to: SequenceEndpoint }> } {
  return { endpoints: pairs };
}

export function expandDependsConstraints(
  sourceId: string,
  targetId: string,
  properties: Record<string, unknown> | undefined,
): DependsConstraint[] | null {
  const pairs = parseEndpointPairs(properties);
  if (!pairs) return null;
  return pairs.map((pair) => ({
    prerequisiteId: sourceId,
    dependentId: targetId,
    from: pair.from,
    to: pair.to,
  }));
}
