import type { ExtensionSchemaQueryServices } from "tome-interfaces/extension-services/schema-query";
import { buildErDiagramMermaid, type SchemaDiagramSnapshot } from "./build-mermaid";
import { parseSchemaDiagramConfig } from "./config";

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
  const [typeTables, relationshipRules] = await Promise.all([
    schemaQuery.listTypeTables(),
    schemaQuery.listRelationshipRules(),
  ]);
  return { typeTables, relationshipRules };
}

export function renderSchemaDiagramDeferred(label: string): string {
  const title = escapeHtml(label);
  return (
    '<figure class="tome-schema-diagram tome-schema-diagram-deferred">' +
    `<figcaption>${title}</figcaption>` +
    "<p><em>Schema diagram</em> — open in the editor to view.</p>" +
    "</figure>"
  );
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

export async function renderSchemaDiagramEditorShell(
  schemaQuery: ExtensionSchemaQueryServices | undefined,
  data: unknown,
  label: string,
): Promise<string> {
  const snapshot = await loadSchemaDiagramSnapshot(schemaQuery);
  if (!snapshot || snapshot.typeTables.length === 0) {
    return renderSchemaDiagramEmptyState(label);
  }

  const config = parseSchemaDiagramConfig(data);
  const diagram = buildErDiagramMermaid(snapshot, config);
  if (diagram.entityCount === 0) {
    return renderSchemaDiagramEmptyState(label);
  }

  const title = escapeHtml(label);
  const themeAttr =
    config.theme !== "default" ? ` data-mermaid-theme="${escapeHtml(config.theme)}"` : "";

  return (
    '<figure class="tome-schema-diagram"' +
    themeAttr +
    ">" +
    `<figcaption>${title}</figcaption>` +
    `<pre class="mermaid">${diagram.source}</pre>` +
    "</figure>"
  );
}
