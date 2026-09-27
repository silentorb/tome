import type { Editor } from "@milkdown/kit/core";
import { wrappingInputRule } from "@milkdown/prose/inputrules";
import { wrapIn } from "@milkdown/prose/commands";
import type { EditorView } from "@milkdown/prose/view";
import { $inputRule } from "@milkdown/kit/utils";
import { taskSchema } from "./task-schema";

/**
 * Typing `[]` or `[] ` at the start of a paragraph wraps it in a task block.
 * Never joins with a preceding sibling task.
 */
export const wrapInTaskInputRule = $inputRule((ctx) =>
  wrappingInputRule(/^\[\]\s?$/, taskSchema.type(ctx), () => ({ checked: false }), () => false),
);

/**
 * Crepe-free insert used by the input rule path and a future non-Crepe slash menu.
 * Wraps the current block in an unchecked task node.
 */
export function insertTaskBlock(view: EditorView): boolean {
  const taskType = view.state.schema.nodes.task;
  if (!taskType) return false;
  return wrapIn(taskType, { checked: false })(view.state, view.dispatch);
}

/** Register the `[]` input rule on the Milkdown editor (Crepe host only for `.use`). */
export function installTaskInputRule(editor: Editor): void {
  editor.use(wrapInTaskInputRule);
}
