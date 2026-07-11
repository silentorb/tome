import type { SearchMatchPreview } from "./search-match-preview";

export type { SearchMatchPreview, SearchMatchPreviewPart } from "./search-match-preview";

export interface NodeSummary {
  id: string;
  title: string;
  primaryTypeTitle: string | null;
  matchPreview?: SearchMatchPreview;
}

export interface NodeDetail extends NodeSummary {
  body: string;
  isTypeTable: boolean;
  archived: boolean;
}

export interface SearchNodesOptions {
  includeBody?: boolean;
}
