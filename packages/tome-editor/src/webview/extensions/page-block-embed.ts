import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import { $nodeSchema, $remark, $view } from "@milkdown/kit/utils";
import type { Node as MdastNode, Root } from "mdast";

const PAGE_BLOCK_COMMENT_RE = /^<!-- tome-page-block /;

interface TomePageBlockMdastNode extends MdastNode {
  type: "tomePageBlock";
  comment: string;
  html: string;
}

function isHtmlMdastNode(node: MdastNode): node is MdastNode & { value: string } {
  return node.type === "html" && "value" in node && typeof node.value === "string";
}

function paragraphSingleHtml(node: MdastNode): string | null {
  if (node.type !== "paragraph" || !("children" in node) || !Array.isArray(node.children)) {
    return null;
  }
  if (node.children.length !== 1) return null;
  const child = node.children[0];
  if (!child || !isHtmlMdastNode(child)) return null;
  return child.value.trim();
}

function remarkPageBlockEmbed() {
  return (tree: Root) => {
    const nextChildren: MdastNode[] = [];

    for (let index = 0; index < tree.children.length; index += 1) {
      const node = tree.children[index]!;
      const next = tree.children[index + 1];

      const comment =
        (isHtmlMdastNode(node) ? node.value.trim() : null) ?? paragraphSingleHtml(node);
      const htmlValue =
        next &&
        ((isHtmlMdastNode(next) ? next.value.trim() : null) ?? paragraphSingleHtml(next));

      if (comment && PAGE_BLOCK_COMMENT_RE.test(comment) && htmlValue && next) {
        const embed: TomePageBlockMdastNode = {
          type: "tomePageBlock",
          comment,
          html: htmlValue,
        };
        nextChildren.push(embed);
        index += 1;
        continue;
      }

      nextChildren.push(node);
    }

    tree.children = nextChildren as Root["children"];
  };
}

export const remarkPageBlockEmbedPlugin = $remark(
  "remarkPageBlockEmbed",
  () => () => remarkPageBlockEmbed(),
);

export const pageBlockEmbedSchema = $nodeSchema("tome_page_block", () => ({
  group: "block",
  atom: true,
  selectable: true,
  isolating: true,
  attrs: {
    comment: { default: "", validate: "string" },
    html: { default: "", validate: "string" },
  },
  parseDOM: [
    {
      tag: 'div[data-type="tome-page-block"]',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return false;
        const htmlHost = dom.querySelector('[data-type="tome-page-block-html"]');
        return {
          comment: dom.getAttribute("data-comment") ?? "",
          html: htmlHost?.innerHTML ?? "",
        };
      },
    },
  ],
  toDOM: (node) => [
    "div",
    {
      "data-type": "tome-page-block",
      "data-comment": node.attrs.comment,
      contenteditable: "false",
    },
  ],
  parseMarkdown: {
    match: ({ type }) => type === "tomePageBlock",
    runner: (state, node, type) => {
      const embed = node as unknown as TomePageBlockMdastNode;
      state.addNode(type, {
        comment: embed.comment ?? "",
        html: embed.html ?? "",
      });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "tome_page_block",
    runner: (state, node) => {
      state.addNode("html", undefined, node.attrs.comment);
      state.addNode("html", undefined, node.attrs.html);
    },
  },
}));

export const pageBlockEmbedView = $view(pageBlockEmbedSchema.node, () => (node) => {
  const dom = document.createElement("div");
  dom.className = "tome-page-block-embed";
  dom.dataset.type = "tome-page-block";
  dom.dataset.comment = node.attrs.comment;
  dom.contentEditable = "false";

  const htmlHost = document.createElement("div");
  htmlHost.dataset.type = "tome-page-block-html";
  htmlHost.innerHTML = node.attrs.html;
  dom.appendChild(htmlHost);

  return {
    dom,
    ignoreMutation: () => true,
    stopEvent: () => true,
  };
});

export const pageBlockEmbed: MilkdownPlugin[] = [
  ...remarkPageBlockEmbedPlugin,
  ...pageBlockEmbedSchema,
  pageBlockEmbedView,
];
