import type { Ctx } from "@milkdown/kit/ctx";
import type { Node as ProseNode, NodeType, Schema, Slice } from "@milkdown/prose/model";
import type { ResolvedPos } from "@milkdown/prose/model";
import type { EditorState } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { paragraphSchema } from "@milkdown/kit/preset/commonmark";
import { DEFAULT_CALLOUT_EMOJI } from "tome-flatfile/callout";
import { calloutSchema } from "./callout-schema";
import { isCalloutBlockquoteNode } from "./callout-decoration";

function isCalloutNode(node: { type: { name: string } }): boolean {
  return node.type.name === "callout";
}

/** Innermost callout or emoji-blockquote ancestor depth, or -1. */
export function findBlockquoteDepth($from: ResolvedPos): number {
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (isCalloutNode(node) || (node.type.name === "blockquote" && isCalloutBlockquoteNode(node))) {
      return depth;
    }
  }
  return -1;
}

/** Whether the selection sits inside a callout (node or emoji blockquote). */
export function selectionInsideCallout(state: EditorState, view?: EditorView): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (isCalloutNode(node)) return true;
    if (node.type.name !== "blockquote") continue;
    if (view) {
      const dom = view.nodeDOM($from.before(depth));
      if (dom instanceof HTMLElement && dom.classList.contains("tome-callout")) {
        return true;
      }
    }
    if (isCalloutBlockquoteNode(node)) return true;
  }
  return false;
}

export function createCalloutBlockquoteNode(
  schema: Schema,
  calloutType: NodeType,
  paragraphType: NodeType,
): ProseNode {
  const paragraph = paragraphType.create(null);
  return calloutType.create({ emoji: DEFAULT_CALLOUT_EMOJI }, paragraph);
}

export function calloutBlockquoteTypes(ctx: Ctx): {
  blockquoteType: NodeType;
  paragraphType: NodeType;
} {
  return {
    blockquoteType: calloutSchema.type(ctx),
    paragraphType: paragraphSchema.type(ctx),
  };
}

/** Caret position at the start of the first paragraph inside a callout node. */
export function caretAtCalloutBodyStart(calloutPos: number): number {
  return calloutPos + 2;
}

/** @deprecated Use caretAtCalloutBodyStart — emoji is no longer in body text. */
export function caretAfterCalloutPrefix(blockquotePos: number): number {
  return caretAtCalloutBodyStart(blockquotePos);
}

/** Whether a pasted slice contains a top-level callout. */
export function sliceContainsCalloutBlockquote(slice: Slice): boolean {
  let found = false;
  slice.content.forEach((node) => {
    if (isCalloutNode(node) || (node.type.name === "blockquote" && isCalloutBlockquoteNode(node))) {
      found = true;
    }
  });
  return found;
}
