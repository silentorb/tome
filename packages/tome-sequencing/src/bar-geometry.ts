/** Pixel gap between adjacent event bars (split across both sides of each bar). */
export const EVENT_BAR_GAP_PX = 40;

/** Map ASAP [start, end) through an x-scale into a bar rect with horizontal gaps. */
export function eventBarRect(
  x: (t: number) => number,
  start: number,
  end: number,
): { x: number; width: number } {
  const rawX = x(start);
  const rawW = x(end) - rawX;
  const gap = Math.min(EVENT_BAR_GAP_PX, Math.max(0, rawW - 2));
  return {
    x: rawX + gap / 2,
    width: Math.max(2, rawW - gap),
  };
}
