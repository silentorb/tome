import type { DatabaseColumnDef } from "./site-types";
import { nodePagePath } from "./markdown";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderTableCellHtml(
  value: string,
  columnDef?: DatabaseColumnDef,
): string {
  if (!value) return "";

  const type = columnDef?.type ?? "text";
  if (type === "checkbox") {
    if (value === "true") return "☑";
    if (value === "false") return "☐";
    return escapeHtml(value);
  }

  if (
    type === "select" ||
    type === "status" ||
    type === "multi_select" ||
    type === "enum" ||
    type === "relation"
  ) {
    return `<span class="tome-database-cell-badge">${escapeHtml(value)}</span>`;
  }

  return escapeHtml(value);
}

export interface RelationLinkLike {
  targetId: string;
  title: string;
}

export function renderRelationLinksHtml(
  links: RelationLinkLike[],
  base: string,
): string {
  if (links.length === 0) return "";
  return links
    .map(
      (link) =>
        `<a href="${nodePagePath(link.targetId, base)}" class="tome-relation-cell-link">${escapeHtml(link.title)}</a>`,
    )
    .join(" ");
}
