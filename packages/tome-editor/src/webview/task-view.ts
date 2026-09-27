import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import { $view } from "@milkdown/kit/utils";
import type { Node as ProseNode } from "@milkdown/prose/model";
import type { EditorView, NodeView } from "@milkdown/prose/view";
import { taskSchema } from "./task-schema";

function createTaskNodeView(
  node: ProseNode,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  const dom = document.createElement("blockquote");
  dom.className = "tome-task";
  const checked = Boolean(node.attrs.checked);
  dom.dataset.checked = checked ? "true" : "false";

  const checkbox = document.createElement("button");
  checkbox.type = "button";
  checkbox.className = "tome-task-checkbox";
  checkbox.setAttribute("role", "checkbox");
  checkbox.setAttribute("aria-checked", checked ? "true" : "false");
  checkbox.setAttribute("aria-label", checked ? "Mark task incomplete" : "Mark task complete");
  checkbox.contentEditable = "false";
  checkbox.textContent = checked ? "☑" : "☐";

  const body = document.createElement("div");
  body.className = "tome-task-body";

  dom.append(checkbox, body);

  const setChecked = (next: boolean) => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    const current = view.state.doc.nodeAt(pos);
    if (!current || current.type.name !== "task") return;
    if (Boolean(current.attrs.checked) === next) return;
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, checked: next }));
  };

  checkbox.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  checkbox.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!view.editable) return;
    setChecked(!Boolean(dom.dataset.checked === "true"));
  });

  return {
    dom,
    contentDOM: body,
    update(updated) {
      if (updated.type.name !== "task") return false;
      const nextChecked = Boolean(updated.attrs.checked);
      dom.dataset.checked = nextChecked ? "true" : "false";
      checkbox.setAttribute("aria-checked", nextChecked ? "true" : "false");
      checkbox.setAttribute(
        "aria-label",
        nextChecked ? "Mark task incomplete" : "Mark task complete",
      );
      checkbox.textContent = nextChecked ? "☑" : "☐";
      return true;
    },
    stopEvent(event) {
      const target = event.target as Node | null;
      return Boolean(target && checkbox.contains(target));
    },
    ignoreMutation(mutation) {
      if (mutation.type === "selection") return false;
      return !body.contains(mutation.target);
    },
  };
}

export const taskView = $view(taskSchema.node, () => (node, view, getPos) =>
  createTaskNodeView(node, view, getPos),
);

export const taskViewPlugin: MilkdownPlugin[] = [taskView];
