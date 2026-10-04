import type { HtmlPageBlockHost } from "tome-interfaces/page-block/html";
import {
  IMPLEMENTATION_ID,
  parseNodeFilterBlockData,
  summarizeNodeFilter,
} from "./config";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function register(host: HtmlPageBlockHost): void {
  host.registerPageBlockRenderer({
    implementationId: IMPLEMENTATION_ID,
    async renderHtml(_ctx, data) {
      const graph = parseNodeFilterBlockData(data);
      const summary = summarizeNodeFilter(graph);
      return `<div class="tome-ontology-ui-html" data-block-type="node-filter"><p><em>Node filter</em> — ${escapeHtml(summary)}</p></div>`;
    },
  });
}

export { IMPLEMENTATION_ID };
