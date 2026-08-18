/** Cubic SVG path from prerequisite bar end to dependent bar start. */
export function dependsEdgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bulgeSign = 1,
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const sameLane = Math.abs(dy) < 1;
  const horiz = Math.max(24, Math.abs(dx) * 0.4);
  if (sameLane || Math.abs(dx) < 16) {
    const bulge = Math.max(18, Math.abs(dy) + 18) * (bulgeSign >= 0 ? 1 : -1);
    return `M ${x1} ${y1} C ${x1 + horiz} ${y1 + bulge}, ${x2 - horiz} ${y2 + bulge}, ${x2} ${y2}`;
  }
  return `M ${x1} ${y1} C ${x1 + horiz} ${y1}, ${x2 - horiz} ${y2}, ${x2} ${y2}`;
}
