/** Structured editor body: storage markdown decoded for the node-page use case. */

export type NodeBodySegment =
  | { type: "prose"; markdown: string }
  | { type: "dynamic_link"; nodeId: string; title: string }
  | { type: "static_link"; nodeId: string; label: string }
  | { type: "page_block"; componentId: string; data: unknown; editorHtml: string };

export interface NodeBodyDocument {
  segments: NodeBodySegment[];
}
