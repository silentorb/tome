import type { Node as ProseNode } from "@milkdown/prose/model";
import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/prose/view";
import {
  extractLeadingCalloutEmoji,
  hasLeadingCalloutEmoji,
} from "tome-db/callout";

export {
  DEFAULT_CALLOUT_EMOJI,
  DEFAULT_CALLOUT_PREFIX,
  extractLeadingCalloutEmoji,
  hasLeadingCalloutEmoji,
} from "tome-db/callout";

const calloutDecorationKey = new PluginKey("tome-callout-decoration");

function stripEmojis(text: string): string {
  return text
    .replace(
      /[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{1F1E0}-\u{1F1FF}\u{200D}\u{FE0F}\u{1F3FB}-\u{1F3FF}\u{E000}-\u{F8FF}]+/gu,
      "",
    )
    .replace(/\u200d/g, "")
    .replace(/\ufe0f/g, "")
    .trim();
}

export function isEmojiOnlyLine(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && stripEmojis(trimmed) === "";
}

/** Lead text of the first paragraph in a blockquote node (ProseMirror doc). */
export function blockquoteCalloutLeadText(blockquote: ProseNode): string {
  for (let i = 0; i < blockquote.childCount; i++) {
    const child = blockquote.child(i);
    if (child.type.name === "paragraph") {
      return child.textContent;
    }
  }
  return "";
}

export function isCalloutBlockquoteNode(blockquote: ProseNode): boolean {
  if (blockquote.type.name !== "blockquote") return false;
  const lead = blockquoteCalloutLeadText(blockquote);
  const firstLine = lead.split("\n")[0] ?? "";
  return hasLeadingCalloutEmoji(firstLine) || isEmojiOnlyLine(firstLine);
}

export function isCalloutBlockquote(blockquote: HTMLElement): boolean {
  const firstParagraph = blockquote.querySelector(":scope > p");
  if (!firstParagraph) return false;
  const text = firstParagraph.textContent ?? "";
  const firstLine = text.split("\n")[0] ?? "";
  return hasLeadingCalloutEmoji(firstLine) || isEmojiOnlyLine(firstLine);
}

function buildCalloutDecorations(doc: ProseNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!isCalloutBlockquoteNode(node)) return;
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, { class: "tome-callout" }),
    );
  });
  return DecorationSet.create(doc, decorations);
}

export function createCalloutDecorationPlugin(): Plugin {
  return new Plugin({
    key: calloutDecorationKey,
    state: {
      init: (_, { doc }) => buildCalloutDecorations(doc),
      apply(tr, set) {
        if (tr.docChanged) return buildCalloutDecorations(tr.doc);
        return set;
      },
    },
    props: {
      decorations(state) {
        return calloutDecorationKey.getState(state);
      },
    },
  });
}

/** First page icon from markdown: emoji-only line or callout blockquote. */
export function extractPageIconFromMarkdown(body: string): string | null {
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith(">")) {
      const emoji = extractLeadingCalloutEmoji(trimmed.slice(1));
      if (emoji) return emoji;
      continue;
    }

    if (isEmojiOnlyLine(trimmed)) return trimmed;
    break;
  }
  return null;
}

export function installCalloutDecoration(view: EditorView): void {
  const plugin = createCalloutDecorationPlugin();
  view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, plugin] }));
}
