import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import { $nodeSchema, $remark } from "@milkdown/kit/utils";
import type { Node as MdastNode, Root as MdastRoot } from "mdast";
import { extractLeadingTaskMarker, taskMarkerPrefix } from "tome-flatfile/task";

interface TomeTaskMdast extends MdastNode {
  type: "tomeTask";
  checked: boolean;
  children: MdastNode[];
}

function paragraphLeadText(node: MdastNode): string {
  if (node.type !== "paragraph" || !("children" in node) || !Array.isArray(node.children)) return "";
  return node.children
    .map((child) => (child && typeof child === "object" && "value" in child ? String(child.value ?? "") : ""))
    .join("");
}

/** Strip leading checkbox marker from the first paragraph's text nodes. */
function stripLeadingTaskMarkerFromMdast(children: MdastNode[]): MdastNode[] {
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
      const marker = extractLeadingTaskMarker(trimmedStart);
      if (marker) {
        const without = trimmedStart.slice(marker.raw.length);
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

function convertTaskNodes(nodes: MdastNode[]): MdastNode[] {
  return nodes.map((node) => {
    const children =
      "children" in node && Array.isArray(node.children)
        ? convertTaskNodes(node.children as MdastNode[])
        : null;
    if (node.type === "blockquote" && children) {
      const marker = extractLeadingTaskMarker(paragraphLeadText(children[0] as MdastNode));
      if (marker) {
        const task: TomeTaskMdast = {
          type: "tomeTask",
          checked: marker.checked,
          children: stripLeadingTaskMarkerFromMdast(children),
        };
        return task;
      }
    }
    if (children) return { ...node, children } as MdastNode;
    return node;
  });
}

function remarkTasks() {
  return (tree: MdastRoot) => {
    tree.children = convertTaskNodes(tree.children) as MdastRoot["children"];
  };
}

export const remarkTaskPlugin = $remark("remarkTask", () => () => remarkTasks());

export const taskSchema = $nodeSchema("task", () => ({
  content: "block+",
  group: "block",
  defining: true,
  attrs: {
    checked: { default: false, validate: "boolean" },
  },
  parseDOM: [
    {
      tag: "blockquote.tome-task",
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return false;
        return { checked: dom.dataset.checked === "true" };
      },
      contentElement: (dom) => {
        if (!(dom instanceof HTMLElement)) return dom as HTMLElement;
        return (
          (dom.querySelector(":scope > .tome-task-body") as HTMLElement | null) ?? dom
        );
      },
    },
  ],
  toDOM: (node) => [
    "blockquote",
    {
      class: "tome-task",
      "data-checked": node.attrs.checked ? "true" : "false",
    },
    [
      "span",
      {
        class: "tome-task-checkbox",
        contenteditable: "false",
        "aria-checked": node.attrs.checked ? "true" : "false",
      },
      node.attrs.checked ? "☑" : "☐",
    ],
    ["div", { class: "tome-task-body" }, 0],
  ],
  parseMarkdown: {
    match: ({ type }) => type === "tomeTask",
    runner: (state, node, type) => {
      const task = node as unknown as TomeTaskMdast;
      state.openNode(type, { checked: Boolean(task.checked) });
      state.next(task.children as unknown as Parameters<typeof state.next>[0]);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "task",
    runner: (state, node) => {
      const prefix = taskMarkerPrefix(Boolean(node.attrs.checked));
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

export const taskPlugin: MilkdownPlugin[] = [...remarkTaskPlugin, ...taskSchema];
