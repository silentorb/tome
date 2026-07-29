import type { ApiFetchHandler } from "tome-http";

function parseApiError(text: string, status: number): string {
  try {
    const payload = JSON.parse(text) as { error?: string };
    if (payload.error) return payload.error;
  } catch {
    /* not JSON */
  }
  return text.trim() || `Request failed: ${status}`;
}

/**
 * Thin client subset backed by an in-process `ApiFetchHandler` (no TCP listen).
 * Mirrors the shapes used by the editor webview for body save / prepare.
 */
export function createHandlerClient(handler: ApiFetchHandler) {
  async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await handler(new Request(`http://127.0.0.1${path}`, init));
    if (!res.ok) {
      const text = await res.text();
      throw new Error(parseApiError(text, res.status));
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  return {
    async saveBody(id: string, body: string): Promise<void> {
      await fetchJson(`/api/nodes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
    },

    async prepareEditorBody(nodeId: string, markdown: string): Promise<string> {
      const data = await fetchJson<{ markdown: string }>(
        `/api/nodes/${encodeURIComponent(nodeId)}/prepare-editor-body`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ markdown }),
        },
      );
      return data.markdown;
    },

    async getNodeBody(id: string): Promise<string> {
      const data = await fetchJson<{ node: { body?: string } }>(`/api/nodes/${id}`);
      return typeof data.node.body === "string" ? data.node.body : "";
    },
  };
}

export type HandlerClient = ReturnType<typeof createHandlerClient>;
