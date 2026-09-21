import { canonicalNodeMarkdownHref } from "tome-flatfile/markdown-links";
import { resolveMarkdownHrefTarget } from "tome-flatfile/markdown-links";
import { NODE_ID_RE_SRC } from "tome-flatfile/node-id";
import { extractLeadingCalloutEmoji } from "tome-flatfile/callout";
import { parsePageBlockPayload, serializePageBlockInner } from "tome-interfaces/page-block";
import {
  assignDynamicLinkTitles,
  collectDynamicLinkIds,
  emptyNodeBodyDocument,
  mapPageBlocks,
  type NodeBodyBlock,
  type NodeBodyDocument,
  type NodeBodyInline,
  type NodeBodyListItem,
  type NodeBodyMark,
  type NodeBodyTableCell,
  type NodeBodyTableRow,
} from "tome-graph-interfaces";
import type { RelationshipReadStore } from "./graph-store/relationship-read";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified, type Plugin } from "unified";
import { visit } from "unist-util-visit";
import type {
  BlockContent,
  Blockquote,
  Code,
  Delete,
  Emphasis,
  Heading,
  Html,
  Image,
  InlineCode,
  Link,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  Strong,
  Table,
  TableCell,
  TableRow,
  Text,
} from "mdast";

const WIKI_LINK = new RegExp(`\\[\\[(${NODE_ID_RE_SRC})\\]\\]`, "g");

interface WikiLink {
  type: "wikiLink";
  nodeId: string;
}

type MdastParent = { children: unknown[] };

const splitWikiLinksPlugin: Plugin<[], Root> = () => (tree) => {
  visit(tree, "text", (node, index, parent) => {
    if (!parent || index == null) return;
    const value = (node as Text).value;
    if (!value.includes("[[")) return;
    const parts: Array<Text | WikiLink> = [];
    let last = 0;
    WIKI_LINK.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = WIKI_LINK.exec(value)) !== null) {
      if (match.index > last) {
        parts.push({ type: "text", value: value.slice(last, match.index) });
      }
      parts.push({ type: "wikiLink", nodeId: match[1]! });
      last = match.index + match[0].length;
    }
    if (parts.length === 0) return;
    if (last < value.length) {
      parts.push({ type: "text", value: value.slice(last) });
    }
    const children = (parent as MdastParent).children;
    children.splice(index, 1, ...parts);
    return index + parts.length;
  });
};

const wikiLinkToMarkdownPlugin: Plugin<[], Root> = function (this: { data: () => unknown }) {
  const data = this.data() as { toMarkdownExtensions?: unknown[] };
  const extensions = data.toMarkdownExtensions ?? (data.toMarkdownExtensions = []);
  extensions.push({
    handlers: {
      wikiLink(node: WikiLink) {
        return `[[${node.nodeId}]]`;
      },
    },
  });
};

function parseMarkdownRoot(markdown: string): Root {
  const processor = unified().use(remarkParse).use(remarkGfm).use(splitWikiLinksPlugin);
  return processor.runSync(processor.parse(markdown)) as Root;
}

function marksOf(extra: NodeBodyMark | null, base: readonly NodeBodyMark[]): NodeBodyMark[] | undefined {
  const marks = extra ? [...base, extra] : [...base];
  return marks.length > 0 ? marks : undefined;
}

function convertInlines(nodes: readonly PhrasingContent[], baseMarks: readonly NodeBodyMark[]): NodeBodyInline[] {
  const out: NodeBodyInline[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "text": {
        if (!node.value) break;
        const marks = marksOf(null, baseMarks);
        out.push(marks ? { type: "text", text: node.value, marks } : { type: "text", text: node.value });
        break;
      }
      case "strong":
        out.push(...convertInlines((node as Strong).children, marksOf("strong", baseMarks) ?? ["strong"]));
        break;
      case "emphasis":
        out.push(...convertInlines((node as Emphasis).children, marksOf("emphasis", baseMarks) ?? ["emphasis"]));
        break;
      case "delete":
        out.push(
          ...convertInlines((node as Delete).children, marksOf("strike_through", baseMarks) ?? ["strike_through"]),
        );
        break;
      case "inlineCode": {
        const code = node as InlineCode;
        out.push({
          type: "text",
          text: code.value,
          marks: marksOf("inlineCode", baseMarks) ?? ["inlineCode"],
        });
        break;
      }
      case "break":
        out.push({ type: "hard_break" });
        break;
      case "image": {
        const image = node as Image;
        out.push({
          type: "image",
          src: image.url,
          alt: image.alt ?? "",
          title: image.title ?? null,
        });
        break;
      }
      case "html":
        out.push({ type: "html_inline", value: (node as Html).value });
        break;
      case "link": {
        const link = node as Link;
        const targetId = resolveMarkdownHrefTarget(link.url);
        if (targetId) {
          out.push({
            type: "static_link",
            nodeId: targetId,
            label: phrasingPlainText(link.children),
          });
        } else {
          out.push({
            type: "link",
            href: link.url,
            title: link.title ?? null,
            content: convertInlines(link.children, []),
          });
        }
        break;
      }
      default: {
        if ((node as { type?: string }).type === "wikiLink") {
          out.push({ type: "dynamic_link", nodeId: (node as unknown as WikiLink).nodeId, title: "" });
          break;
        }
        const fallback = phrasingPlainText([node]);
        if (fallback) out.push({ type: "text", text: fallback });
        break;
      }
    }
  }
  return out;
}

function phrasingPlainText(nodes: readonly PhrasingContent[]): string {
  return convertInlines(nodes, [])
    .map((inline) => {
      if (inline.type === "text") return inline.text;
      if (inline.type === "static_link") return inline.label;
      if (inline.type === "dynamic_link") return inline.title;
      if (inline.type === "link") return inline.content.map((part) => (part.type === "text" ? part.text : "")).join("");
      return "";
    })
    .join("");
}

function firstParagraphText(blocks: readonly NodeBodyBlock[]): string {
  const first = blocks[0];
  if (!first || first.type !== "paragraph") return "";
  return first.content
    .map((inline) => (inline.type === "text" ? inline.text : ""))
    .join("");
}

function stripLeadingEmoji(blocks: NodeBodyBlock[], emoji: string): NodeBodyBlock[] {
  const [first, ...rest] = blocks;
  if (!first || first.type !== "paragraph") return blocks;
  const prefix = `${emoji}`;
  let stripped = false;
  const content = first.content.flatMap((inline) => {
    if (stripped || inline.type !== "text") return [inline];
    const trimmedStart = inline.text.trimStart();
    if (!trimmedStart.startsWith(prefix)) return [inline];
    const without = trimmedStart.slice(prefix.length).replace(/^\s+/, "");
    stripped = true;
    if (!without) return [];
    return [{ ...inline, text: without }];
  });
  if (!stripped) return blocks;
  if (content.length === 0 && rest.length === 0) {
    return [{ type: "paragraph", content: [] }];
  }
  return [{ ...first, content }, ...rest];
}

function convertListItem(item: ListItem): NodeBodyListItem {
  return {
    type: "list_item",
    checked: typeof item.checked === "boolean" ? item.checked : null,
    content: convertBlocks(item.children),
  };
}

function convertTableCell(cell: TableCell): NodeBodyTableCell {
  return { type: "table_cell", content: convertInlines(cell.children, []) };
}

function convertBlocks(nodes: readonly (BlockContent | RootContent)[]): NodeBodyBlock[] {
  const out: NodeBodyBlock[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case "paragraph":
        out.push({ type: "paragraph", content: convertInlines((node as Paragraph).children, []) });
        break;
      case "heading": {
        const heading = node as Heading;
        out.push({
          type: "heading",
          level: heading.depth,
          content: convertInlines(heading.children, []),
        });
        break;
      }
      case "blockquote": {
        const quote = node as Blockquote;
        const content = convertBlocks(quote.children);
        const emoji = extractLeadingCalloutEmoji(firstParagraphText(content));
        if (emoji) {
          out.push({ type: "callout", emoji, content: stripLeadingEmoji(content, emoji) });
        } else {
          out.push({ type: "blockquote", content });
        }
        break;
      }
      case "list": {
        const list = node as List;
        const items = list.children.map(convertListItem);
        if (list.ordered) {
          out.push({ type: "ordered_list", order: list.start ?? 1, content: items });
        } else {
          out.push({ type: "bullet_list", content: items });
        }
        break;
      }
      case "code": {
        const code = node as Code;
        if (code.lang === "tome-block") {
          const payload = parsePageBlockPayload(code.value);
          if (payload) {
            out.push({
              type: "page_block",
              componentId: payload.componentId,
              data: payload.data,
            });
            break;
          }
        }
        out.push({
          type: "code_block",
          language: code.lang ?? null,
          text: code.value,
        });
        break;
      }
      case "thematicBreak":
        out.push({ type: "horizontal_rule" });
        break;
      case "table": {
        const table = node as Table;
        const rows: NodeBodyTableRow[] = table.children.map((row: TableRow, index) => ({
          type: "table_row",
          header: index === 0,
          content: row.children.map(convertTableCell),
        }));
        out.push({ type: "table", content: rows });
        break;
      }
      case "html":
        out.push({ type: "html", value: (node as Html).value });
        break;
      default: {
        if ("value" in node && typeof node.value === "string" && node.value) {
          out.push({ type: "paragraph", content: [{ type: "text", text: node.value }] });
        }
        break;
      }
    }
  }
  return out;
}

/** Extended Markdown → semantic document. Dynamic-link titles are empty until resolved. */
export function parseStorageBody(markdown: string): NodeBodyDocument {
  const root = parseMarkdownRoot(markdown);
  const content = convertBlocks(root.children);
  if (content.length === 0) return emptyNodeBodyDocument();
  return { version: 1, content };
}

function textNode(value: string, marks?: readonly NodeBodyMark[]): PhrasingContent {
  if (marks?.includes("inlineCode")) {
    return { type: "inlineCode", value };
  }
  let node: PhrasingContent = { type: "text", value };
  const wrapping = (marks ?? []).filter((mark) => mark !== "inlineCode");
  for (const mark of [...wrapping].reverse()) {
    if (mark === "strong") node = { type: "strong", children: [node] };
    else if (mark === "emphasis") node = { type: "emphasis", children: [node] };
    else if (mark === "strike_through") node = { type: "delete", children: [node] };
  }
  return node;
}

function inlinesToMdast(inlines: readonly NodeBodyInline[]): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  for (const inline of inlines) {
    switch (inline.type) {
      case "text":
        if (inline.text) out.push(textNode(inline.text, inline.marks));
        break;
      case "hard_break":
        out.push({ type: "break" });
        break;
      case "image":
        out.push({
          type: "image",
          url: inline.src,
          alt: inline.alt,
          title: inline.title,
        });
        break;
      case "html_inline":
        out.push({ type: "html", value: inline.value });
        break;
      case "dynamic_link":
        out.push({ type: "wikiLink", nodeId: inline.nodeId } as unknown as PhrasingContent);
        break;
      case "static_link":
        out.push({
          type: "link",
          url: canonicalNodeMarkdownHref(inline.nodeId),
          children: [{ type: "text", value: inline.label }],
        });
        break;
      case "link":
        out.push({
          type: "link",
          url: inline.href,
          title: inline.title,
          children: inlinesToMdast(inline.content),
        });
        break;
      default: {
        const _exhaustive: never = inline;
        return _exhaustive;
      }
    }
  }
  return out;
}

function withCalloutEmoji(blocks: NodeBodyBlock[], emoji: string): NodeBodyBlock[] {
  const [first, ...rest] = blocks;
  const prefix = `${emoji} `;
  if (!first || first.type !== "paragraph") {
    return [{ type: "paragraph", content: [{ type: "text", text: prefix.trimEnd() }] }, ...blocks];
  }
  const [lead, ...tail] = first.content;
  if (!lead || lead.type !== "text") {
    return [{ ...first, content: [{ type: "text", text: prefix }, ...first.content] }, ...rest];
  }
  return [{ ...first, content: [{ ...lead, text: prefix + lead.text }, ...tail] }, ...rest];
}

function blocksToMdast(blocks: readonly NodeBodyBlock[]): BlockContent[] {
  const out: BlockContent[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
        out.push({ type: "paragraph", children: inlinesToMdast(block.content) });
        break;
      case "heading":
        out.push({
          type: "heading",
          depth: Math.min(6, Math.max(1, block.level)) as Heading["depth"],
          children: inlinesToMdast(block.content),
        });
        break;
      case "blockquote":
        out.push({ type: "blockquote", children: blocksToMdast(block.content) });
        break;
      case "callout":
        out.push({
          type: "blockquote",
          children: blocksToMdast(withCalloutEmoji(block.content, block.emoji)),
        });
        break;
      case "bullet_list":
        out.push({
          type: "list",
          ordered: false,
          spread: false,
          children: block.content.map(listItemToMdast),
        });
        break;
      case "ordered_list":
        out.push({
          type: "list",
          ordered: true,
          start: block.order,
          spread: false,
          children: block.content.map(listItemToMdast),
        });
        break;
      case "code_block":
        out.push({
          type: "code",
          lang: block.language,
          value: block.text,
        } as Code);
        break;
      case "horizontal_rule":
        out.push({ type: "thematicBreak" });
        break;
      case "table":
        out.push({
          type: "table",
          align: [],
          children: block.content.map((row) => ({
            type: "tableRow",
            children: row.content.map((cell) => ({
              type: "tableCell",
              children: inlinesToMdast(cell.content),
            })),
          })),
        });
        break;
      case "page_block":
        out.push({
          type: "code",
          lang: "tome-block",
          value: serializePageBlockInner(block.componentId, block.data),
        });
        break;
      case "html":
        out.push({ type: "html", value: block.value });
        break;
      default: {
        const _exhaustive: never = block;
        return _exhaustive;
      }
    }
  }
  return out;
}

function listItemToMdast(item: NodeBodyListItem): ListItem {
  return {
    type: "listItem",
    spread: false,
    checked: item.checked,
    children: blocksToMdast(item.content.length > 0 ? item.content : [{ type: "paragraph", content: [] }]),
  };
}

/** Semantic document → Extended Markdown. Browser-safe (no SQLite). */
export function documentToStorageBody(document: NodeBodyDocument): string {
  const root: Root = { type: "root", children: blocksToMdast(document.content) };
  const file = unified()
    .use(remarkGfm)
    .use(wikiLinkToMarkdownPlugin)
    .use(remarkStringify, { bullet: "-", emphasis: "*", fences: true, rule: "-" })
    .stringify(root);
  return file.endsWith("\n") ? file : `${file}\n`;
}

export function titleMapForNodeIds(
  db: RelationshipReadStore,
  ids: readonly string[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const id of ids) {
    const node = db.getNode(id);
    const title =
      typeof node?.properties.title === "string" ? node.properties.title.trim() : "";
    map.set(id, title || "Untitled");
  }
  return map;
}

/** Storage markdown → structured document with resolved titles. */
export function storageBodyToDocument(
  db: RelationshipReadStore,
  body: string,
): NodeBodyDocument {
  const parsed = parseStorageBody(body);
  const titles = titleMapForNodeIds(db, collectDynamicLinkIds(parsed));
  return assignDynamicLinkTitles(parsed, (id) => titles.get(id) ?? "Untitled");
}

export async function attachPageBlockEditorHtml(
  document: NodeBodyDocument,
  renderBlock: (componentId: string, data: unknown) => string | Promise<string>,
): Promise<NodeBodyDocument> {
  const rendered = new Map<string, string>();
  const blocks: Array<{ componentId: string; data: unknown; key: string }> = [];
  let index = 0;
  const keyed = mapPageBlocks(document, (block) => {
    const key = String(index);
    index += 1;
    blocks.push({ componentId: block.componentId, data: block.data, key });
    return { ...block, editorHtml: key };
  });
  for (const block of blocks) {
    rendered.set(block.key, (await renderBlock(block.componentId, block.data)).trim());
  }
  return mapPageBlocks(keyed, (block) => ({
    ...block,
    editorHtml: rendered.get(block.editorHtml ?? "") ?? "",
  }));
}
