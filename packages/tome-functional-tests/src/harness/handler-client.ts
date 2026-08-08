import type { NodeBodyDocument, NodeBodySegment } from "tome-graph-interfaces";
import { documentToStorageBody } from "tome-db";
import { parsePageBlockFences } from "tome-interfaces/page-block";

function storageMarkdownToDocument(body: string): NodeBodyDocument {
  const { segments: fenceSegments } = parsePageBlockFences(body);
  const segments: NodeBodySegment[] = [];
  for (const fence of fenceSegments) {
    if (fence.type === "block") {
      segments.push({
        type: "page_block",
        componentId: fence.payload.componentId,
        data: fence.payload.data,
        editorHtml: "",
      });
      continue;
    }
    segments.push({ type: "prose", markdown: fence.content });
  }
  if (segments.length === 0) {
    return { segments: [{ type: "prose", markdown: body }] };
  }
  return { segments };
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
        method: "PUT",
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
