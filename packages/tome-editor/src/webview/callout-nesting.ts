import type { Ctx } from "@milkdown/kit/ctx";
import type { Node as ProseNode, NodeType, Schema, Slice } from "@milkdown/prose/model";
import type { ResolvedPos } from "@milkdown/prose/model";
import type { EditorState } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { blockquoteSchema, paragraphSchema } from "@milkdown/kit/preset/commonmark";
import { DEFAULT_CALLOUT_PREFIX } from "tome-db/callout";
import { isCalloutBlockquoteNode } from "./callout-decoration";

/** Innermost blockquote ancestor depth, or -1 when not inside a blockquote. */
export function findBlockquoteDepth($from: ResolvedPos): number {
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === "blockquote") return depth;
  }
  return -1;
}

/** Whether the selection sits inside a callout blockquote (any ancestor). */
export function selectionInsideCallout(state: EditorState, view?: EditorView): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
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
  blockquoteType: NodeType,
  paragraphType: NodeType,
): ProseNode {
  const paragraph = paragraphType.create(null, schema.text(DEFAULT_CALLOUT_PREFIX));
  return blockquoteType.create(null, paragraph);
}

export function calloutBlockquoteTypes(ctx: Ctx): {
  blockquoteType: NodeType;
  paragraphType: NodeType;
} {
  return {
    blockquoteType: blockquoteSchema.type(ctx),
    paragraphType: paragraphSchema.type(ctx),
  };
}

/** Caret position immediately after the default emoji prefix in a callout blockquote node. */
export function caretAfterCalloutPrefix(blockquotePos: number): number {
  return blockquotePos + 1 + 1 + DEFAULT_CALLOUT_PREFIX.length;
}

/** Whether a pasted slice contains a top-level callout blockquote. */
export function sliceContainsCalloutBlockquote(slice: Slice): boolean {
  let found = false;
  slice.content.forEach((node) => {
    if (node.type.name === "blockquote" && isCalloutBlockquoteNode(node)) {
      found = true;
    }
  });
  return found;
}
