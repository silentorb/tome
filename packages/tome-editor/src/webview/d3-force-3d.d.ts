declare module "d3-force-3d" {
  interface ForceCollide {
    (alpha: number): void;
    strength(strength: number): ForceCollide;
    iterations(iterations: number): ForceCollide;
  }

  export function forceCollide(
    radius?: number | ((node: unknown) => number),
  ): ForceCollide;
}
