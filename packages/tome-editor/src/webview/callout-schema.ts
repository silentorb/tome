import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import { $nodeSchema, $remark } from "@milkdown/kit/utils";
import type { Node as MdastNode, Root as MdastRoot } from "mdast";
import { extractLeadingCalloutEmoji } from "tome-flatfile/callout";
import { DEFAULT_CALLOUT_EMOJI } from "tome-flatfile/callout";

interface TomeCalloutMdast extends MdastNode {
  type: "tomeCallout";
  emoji: string;
  children: MdastNode[];
}

function paragraphLeadText(node: MdastNode): string {
  if (node.type !== "paragraph" || !("children" in node) || !Array.isArray(node.children)) return "";
  return node.children
    .map((child) => (child && typeof child === "object" && "value" in child ? String(child.value ?? "") : ""))
    .join("");
}

function convertCalloutNodes(nodes: MdastNode[]): MdastNode[] {
  return nodes.map((node) => {
    const children =
      "children" in node && Array.isArray(node.children)
        ? convertCalloutNodes(node.children as MdastNode[])
        : null;
    if (node.type === "blockquote" && children) {
      const emoji = extractLeadingCalloutEmoji(paragraphLeadText(children[0] as MdastNode));
      if (emoji) {
        const callout: TomeCalloutMdast = { type: "tomeCallout", emoji, children };
        return callout;
      }
      return { ...node, children } as MdastNode;
    }
    if (children) return { ...node, children } as MdastNode;
    return node;
  });
}

function remarkCallouts() {
  return (tree: MdastRoot) => {
    tree.children = convertCalloutNodes(tree.children) as MdastRoot["children"];
  };
}

export const remarkCalloutPlugin = $remark("remarkCallout", () => () => remarkCallouts());

export const calloutSchema = $nodeSchema("callout", () => ({
  content: "block+",
  group: "block",
  defining: true,
  attrs: {
    emoji: { default: DEFAULT_CALLOUT_EMOJI, validate: "string" },
  },
  parseDOM: [
    {
      tag: "blockquote.tome-callout",
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return false;
        return { emoji: dom.dataset.emoji || DEFAULT_CALLOUT_EMOJI };
      },
    },
  ],
  toDOM: (node) => [
    "blockquote",
    {
      class: "tome-callout",
      "data-emoji": node.attrs.emoji,
    },
    0,
  ],
  parseMarkdown: {
    match: ({ type }) => type === "tomeCallout",
    runner: (state, node, type) => {
      const callout = node as unknown as TomeCalloutMdast;
      state.openNode(type, { emoji: callout.emoji || DEFAULT_CALLOUT_EMOJI });
      state.next(callout.children as unknown as Parameters<typeof state.next>[0]);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "callout",
    runner: (state, node) => {
      state.openNode("blockquote").next(node.content).closeNode();
    },
  },
}));

export const calloutPlugin: MilkdownPlugin[] = [...remarkCalloutPlugin, ...calloutSchema];
