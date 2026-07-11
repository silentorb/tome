/** Stable id for a directed perspective edge: `source:type:target`. */
export function relationshipId(
  sourceNodeId: string,
  type: string,
  targetNodeId: string,
): string {
  return `${sourceNodeId}:${type}:${targetNodeId}`;
}
