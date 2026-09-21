import type { NodeBodyDocument } from "tome-graph-interfaces";
import { parseStorageBody } from "tome-db";
import { documentToStorageBody } from "tome-db";

function storageMarkdownToDocument(body: string): NodeBodyDocument {
  return parseStorageBody(body);
}

export function createHandlerClient(handler: (req: Request) => Promise<Response> | Response) {
  async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await handler(new Request(`http://127.0.0.1${path}`, init));
    const text = await res.text();
    if (!res.ok) {
      throw new Error(text || `HTTP ${res.status}`);
    }
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  return {
    async saveBody(id: string, body: string): Promise<void> {
      const document = storageMarkdownToDocument(body);
      await fetchJson(`/api/nodes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document }),
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
      const data = await fetchJson<{ node: { document: NodeBodyDocument } }>(
        `/api/nodes/${id}`,
      );
      return documentToStorageBody(data.node.document);
    },
  };
}
