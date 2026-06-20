import {
  editorDynamicNodeHref,
  parseDynamicNodeLinkIds,
  prepareEditorMarkdownBody,
} from "tome-db/dynamic-node-links";

/** Markdown href for in-editor static node links (relative to current page URL). */
export function standaloneEditorNodeHref(nodeId: string): string {
  return `?node=${nodeId.toLowerCase()}`;
}

/** Prepare markdown loaded into Milkdown: expand dynamic and static node links. */
export function prepareEditorMarkdown(
  body: string,
  titleForId: (nodeId: string) => string = () => "Untitled",
): string {
  return prepareEditorMarkdownBody(body, titleForId, (id) => standaloneEditorNodeHref(id));
}

/** Markdown dynamic link inserted via @ mention (editor display form). */
export function formatEditorDynamicNodeLink(nodeId: string, title: string): string {
  return `[${title}](${editorDynamicNodeHref(nodeId)})`;
}

/** Markdown link inserted into the live editor (static-titled display href). */
export function formatEditorNodeMarkdownLink(title: string, nodeId: string): string {
  return `[${title}](${standaloneEditorNodeHref(nodeId)})`;
}

export { parseDynamicNodeLinkIds };

/** @deprecated Use prepareEditorMarkdown */
export const preprocessStandaloneMarkdown = prepareEditorMarkdown;
