import type { HtmlPageBlockHost } from "tome-interfaces/page-block/html";

export function register(host: HtmlPageBlockHost): void {
  host.registerPageBlockRenderer({
    implementationId: "fixture-demo",
    renderHtml(ctx, data) {
      const record =
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : {};
      const text = typeof record.text === "string" ? record.text : "Fixture";
      return `<div class="tome-page-block-fixture" data-component-id="${ctx.component.id}"><strong>${escapeHtml(ctx.component.label)}</strong>: ${escapeHtml(text)}</div>`;
    },
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
