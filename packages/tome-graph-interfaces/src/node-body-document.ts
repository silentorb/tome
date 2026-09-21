/**
 * Semantic node body for the editor page-load use case.
 * CommonMark + GFM baseline, plus Tome extensions (callout, dynamic/static links, page blocks).
 * Git-tracked Extended Markdown is a storage encoding of this tree, not the wire format.
 */

export const NODE_BODY_DOCUMENT_VERSION = 1 as const;

export type NodeBodyMark = "strong" | "emphasis" | "inlineCode" | "strike_through";

export interface NodeBodyText {
  type: "text";
  text: string;
  marks?: NodeBodyMark[];
}

export interface NodeBodyHardBreak {
  type: "hard_break";
}

export interface NodeBodyImage {
  type: "image";
  src: string;
  alt: string;
  title: string | null;
}

export interface NodeBodyLink {
  type: "link";
  href: string;
  title: string | null;
  content: NodeBodyInline[];
}

export interface NodeBodyDynamicLink {
  type: "dynamic_link";
  nodeId: string;
  /** Display label. Resolved from the target title on GET; not stored in markdown. */
  title: string;
}

export interface NodeBodyStaticLink {
  type: "static_link";
  nodeId: string;
  label: string;
}

export interface NodeBodyHtmlInline {
  type: "html_inline";
  value: string;
}

export type NodeBodyInline =
  | NodeBodyText
  | NodeBodyHardBreak
  | NodeBodyImage
  | NodeBodyLink
  | NodeBodyDynamicLink
  | NodeBodyStaticLink
  | NodeBodyHtmlInline;

export interface NodeBodyParagraph {
  type: "paragraph";
  content: NodeBodyInline[];
}

export interface NodeBodyHeading {
  type: "heading";
  level: number;
  content: NodeBodyInline[];
}

export interface NodeBodyBlockquote {
  type: "blockquote";
  content: NodeBodyBlock[];
}

export interface NodeBodyCallout {
  type: "callout";
  emoji: string;
  content: NodeBodyBlock[];
}

export interface NodeBodyListItem {
  type: "list_item";
  checked: boolean | null;
  content: NodeBodyBlock[];
}

export interface NodeBodyBulletList {
  type: "bullet_list";
  content: NodeBodyListItem[];
}

export interface NodeBodyOrderedList {
  type: "ordered_list";
  order: number;
  content: NodeBodyListItem[];
}

export interface NodeBodyCodeBlock {
  type: "code_block";
  language: string | null;
  text: string;
}

export interface NodeBodyHorizontalRule {
  type: "horizontal_rule";
}

export interface NodeBodyTableCell {
  type: "table_cell";
  content: NodeBodyInline[];
}

export interface NodeBodyTableRow {
  type: "table_row";
  /** First row of a table is the header (`table_header` in ProseMirror). */
  header: boolean;
  content: NodeBodyTableCell[];
}

export interface NodeBodyTable {
  type: "table";
  content: NodeBodyTableRow[];
}

export interface NodeBodyPageBlock {
  type: "page_block";
  componentId: string;
  data: unknown;
  /** GET enrichment only. Omitted on PATCH equality. */
  editorHtml?: string;
}

export interface NodeBodyHtmlBlock {
  type: "html";
  value: string;
}

export type NodeBodyBlock =
  | NodeBodyParagraph
  | NodeBodyHeading
  | NodeBodyBlockquote
  | NodeBodyCallout
  | NodeBodyBulletList
  | NodeBodyOrderedList
  | NodeBodyCodeBlock
  | NodeBodyHorizontalRule
  | NodeBodyTable
  | NodeBodyPageBlock
  | NodeBodyHtmlBlock;

export interface NodeBodyDocument {
  version: typeof NODE_BODY_DOCUMENT_VERSION;
  content: NodeBodyBlock[];
}

export function emptyNodeBodyDocument(): NodeBodyDocument {
  return { version: NODE_BODY_DOCUMENT_VERSION, content: [] };
}

export function inlinePlainText(inlines: readonly NodeBodyInline[]): string {
  let text = "";
  for (const inline of inlines) {
    switch (inline.type) {
      case "text":
        text += inline.text;
        break;
      case "dynamic_link":
        text += inline.title;
        break;
      case "static_link":
        text += inline.label;
        break;
      case "link":
        text += inlinePlainText(inline.content);
        break;
      case "image":
        text += inline.alt;
        break;
      case "html_inline":
        text += inline.value;
        break;
      case "hard_break":
        text += "\n";
        break;
      default: {
        const _exhaustive: never = inline;
        return _exhaustive;
      }
    }
  }
  return text;
}

function inlinesMeaningful(inlines: readonly NodeBodyInline[]): boolean {
  for (const inline of inlines) {
    switch (inline.type) {
      case "text":
        if (inline.text.trim()) return true;
        break;
      case "hard_break":
        break;
      case "link":
        if (inlinesMeaningful(inline.content)) return true;
        break;
      default:
        return true;
    }
  }
  return false;
}

function blockMeaningful(block: NodeBodyBlock): boolean {
  switch (block.type) {
    case "paragraph":
    case "heading":
      return inlinesMeaningful(block.content);
    case "blockquote":
      return block.content.some(blockMeaningful);
    case "callout":
    case "horizontal_rule":
    case "page_block":
    case "table":
      return true;
    case "code_block":
    case "html":
      return block.type === "code_block" ? block.text.trim().length > 0 : block.value.trim().length > 0;
    case "bullet_list":
    case "ordered_list":
      return block.content.some((item) => item.content.some(blockMeaningful));
    default: {
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}

export function isDocumentEffectivelyEmpty(document: NodeBodyDocument): boolean {
  return !document.content.some(blockMeaningful);
}

function mapBlocks(
  blocks: readonly NodeBodyBlock[],
  mapPage: (block: NodeBodyPageBlock) => NodeBodyPageBlock,
): NodeBodyBlock[] {
  return blocks.map((block) => {
    switch (block.type) {
      case "page_block":
        return mapPage(block);
      case "blockquote":
      case "callout":
        return { ...block, content: mapBlocks(block.content, mapPage) };
      case "bullet_list":
      case "ordered_list":
        return {
          ...block,
          content: block.content.map((item) => ({
            ...item,
            content: mapBlocks(item.content, mapPage),
          })),
        };
      default:
        return block;
    }
  });
}

export function documentHasPageBlock(document: NodeBodyDocument): boolean {
  let found = false;
  mapBlocks(document.content, (block) => {
    found = true;
    return block;
  });
  return found;
}

export function mapPageBlocks(
  document: NodeBodyDocument,
  mapPage: (block: NodeBodyPageBlock) => NodeBodyPageBlock,
): NodeBodyDocument {
  return { ...document, content: mapBlocks(document.content, mapPage) };
}

function withoutEditorHtml(document: NodeBodyDocument): NodeBodyDocument {
  return mapPageBlocks(document, (block) => {
    const { editorHtml: _editorHtml, ...rest } = block;
    return rest;
  });
}

export function documentsEqual(a: NodeBodyDocument, b: NodeBodyDocument): boolean {
  return JSON.stringify(withoutEditorHtml(a)) === JSON.stringify(withoutEditorHtml(b));
}

export function documentEqualityKey(document: NodeBodyDocument): string {
  return JSON.stringify(withoutEditorHtml(document));
}

/** Drop a leading h1 whose text duplicates the page title (title lives outside the body). */
export function stripDuplicateTitleHeading(
  document: NodeBodyDocument,
  title: string,
): NodeBodyDocument {
  const [first, ...rest] = document.content;
  if (!first || first.type !== "heading" || first.level !== 1) return document;
  const heading = inlinePlainText(first.content).trim();
  if (heading.localeCompare(title.trim(), undefined, { sensitivity: "accent" }) !== 0) {
    return document;
  }
  return { ...document, content: rest };
}

export function collectDynamicLinkIds(document: NodeBodyDocument): string[] {
  const ids: string[] = [];
  const visitInlines = (inlines: readonly NodeBodyInline[]) => {
    for (const inline of inlines) {
      if (inline.type === "dynamic_link") ids.push(inline.nodeId);
      else if (inline.type === "link") visitInlines(inline.content);
    }
  };
  const visitBlocks = (blocks: readonly NodeBodyBlock[]) => {
    for (const block of blocks) {
      switch (block.type) {
        case "paragraph":
        case "heading":
          visitInlines(block.content);
          break;
        case "blockquote":
        case "callout":
          visitBlocks(block.content);
          break;
        case "bullet_list":
        case "ordered_list":
          for (const item of block.content) visitBlocks(item.content);
          break;
        case "table":
          for (const row of block.content) {
            for (const cell of row.content) visitInlines(cell.content);
          }
          break;
        default:
          break;
      }
    }
  };
  visitBlocks(document.content);
  return [...new Set(ids)];
}

export function assignDynamicLinkTitles(
  document: NodeBodyDocument,
  titleForId: (nodeId: string) => string,
): NodeBodyDocument {
  const visitInlines = (inlines: NodeBodyInline[]): NodeBodyInline[] =>
    inlines.map((inline) => {
      if (inline.type === "dynamic_link") {
        return { ...inline, title: titleForId(inline.nodeId) };
      }
      if (inline.type === "link") {
        return { ...inline, content: visitInlines(inline.content) };
      }
      return inline;
    });
  const visitBlocks = (blocks: NodeBodyBlock[]): NodeBodyBlock[] =>
    blocks.map((block) => {
      switch (block.type) {
        case "paragraph":
        case "heading":
          return { ...block, content: visitInlines(block.content) };
        case "blockquote":
        case "callout":
          return { ...block, content: visitBlocks(block.content) };
        case "bullet_list":
        case "ordered_list":
          return {
            ...block,
            content: block.content.map((item) => ({
              ...item,
              content: visitBlocks(item.content),
            })),
          };
        case "table":
          return {
            ...block,
            content: block.content.map((row) => ({
              ...row,
              content: row.content.map((cell) => ({
                ...cell,
                content: visitInlines(cell.content),
              })),
            })),
          };
        default:
          return block;
      }
    });
  return { ...document, content: visitBlocks(document.content) };
}
