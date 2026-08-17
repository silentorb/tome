import type { Editor } from "@milkdown/kit/core";
import { blockquoteSchema, wrapInBlockquoteInputRule } from "@milkdown/preset-commonmark";
import { wrappingInputRule } from "@milkdown/prose/inputrules";
import { $inputRule } from "@milkdown/kit/utils";

/**
 * Same `> ` wrapping rule as Milkdown commonmark, but never joins the new
 * blockquote with a preceding sibling. Neighboring quotes stay distinct.
 */
export const noJoinBlockquoteInputRule = $inputRule((ctx) =>
  wrappingInputRule(/^\s*>\s$/, blockquoteSchema.type(ctx), null, () => false),
);

/** Swap Crepe's stock joining blockquote input rule for the non-joining one. */
export async function replaceBlockquoteInputRule(editor: Editor): Promise<void> {
  await editor.remove(wrapInBlockquoteInputRule);
  editor.use(noJoinBlockquoteInputRule);
}
