import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import { $nodeSchema, $remark } from "@milkdown/kit/utils";
import type { Node as MdastNode, Root as MdastRoot } from "mdast";
import {
  DEFAULT_CALLOUT_EMOJI,
  extractLeadingCalloutEmoji,
} from "tome-flatfile/callout";

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

/** Strip leading callout emoji (+ following space) from the first paragraph's text nodes. */
function stripLeadingEmojiFromMdast(children: MdastNode[], emoji: string): MdastNode[] {
  if (children.length === 0) return children;
  const [first, ...rest] = children;
  if (!first || first.type !== "paragraph" || !("children" in first) || !Array.isArray(first.children)) {
    return children;
  }
  let stripped = false;
  const nextInlines: MdastNode[] = [];
  for (const child of first.children as MdastNode[]) {
    if (
      !stripped &&
      child &&
      typeof child === "object" &&
      child.type === "text" &&
      "value" in child
    ) {
      const value = String(child.value ?? "");
      const trimmedStart = value.trimStart();
      if (trimmedStart.startsWith(emoji)) {
        const without = trimmedStart.slice(emoji.length).replace(/^\s+/, "");
        stripped = true;
        if (without) nextInlines.push({ ...child, value: without } as MdastNode);
        continue;
      }
    }
    nextInlines.push(child);
  }
  if (!stripped) return children;
  return [{ ...first, children: nextInlines } as MdastNode, ...rest];
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
        const callout: TomeCalloutMdast = {
          type: "tomeCallout",
          emoji,
          children: stripLeadingEmojiFromMdast(children, emoji),
        };
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
      contentElement: (dom) => {
        if (!(dom instanceof HTMLElement)) return dom as HTMLElement;
        return (
          (dom.querySelector(":scope > .tome-callout-body") as HTMLElement | null) ?? dom
        );
      },
    },
  ],
  toDOM: (node) => [
    "blockquote",
    {
      class: "tome-callout",
      "data-emoji": node.attrs.emoji,
    },
    ["span", { class: "tome-callout-icon", contenteditable: "false" }, String(node.attrs.emoji)],
    ["div", { class: "tome-callout-body" }, 0],
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
      const emoji = String(node.attrs.emoji || DEFAULT_CALLOUT_EMOJI);
      const prefix = `${emoji} `;
      state.openNode("blockquote");
      const first = node.firstChild;
      if (first && first.type.name === "paragraph") {
        state.openNode("paragraph");
        state.addNode("text", undefined, prefix);
        if (first.content.size > 0) {
          state.next(first.content);
        }
        state.closeNode();
        for (let i = 1; i < node.childCount; i++) {
          state.next(node.child(i));
        }
      } else if (node.childCount > 0) {
        state.openNode("paragraph");
        state.addNode("text", undefined, prefix.trimEnd());
        state.closeNode();
        state.next(node.content);
      } else {
        state.openNode("paragraph");
        state.addNode("text", undefined, prefix.trimEnd());
        state.closeNode();
      }
      state.closeNode();
    },
  },
}));

export const calloutPlugin: MilkdownPlugin[] = [
  ...remarkCalloutPlugin,
  ...calloutSchema,
];
