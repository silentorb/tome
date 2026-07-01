import type { ExtensionSchemaQueryServices } from "tome-interfaces/extension-services/schema-query";
import { parseSchemaDiagramConfig } from "./config";
import { renderSchemaDiagramSvg } from "./render-svg";
import type { SchemaDiagramSnapshot } from "./snapshot";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function loadSchemaDiagramSnapshot(
  schemaQuery: ExtensionSchemaQueryServices | undefined,
): Promise<SchemaDiagramSnapshot | null> {
  if (!schemaQuery) return null;
  const [typeTables, relationColumnEdges] = await Promise.all([
    schemaQuery.listTypeTables(),
    schemaQuery.listRelationColumnEdges(),
  ]);
  return { typeTables, relationColumnEdges };
}

export function renderSchemaDiagramEmptyState(label: string): string {
  const title = escapeHtml(label);
  return (
    '<figure class="tome-schema-diagram tome-schema-diagram-empty">' +
    `<figcaption>${title}</figcaption>` +
    "<p><em>Schema data is unavailable.</em></p>" +
    "</figure>"
  );
}

export async function renderSchemaDiagramHtml(
  schemaQuery: ExtensionSchemaQueryServices | undefined,
  data: unknown,
  label: string,
): Promise<string> {
  const snapshot = await loadSchemaDiagramSnapshot(schemaQuery);
  if (!snapshot || snapshot.typeTables.length === 0) {
    return renderSchemaDiagramEmptyState(label);
  }

  const config = parseSchemaDiagramConfig(data);
  const diagram = await renderSchemaDiagramSvg(snapshot, config);
  if (!diagram) {
    return renderSchemaDiagramEmptyState(label);
  }

  const title = escapeHtml(label);
  const themeAttr =
    config.theme !== "default" ? ` data-theme="${escapeHtml(config.theme)}"` : "";

  return (
    '<figure class="tome-schema-diagram"' +
    themeAttr +
    ">" +
    `<figcaption>${title}</figcaption>` +
    '<div class="tome-schema-diagram-viewport">' +
    diagram.svg +
    "</div>" +
    "</figure>"
  );
}

/** @deprecated Use renderSchemaDiagramHtml — kept for callers during transition */
export const renderSchemaDiagramEditorShell = renderSchemaDiagramHtml;
