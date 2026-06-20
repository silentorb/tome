/** Parsed payload inside a ```tome-block fence. */
export interface PageBlockPayload {
  componentId: string;
  data: unknown;
}

export type MarkdownSegment =
  | { type: "prose"; content: string }
  | { type: "block"; payload: PageBlockPayload; raw: string };

export interface ParsedPageBlockMarkdown {
  segments: MarkdownSegment[];
}

/** Component metadata passed through host contexts (from extensions.json). */
export interface PageBlockComponentRef {
  id: string;
  extensionId: string;
  implementationId: string;
  label: string;
  params: Record<string, unknown>;
}
