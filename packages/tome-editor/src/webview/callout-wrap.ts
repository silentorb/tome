import type { Node as ProseNode } from "@milkdown/prose/model";
import { wrapIn } from "@milkdown/prose/commands";
import { NodeSelection, TextSelection } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";
import { DEFAULT_CALLOUT_EMOJI } from "tome-flatfile/callout";
import { caretAtCalloutBodyStart } from "./callout-nesting";

export interface ActiveEditorBlock {
  pos: number;
  node: ProseNode;
}

/**
 * Block selected by the block handle (NodeSelection) or the top-level block at the caret.
 */
export function resolveActiveEditorBlock(view: EditorView): ActiveEditorBlock | null {
  const { selection } = view.state;

  if (selection instanceof NodeSelection) {
    return { pos: selection.from, node: selection.node };
  }

  if (!(selection instanceof TextSelection)) return null;

  const { $from } = selection;
  if ($from.depth < 1) return null;

  const node = $from.node(1);
  if (!node) return null;

  return { pos: $from.before(1), node };
}

/** Wrap the active block in a callout, preserving its content. */
export function wrapActiveBlockInCallout(view: EditorView): boolean {
  const calloutType = view.state.schema.nodes.callout;
  if (!calloutType) return false;

  const active = resolveActiveEditorBlock(view);
  if (!active || active.node.type.name === "callout") return false;

  const { state } = view;
  if (!(state.selection instanceof NodeSelection) || state.selection.from !== active.pos) {
    view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, active.pos)));
  }

  const wrapped = wrapIn(calloutType, { emoji: DEFAULT_CALLOUT_EMOJI })(view.state, view.dispatch);
  if (!wrapped) return false;

  const { $from } = view.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type.name === "callout") {
      const calloutPos = $from.before(depth);
      view.dispatch(
        view.state.tr.setSelection(
          TextSelection.create(view.state.doc, caretAtCalloutBodyStart(calloutPos)),
        ),
      );
      break;
    }
  }

  view.focus();
  return true;
}

/** Lift children out of the active callout block. */
export function unwrapActiveCallout(view: EditorView): boolean {
  const active = resolveActiveEditorBlock(view);
  if (!active || active.node.type.name !== "callout") return false;

  const { pos, node } = active;
  const { state, dispatch } = view;
  let tr = state.tr.replaceWith(pos, pos + node.nodeSize, node.content);
  const $pos = tr.doc.resolve(Math.min(pos + 1, tr.doc.content.size));
  tr = tr.setSelection(TextSelection.near($pos));
  dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}
