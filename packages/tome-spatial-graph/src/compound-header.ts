import type cytoscape from "cytoscape";

export const DEFAULT_PARENT_HEADER_HEIGHT = 28;

/** Shift each compound parent's direct children down to reserve a top header band for the parent label. */
export function reserveCompoundHeaderSpace(
  cy: cytoscape.Core,
  headerHeight: number,
): void {
  cy.nodes(":parent").forEach((parent) => {
    parent.children().forEach((child) => {
      const pos = child.position();
      child.position({ x: pos.x, y: pos.y + headerHeight });
    });
  });
}
