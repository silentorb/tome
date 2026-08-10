import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import { $nodeSchema, $remark, $view } from "@milkdown/kit/utils";
import type { Node as MdastNode, Root as MdastRoot } from "mdast";
import { createElement, type ReactNode } from "react";
import { createRoot, type Root as ReactRoot } from "react-dom/client";
import {
  formatPageBlockEmbedComment,
  parsePageBlockPayload,
  type PageBlockPayload,
} from "tome-interfaces/page-block";
import type { EditorPageBlockProps } from "tome-interfaces/page-block/editor";
import { destroySchemaDiagramPanZoom, scheduleSchemaDiagramViewportInit } from "./schema-diagram-viewport";
import {
  closePageBlockToolPanel,
  invokePageBlockExtension,
  openPageBlockToolPanel,
  resolveInteractivePageBlockMount,
} from "./page-block-registry";

const PAGE_BLOCK_COMMENT_RE = /^<!-- tome-page-block /;

interface TomePageBlockMdastNode extends MdastNode {
  type: "tomePageBlock";
  comment: string;
  html: string;
}

function isHtmlMdastNode(node: MdastNode): node is MdastNode & { value: string } {
  return node.type === "html" && "value" in node && typeof node.value === "string";
}

function paragraphSingleHtml(node: MdastNode): string | null {
  if (node.type !== "paragraph" || !("children" in node) || !Array.isArray(node.children)) {
    return null;
  }
  if (node.children.length !== 1) return null;
  const child = node.children[0];
  if (!child || !isHtmlMdastNode(child)) return null;
  return child.value.trim();
}

function remarkPageBlockEmbed() {
  return (tree: MdastRoot) => {
    const nextChildren: MdastNode[] = [];

    for (let index = 0; index < tree.children.length; index += 1) {
      const node = tree.children[index]!;
      const next = tree.children[index + 1];

      const comment =
        (isHtmlMdastNode(node) ? node.value.trim() : null) ?? paragraphSingleHtml(node);
      const htmlValue =
        next &&
        ((isHtmlMdastNode(next) ? next.value.trim() : null) ?? paragraphSingleHtml(next));

      if (comment && PAGE_BLOCK_COMMENT_RE.test(comment) && htmlValue && next) {
        const embed: TomePageBlockMdastNode = {
          type: "tomePageBlock",
          comment,
          html: htmlValue,
        };
        nextChildren.push(embed);
        index += 1;
        continue;
      }

      nextChildren.push(node);
    }

    tree.children = nextChildren as MdastRoot["children"];
  };
}

export const remarkPageBlockEmbedPlugin = $remark(
  "remarkPageBlockEmbed",
  () => () => remarkPageBlockEmbed(),
);

export const pageBlockEmbedSchema = $nodeSchema("tome_page_block", () => ({
  group: "block",
  atom: true,
  selectable: true,
  isolating: true,
  attrs: {
    comment: { default: "", validate: "string" },
    html: { default: "", validate: "string" },
  },
  parseDOM: [
    {
      tag: 'div[data-type="tome-page-block"]',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return false;
        const htmlHost = dom.querySelector('[data-type="tome-page-block-html"]');
        return {
          comment: dom.getAttribute("data-comment") ?? "",
          html: htmlHost?.innerHTML ?? "",
        };
      },
    },
  ],
  toDOM: (node) => [
    "div",
    {
      "data-type": "tome-page-block",
      "data-comment": node.attrs.comment,
      contenteditable: "false",
    },
  ],
  parseMarkdown: {
    match: ({ type }) => type === "tomePageBlock",
    runner: (state, node, type) => {
      const embed = node as unknown as TomePageBlockMdastNode;
      state.addNode(type, {
        comment: embed.comment ?? "",
        html: embed.html ?? "",
      });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "tome_page_block",
    runner: (state, node) => {
      state.addNode("html", undefined, node.attrs.comment);
      state.addNode("html", undefined, node.attrs.html);
    },
  },
}));

function payloadFromComment(comment: string): PageBlockPayload | null {
  const match = /^<!-- tome-page-block (\{[\s\S]*\}) -->$/.exec(comment.trim());
  if (!match) return null;
  return parsePageBlockPayload(match[1]!);
}

/** Mutable page context set by TomeEditor before Crepe create. */
let pageBlockEmbedNodeId = "";

export function setPageBlockEmbedNodeId(nodeId: string): void {
  pageBlockEmbedNodeId = nodeId;
}

export const pageBlockEmbedView = $view(pageBlockEmbedSchema.node, () => (node, view, getPos) => {
  const dom = document.createElement("div");
  dom.className = "tome-page-block-embed";
  dom.dataset.type = "tome-page-block";
  dom.dataset.comment = node.attrs.comment;
  dom.contentEditable = "false";

  const reactHost = document.createElement("div");
  reactHost.dataset.type = "tome-page-block-react";
  dom.appendChild(reactHost);

  const htmlHost = document.createElement("div");
  htmlHost.dataset.type = "tome-page-block-html";
  htmlHost.innerHTML = node.attrs.html;
  dom.appendChild(htmlHost);

  let root: ReactRoot | null = null;
  let currentComment = node.attrs.comment as string;
  let currentHtml = node.attrs.html as string;

  const renderHtmlFallback = (html: string) => {
    root?.unmount();
    root = null;
    reactHost.replaceChildren();
    htmlHost.hidden = false;
    htmlHost.innerHTML = html;
    scheduleSchemaDiagramViewportInit(htmlHost);
  };

  const renderInteractiveUnavailable = (label: string, error: string) => {
    destroySchemaDiagramPanZoom(htmlHost);
    root?.unmount();
    root = null;
    reactHost.replaceChildren();
    htmlHost.hidden = false;
    const safeLabel = label.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const safeError = error.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    htmlHost.innerHTML =
      `<figure class="tome-page-block-interactive-error" data-tome-interactive-error="1">` +
      `<p><strong>${safeLabel} failed to load</strong></p>` +
      `<pre class="tome-page-block-interactive-error-detail" tabindex="0">${safeError}</pre>` +
      `<p>This block requires its interactive editor bundle. Static HTML is not shown so a broken load is obvious.</p>` +
      `</figure>`;
  };

  const renderInteractive = (payload: PageBlockPayload) => {
    const mount = resolveInteractivePageBlockMount(payload.componentId);
    if (mount.kind === "interactive-unavailable") {
      renderInteractiveUnavailable(mount.component.label, mount.error);
      return;
    }
    if (mount.kind !== "interactive") {
      renderHtmlFallback(currentHtml);
      return;
    }
    const { registration, component: publicComponent } = mount;
    if (!registration.Component) {
      renderInteractiveUnavailable(
        publicComponent.label,
        "Interactive registration is missing a Component export.",
      );
      return;
    }

    destroySchemaDiagramPanZoom(htmlHost);
    htmlHost.hidden = true;
    htmlHost.replaceChildren();
    root ??= createRoot(reactHost);

    const props: EditorPageBlockProps = {
      ctx: {
        component: {
          id: publicComponent.id,
          extensionId: publicComponent.extensionId,
          implementationId: publicComponent.implementationId,
          label: publicComponent.label,
          params: {},
        },
        nodeId: pageBlockEmbedNodeId,
        invoke: (input) =>
          invokePageBlockExtension(payload.componentId, input, pageBlockEmbedNodeId),
        openToolPanel: openPageBlockToolPanel,
        closeToolPanel: closePageBlockToolPanel,
      },
      blockData: payload.data,
      readOnly: !view.editable,
      onBlockDataChange(data) {
        const nextComment = formatPageBlockEmbedComment({
          componentId: payload.componentId,
          data,
        });
        let pos = typeof getPos === "function" ? getPos() : undefined;
        if (typeof pos !== "number") {
          // Fallback when getPos is briefly unavailable (e.g. mid-update).
          view.state.doc.descendants((node, nodePos) => {
            if (node.type.name === "tome_page_block" && node.attrs.comment === currentComment) {
              pos = nodePos;
              return false;
            }
          });
        }
        if (typeof pos !== "number") return;
        const existing = view.state.doc.nodeAt(pos);
        const tr = view.state.tr.setNodeMarkup(pos, undefined, {
          comment: nextComment,
          html: existing?.attrs.html ?? currentHtml,
        });
        // Keep local mirror in sync before update() so remount does not race.
        currentComment = nextComment;
        dom.dataset.comment = nextComment;
        view.dispatch(tr);
      },
    };

    const Component = registration.Component as (p: EditorPageBlockProps) => ReactNode;
    root.render(createElement(Component, props));
  };

  const remount = (comment: string, html: string) => {
    currentComment = comment;
    currentHtml = html;
    dom.dataset.comment = comment;
    const payload = payloadFromComment(comment);
    if (!payload) {
      renderHtmlFallback(html);
      return;
    }
    const mount = resolveInteractivePageBlockMount(payload.componentId);
    if (mount.kind === "interactive" || mount.kind === "interactive-unavailable") {
      renderInteractive(payload);
      return;
    }
    renderHtmlFallback(html);
  };

  remount(node.attrs.comment, node.attrs.html);

  return {
    dom,
    update(updated) {
      if (updated.type.name !== "tome_page_block") return false;
      if (updated.attrs.comment === currentComment && updated.attrs.html === currentHtml) {
        return true;
      }
      remount(updated.attrs.comment, updated.attrs.html);
      return true;
    },
    ignoreMutation: () => {
      // Fully controlled atom: React owns the DOM inside the node view.
      return true;
    },
    stopEvent: (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return true;
      // Let React handle events inside the interactive host; stop ProseMirror from taking them.
      return reactHost.contains(target);
    },
    destroy() {
      destroySchemaDiagramPanZoom(htmlHost);
      root?.unmount();
      root = null;
    },
  };
});

export const pageBlockEmbed: MilkdownPlugin[] = [
  ...remarkPageBlockEmbedPlugin,
  ...pageBlockEmbedSchema,
  pageBlockEmbedView,
];
