import type { SearchMatchPreview } from "./search-match-preview";

export type { SearchMatchPreview, SearchMatchPreviewPart } from "./search-match-preview";

export interface NodeSummary {
  id: string;
  title: string;
  primaryTypeTitle: string | null;
  matchPreview?: SearchMatchPreview;
  /** Owning corpus id when the session has multiple corpora. */
  corpusId?: string;
  /** True when the owning corpus is readonly. */
  corpusReadonly?: boolean;
  /** Display title of the owning corpus when it differs from the caller's activeCorpusId. */
  corpusLabel?: string;
}

export interface NodeDetail extends NodeSummary {
  body: string;
  isTypeTable: boolean;
  archived: boolean;
}

export interface SearchNodesOptions {
  /** Editor active corpus; used to decide which hits get corpusLabel. */
  activeCorpusId?: string;
  /**
   * Selected / locked directed projection type for Only-active filtering.
   * Combined with {@link onlyActivePickingRole} to resolve host nodes of the
   * opposite association side (e.g. Membership → sources of Members).
   */
  participatesInProjectionType?: string;
  /**
   * Endpoint role being picked for the selected projection.
   * Default `target` (Relate / move-to-new-target). Use `source` when moving
   * the owning side of a relation section.
   */
  onlyActivePickingRole?: "source" | "target";
}
