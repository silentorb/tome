import type { Node as ProseNode } from "@milkdown/prose/model";
import { editorDynamicNodeHref, isDynamicEditorHref } from "tome-flatfile/dynamic-node-links";
import { resolveMarkdownHrefTarget } from "tome-flatfile/markdown-links";
import { DEFAULT_CALLOUT_EMOJI } from "tome-flatfile/callout";
import { formatPageBlockEmbedComment, parsePageBlockPayload } from "tome-interfaces/page-block";
import {
  emptyNodeBodyDocument,
  type NodeBodyBlock,
  type NodeBodyDocument,
  type NodeBodyInline,
  type NodeBodyListItem,
  type NodeBodyMark,
  type NodeBodyTableCell,
  type NodeBodyTableRow,
} from "tome-graph-interfaces";

export interface PmMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  text?: string;
  marks?: PmMark[];
}

const FORMAT_MARKS = new Set<NodeBodyMark>(["strong", "emphasis", "inlineCode", "strike_through"]);

function formattingMarks(marks: readonly NodeBodyMark[] | undefined): PmMark[] {
  return (marks ?? []).filter((mark) => FORMAT_MARKS.has(mark)).map((type) => ({ type }));
}

function textNode(text: string, marks: PmMark[]): PmNode {
  return marks.length > 0 ? { type: "text", text, marks } : { type: "text", text };
}

function linkMark(href: string, title: string | null): PmMark {
  return { type: "link", attrs: { href, title } };
}

function inlinesToPm(inlines: readonly NodeBodyInline[]): PmNode[] {
  const out: PmNode[] = [];
  for (const inline of inlines) {
    switch (inline.type) {
      case "text":
        if (inline.text) out.push(textNode(inline.text, formattingMarks(inline.marks)));
        break;
      case "hard_break":
        out.push({ type: "hardbreak" });
        break;
      case "image":
        out.push({
          type: "image",
          attrs: { src: inline.src, alt: inline.alt, title: inline.title ?? "" },
        });
        break;
      case "html_inline":
        out.push({ type: "html", attrs: { value: inline.value } });
        break;
      case "dynamic_link": {
        const label = inline.title || inline.nodeId;
        out.push(textNode(label, [...formattingMarks(undefined), linkMark(editorDynamicNodeHref(inline.nodeId), null)]));
        break;
      }
      case "static_link": {
        const label = inline.label || inline.nodeId;
        out.push(textNode(label, [linkMark(`?node=${inline.nodeId}`, null)]));
        break;
      }
      case "link": {
        const link = linkMark(inline.href, inline.title);
        for (const child of inlinesToPm(inline.content)) {
          if (child.type === "text") {
            out.push(textNode(child.text ?? "", [...(child.marks ?? []), link]));
          } else {
            out.push(child);
          }
        }
        break;
      }
      default: {
        const _exhaustive: never = inline;
        return _exhaustive;
      }
    }
  }
  return out;
}

function listItemToPm(item: NodeBodyListItem): PmNode {
  let content = blocksToPm(item.content);
  if (content.length === 0 || content[0]?.type !== "paragraph") {
    content = [{ type: "paragraph" }, ...content];
  }
  return {
    type: "list_item",
    attrs: { checked: item.checked },
    content,
  };
}

function cellToPm(cell: NodeBodyTableCell, header: boolean): PmNode {
  return {
    type: header ? "table_header" : "table_cell",
    content: [{ type: "paragraph", content: inlinesToPm(cell.content) }],
  };
}

function rowToPm(row: NodeBodyTableRow): PmNode {
  return {
    type: row.header ? "table_header_row" : "table_row",
    content: row.content.map((cell) => cellToPm(cell, row.header)),
  };
}

function blocksToPm(blocks: readonly NodeBodyBlock[]): PmNode[] {
  const out: PmNode[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
        out.push({ type: "paragraph", content: inlinesToPm(block.content) });
        break;
      case "heading":
        out.push({
          type: "heading",
          attrs: { level: block.level },
          content: inlinesToPm(block.content),
        });
        break;
      case "blockquote":
        out.push({ type: "blockquote", content: blocksToPm(block.content) });
        break;
      case "callout":
        out.push({
          type: "callout",
          attrs: { emoji: block.emoji || DEFAULT_CALLOUT_EMOJI },
          content: blocksToPm(block.content),
        });
        break;
      case "bullet_list":
        out.push({ type: "bullet_list", content: block.content.map(listItemToPm) });
        break;
      case "ordered_list":
        out.push({
          type: "ordered_list",
          attrs: { order: block.order },
          content: block.content.map(listItemToPm),
        });
        break;
      case "code_block":
        out.push({
          type: "code_block",
          attrs: { language: block.language ?? "" },
          content: block.text ? [{ type: "text", text: block.text }] : [],
        });
        break;
      case "horizontal_rule":
        out.push({ type: "hr" });
        break;
      case "table": {
        const rows = block.content.map(rowToPm);
        const header = rows.find((row) => row.type === "table_header_row");
        const body = rows.filter((row) => row.type === "table_row");
        const width = header?.content?.length ?? body[0]?.content?.length ?? 1;
        const emptyCell = (): PmNode => ({
          type: "table_cell",
          content: [{ type: "paragraph" }],
        });
        const headerRow = header ?? {
          type: "table_header_row",
          content: Array.from({ length: width }, () => ({
            type: "table_header",
            content: [{ type: "paragraph" }],
          })),
        };
        const bodyRows = body.length > 0 ? body : [{ type: "table_row", content: Array.from({ length: width }, emptyCell) }];
        out.push({ type: "table", content: [headerRow, ...bodyRows] });
        break;
      }
      case "page_block":
        out.push({
          type: "tome_page_block",
          attrs: {
            comment: formatPageBlockEmbedComment({
              componentId: block.componentId,
              data: block.data,
            }),
            html: block.editorHtml ?? "",
          },
        });
        break;
      case "html":
        out.push({
          type: "paragraph",
          content: [{ type: "html", attrs: { value: block.value } }],
        });
        break;
      default: {
        const _exhaustive: never = block;
        return _exhaustive;
      }
    }
  }
  return out.map((node) => (node.content && node.content.length === 0 ? { ...node, content: undefined } : node));
}

/** Semantic document → ProseMirror JSON for the Milkdown schema. */
export function documentToPmJson(document: NodeBodyDocument): PmNode {
  const content = blocksToPm(document.content);
  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  };
}

function pmMarks(node: PmNode): { formatting: NodeBodyMark[]; href: string | null; title: string | null } {
  const formatting: NodeBodyMark[] = [];
  let href: string | null = null;
  let title: string | null = null;
  for (const mark of node.marks ?? []) {
    if (mark.type === "link") {
      href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
      title = typeof mark.attrs?.title === "string" ? mark.attrs.title : null;
    } else if (FORMAT_MARKS.has(mark.type as NodeBodyMark)) {
      formatting.push(mark.type as NodeBodyMark);
    }
  }
  return { formatting, href, title };
}

function inlinesFromPm(nodes: readonly PmNode[] | undefined): NodeBodyInline[] {
  const out: NodeBodyInline[] = [];
  for (const node of nodes ?? []) {
    if (node.type === "text") {
      const text = node.text ?? "";
      if (!text) continue;
      const { formatting, href, title } = pmMarks(node);
      if (href != null && isDynamicEditorHref(href)) {
        const nodeId = resolveMarkdownHrefTarget(href);
        if (nodeId) {
          out.push({ type: "dynamic_link", nodeId, title: text });
          continue;
        }
      }
      if (href != null) {
        const nodeId = resolveMarkdownHrefTarget(href);
        if (nodeId) {
          out.push({ type: "static_link", nodeId, label: text });
          continue;
        }
        out.push({
          type: "link",
          href,
          title,
          content: [formatting.length > 0 ? { type: "text", text, marks: formatting } : { type: "text", text }],
        });
        continue;
      }
      out.push(formatting.length > 0 ? { type: "text", text, marks: formatting } : { type: "text", text });
      continue;
    }
    if (node.type === "hardbreak") {
      out.push({ type: "hard_break" });
      continue;
    }
    if (node.type === "image") {
      out.push({
        type: "image",
        src: String(node.attrs?.src ?? ""),
        alt: String(node.attrs?.alt ?? ""),
        title: typeof node.attrs?.title === "string" && node.attrs.title ? node.attrs.title : null,
      });
      continue;
    }
    if (node.type === "html") {
      out.push({ type: "html_inline", value: String(node.attrs?.value ?? "") });
    }
  }
  return out;
}

function stripEmojiPrefix(inlines: NodeBodyInline[], emoji: string): NodeBodyInline[] {
  let stripped = false;
  return inlines.flatMap((inline) => {
    if (stripped || inline.type !== "text" || inline.marks?.length) return [inline];
    const trimmed = inline.text.trimStart();
    if (!trimmed.startsWith(emoji)) return [inline];
    const rest = trimmed.slice(emoji.length).replace(/^\s+/, "");
    stripped = true;
    if (!rest) return [];
    return [{ ...inline, text: rest }];
  });
}

function blocksFromPm(nodes: readonly PmNode[] | undefined): NodeBodyBlock[] {
  const out: NodeBodyBlock[] = [];
  for (const node of nodes ?? []) {
    switch (node.type) {
      case "paragraph": {
        const content = inlinesFromPm(node.content);
        if (content.length === 1 && content[0]?.type === "html_inline") {
          out.push({ type: "html", value: content[0].value });
          break;
        }
        out.push({ type: "paragraph", content });
        break;
      }
      case "heading":
        out.push({
          type: "heading",
          level: Number(node.attrs?.level ?? 1),
          content: inlinesFromPm(node.content),
        });
        break;
      case "blockquote": {
        const content = blocksFromPm(node.content);
        const first = content[0];
        const lead = first?.type === "paragraph" ? first.content : [];
        const leadText = lead.map((inline) => (inline.type === "text" ? inline.text : "")).join("");
        const emojiMatch = /^(\p{Extended_Pictographic})\s*/u.exec(leadText.trimStart());
        if (emojiMatch?.[1]) {
          const emoji = emojiMatch[1];
          const stripped = content.map((block, index) =>
            index === 0 && block.type === "paragraph"
              ? { ...block, content: stripEmojiPrefix(block.content, emoji) }
              : block,
          );
          out.push({ type: "callout", emoji, content: stripped });
        } else {
          out.push({ type: "blockquote", content });
        }
        break;
      }
      case "callout": {
        const emoji = String(node.attrs?.emoji ?? DEFAULT_CALLOUT_EMOJI);
        const content = blocksFromPm(node.content).map((block, index) =>
          index === 0 && block.type === "paragraph"
            ? { ...block, content: stripEmojiPrefix(block.content, emoji) }
            : block,
        );
        out.push({ type: "callout", emoji, content });
        break;
      }
      case "bullet_list":
        out.push({ type: "bullet_list", content: (node.content ?? []).map(listItemFromPm) });
        break;
      case "ordered_list":
        out.push({
          type: "ordered_list",
          order: Number(node.attrs?.order ?? 1),
          content: (node.content ?? []).map(listItemFromPm),
        });
        break;
      case "code_block": {
        const language =
          typeof node.attrs?.language === "string" && node.attrs.language ? node.attrs.language : null;
        const text = (node.content ?? []).map((child) => child.text ?? "").join("");
        if (language === "tome-block") {
          const payload = parsePageBlockPayload(text);
          if (payload) {
            out.push({
              type: "page_block",
              componentId: payload.componentId,
              data: payload.data,
            });
            break;
          }
        }
        out.push({ type: "code_block", language, text });
        break;
      }
      case "hr":
        out.push({ type: "horizontal_rule" });
        break;
      case "table": {
        const rows: NodeBodyTableRow[] = [];
        for (const row of node.content ?? []) {
          const header = row.type === "table_header_row";
          rows.push({
            type: "table_row",
            header,
            content: (row.content ?? []).map((cell) => ({
              type: "table_cell",
              content: inlinesFromPm(cell.content?.[0]?.type === "paragraph" ? cell.content[0].content : cell.content),
            })),
          });
        }
        out.push({ type: "table", content: rows });
        break;
      }
      case "tome_page_block": {
        const comment = String(node.attrs?.comment ?? "");
        const payload = parsePageBlockPayload(comment.replace(/^<!-- tome-page-block /, "").replace(/ -->$/, ""));
        if (!payload) break;
        out.push({
          type: "page_block",
          componentId: payload.componentId,
          data: payload.data,
          editorHtml: String(node.attrs?.html ?? ""),
        });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

function listItemFromPm(node: PmNode): NodeBodyListItem {
  const checked = node.attrs?.checked;
  return {
    type: "list_item",
    checked: typeof checked === "boolean" ? checked : null,
    content: blocksFromPm(node.content),
  };
}

function isEmptyParagraph(block: NodeBodyBlock): boolean {
  return block.type === "paragraph" && block.content.every((inline) => inline.type === "text" && !inline.text.trim());
}

/** ProseMirror JSON → semantic document. */
export function pmJsonToDocument(json: PmNode): NodeBodyDocument {
  const content = blocksFromPm(json.type === "doc" ? json.content : [json]);
  if (content.length === 1 && content[0] && isEmptyParagraph(content[0])) {
    return emptyNodeBodyDocument();
  }
  return { version: 1, content };
}

export function pmNodeToDocument(doc: ProseNode): NodeBodyDocument {
  return pmJsonToDocument(doc.toJSON() as PmNode);
}
