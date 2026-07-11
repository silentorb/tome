export interface SearchMatchPreviewPart {
  text: string;
  highlight: boolean;
}

export interface SearchMatchPreview {
  parts: ReadonlyArray<SearchMatchPreviewPart>;
}
