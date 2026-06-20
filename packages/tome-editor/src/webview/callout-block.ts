import type { Ctx } from "@milkdown/kit/ctx";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import {
  clearTextInCurrentBlockCommand,
  wrapInBlockTypeCommand,
} from "@milkdown/kit/preset/commonmark";
import { replaceRange } from "@milkdown/kit/utils";
import type { BlockEditFeatureConfig } from "@milkdown/crepe/feature/block-edit";
import { DEFAULT_CALLOUT_PREFIX } from "tome-db/callout";
import { TextSelection } from "@milkdown/prose/state";
import {
  calloutBlockquoteTypes,
  caretAfterCalloutPrefix,
  createCalloutBlockquoteNode,
  findBlockquoteDepth,
} from "./callout-nesting";

export const calloutIcon = `
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M12 2a7 7 0 0 1 7 7c0 2.2-1 4.2-2.6 5.5L16 17H8l-.4-2.5A7 7 0 0 1 5 9a7 7 0 0 1 7-7z" />
  </svg>
`;

function insertTopLevelCalloutBlock(ctx: Ctx): void {
  const commands = ctx.get(commandsCtx);
  const { blockquoteType } = calloutBlockquoteTypes(ctx);

  commands.call(clearTextInCurrentBlockCommand.key);
  commands.call(wrapInBlockTypeCommand.key, { nodeType: blockquoteType });

  const view = ctx.get(editorViewCtx);
  const { from, to } = view.state.selection;
  replaceRange(DEFAULT_CALLOUT_PREFIX, { from, to })(ctx);
}

function insertNestedCalloutBlock(ctx: Ctx): void {
  const view = ctx.get(editorViewCtx);
  const { state } = view;
  const { $from, from } = state.selection;
  const { blockquoteType, paragraphType } = calloutBlockquoteTypes(ctx);

  if ($from.parent.type !== paragraphType) {
    insertTopLevelCalloutBlock(ctx);
    return;
  }

  const nested = createCalloutBlockquoteNode(state.schema, blockquoteType, paragraphType);
  let tr = state.tr;
  const paragraph = $from.parent;
  const isEmpty = paragraph.textContent.length === 0;
  const atEnd = from === $from.end();

  if (isEmpty) {
    const paraPos = $from.before();
    const paraEnd = $from.after();
    tr = tr.replaceWith(paraPos, paraEnd, nested);
    tr = tr.setSelection(TextSelection.create(tr.doc, caretAfterCalloutPrefix(paraPos)));
  } else if (atEnd) {
    const insertPos = $from.after();
    tr = tr.insert(insertPos, nested);
    tr = tr.setSelection(TextSelection.create(tr.doc, caretAfterCalloutPrefix(insertPos)));
  } else {
    tr = tr.split(from);
    const splitPos = tr.selection.from;
    tr = tr.insert(splitPos, nested);
    tr = tr.setSelection(TextSelection.create(tr.doc, caretAfterCalloutPrefix(splitPos)));
  }

  view.dispatch(tr.scrollIntoView());
  view.focus();
}

/**
 * Insert a callout block. Stored as markdown blockquote for compatibility;
 * the editor renders callouts as tinted panels (see `.tome-callout` CSS).
 */
export function insertCalloutBlock(ctx: Ctx): void {
  const view = ctx.get(editorViewCtx);
  const blockquoteDepth = findBlockquoteDepth(view.state.selection.$from);
  if (blockquoteDepth >= 0) {
    insertNestedCalloutBlock(ctx);
    return;
  }
  insertTopLevelCalloutBlock(ctx);
}

export const buildCalloutSlashMenu: NonNullable<BlockEditFeatureConfig["buildMenu"]> = (
  builder,
) => {
  builder.getGroup("text").addItem("callout", {
    label: "Callout",
    icon: calloutIcon,
    onRun: (ctx) => insertCalloutBlock(ctx),
  });
};
