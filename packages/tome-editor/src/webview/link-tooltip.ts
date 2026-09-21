import { isDynamicEditorHref } from "tome-flatfile/dynamic-node-links";
import { resolveMarkdownHrefTarget } from "tome-flatfile/markdown-links";
import { TooltipProvider } from "@milkdown/kit/plugin/tooltip";
import type { Mark, Node as ProseNode } from "@milkdown/prose/model";
import { TextSelection } from "@milkdown/prose/state";
import { posToDOMRect } from "@milkdown/prose";
import type { EditorView } from "@milkdown/prose/view";
import { convertStaticNodeLinkToDynamic } from "./dynamic-node-link-convert";
import { createNodeLinkIconElement } from "./node-link-icon";

const HOVER_DELAY_MS = 50;

const COPY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="none"><path d="M360-240q-33 0-56.5-23.5T280-320v-480q0-33 23.5-56.5T360-880h360q33 0 56.5 23.5T800-800v480q0 33-23.5 56.5T720-240H360Zm0-80h360v-480H360v480ZM200-80q-33 0-56.5-23.5T120-160v-560h80v560h440v80H200Zm160-240v-480 480Z"/></svg>`;
const EDIT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M14.06 9.02L14.98 9.94L5.92 19H5V18.08L14.06 9.02ZM17.66 3C17.41 3 17.15 3.1 16.96 3.29L15.13 5.12L18.88 8.87L20.71 7.04C21.1 6.65 21.1 6.02 20.71 5.63L18.37 3.29C18.17 3.09 17.92 3 17.66 3ZM14.06 6.19L3 17.25V21H6.75L17.81 9.94L14.06 6.19Z"/></svg>`;
const REMOVE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M7.30775 20.4997C6.81058 20.4997 6.385 20.3227 6.031 19.9687C5.677 19.6147 5.5 19.1892 5.5 18.692V5.99973H5.25C5.0375 5.99973 4.85942 5.92782 4.71575 5.78398C4.57192 5.64015 4.5 5.46198 4.5 5.24948C4.5 5.03682 4.57192 4.85873 4.71575 4.71523C4.85942 4.57157 5.0375 4.49973 5.25 4.49973H9C9 4.2549 9.08625 4.04624 9.25875 3.87374C9.43108 3.7014 9.63967 3.61523 9.8845 3.61523H14.1155C14.3603 3.61523 14.5689 3.7014 14.7413 3.87374C14.9138 4.04624 15 4.2549 15 4.49973H18.75C18.9625 4.49973 19.1406 4.57165 19.2843 4.71548C19.4281 4.85932 19.5 5.03748 19.5 5.24998C19.5 5.46265 19.4281 5.64073 19.2843 5.78423C19.1406 5.9279 18.9625 5.99973 18.75 5.99973H18.5V18.692C18.5 19.1892 18.323 19.6147 17.969 19.9687C17.615 20.3227 17.1894 20.4997 16.6923 20.4997H7.30775ZM17 5.99973H7V18.692C7 18.7818 7.02883 18.8556 7.0865 18.9132C7.14417 18.9709 7.21792 18.9997 7.30775 18.9997H16.6923C16.7821 18.9997 16.8558 18.9709 16.9135 18.9132C16.9712 18.8556 17 18.7818 17 18.692V5.99973ZM10.1543 16.9997C10.3668 16.9997 10.5448 16.9279 10.6885 16.7842C10.832 16.6404 10.9037 16.4622 10.9037 16.2497V8.74973C10.9037 8.53723 10.8318 8.35907 10.688 8.21523C10.5443 8.07157 10.3662 7.99973 10.1535 7.99973C9.941 7.99973 9.76292 8.07157 9.61925 8.21523C9.47575 8.35907 9.404 8.53723 9.404 8.74973V16.2497C9.404 16.4622 9.47583 16.6404 9.6195 16.7842C9.76333 16.9279 9.94158 16.9997 10.1543 16.9997ZM13.8465 16.9997C14.059 16.9997 14.2371 16.9279 14.3807 16.7842C14.5243 16.6404 14.596 16.4622 14.596 16.2497V8.74973C14.596 8.53723 14.5242 8.35907 14.3805 8.21523C14.2367 8.07157 14.0584 7.99973 13.8458 7.99973C13.6333 7.99973 13.4552 8.07157 13.3115 8.21523C13.168 8.35907 13.0962 8.53723 13.0962 8.74973V16.2497C13.0962 16.4622 13.1682 16.6404 13.312 16.7842C13.4557 16.9279 13.6338 16.9997 13.8465 16.9997Z"/></svg>`;
const CONFIRM_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9.00012 16.1998L5.50012 12.6998C5.11012 12.3098 4.49012 12.3098 4.10012 12.6998C3.71012 13.0898 3.71012 13.7098 4.10012 14.0998L8.29012 18.2898C8.68012 18.6798 9.31012 18.6798 9.70012 18.2898L20.3001 7.69982C20.6901 7.30982 20.6901 6.68982 20.3001 6.29982C19.9101 5.90982 19.2901 5.90982 18.9001 6.29982L9.00012 16.1998Z" fill="currentColor"/></svg>`;

export type LinkTooltipResolveTitle = (nodeId: string) => Promise<string>;

export interface LinkTooltipOptions {
  resolveTitle: LinkTooltipResolveTitle;
}

export type LinkRange = {
  from: number;
  to: number;
  href: string;
  mark: Mark;
};

function linkMarkOnNode(node: ProseNode | null): Mark | null {
  if (!node?.isText) return null;
  return node.marks.find((m) => m.type.name === "link") ?? null;
}

function textNodeStartAt(doc: ProseNode, pos: number, blockStart: number, blockEnd: number): number | null {
  let start: number | null = null;
  doc.nodesBetween(blockStart, blockEnd, (n, p) => {
    if (n.isText && p <= pos && p + n.nodeSize > pos) {
      start = p;
      return false;
    }
  });
  return start;
}

/** Expand to the full contiguous link mark range sharing the same href. */
export function findLinkMarkRange(doc: ProseNode, pos: number): LinkRange | null {
  if (pos < 0 || pos > doc.content.size) return null;
  const atNode = doc.nodeAt(pos);
  const atMark = linkMarkOnNode(atNode);
  if (!atNode?.isText || !atMark || typeof atMark.attrs.href !== "string") return null;

  const targetHref = atMark.attrs.href;
  const linkType = atMark.type;
  const $pos = doc.resolve(pos);
  const blockStart = $pos.start();
  const blockEnd = $pos.end();

  let start = textNodeStartAt(doc, pos, blockStart, blockEnd);
  if (start == null) return null;
  let end = start + (doc.nodeAt(start)?.nodeSize ?? 0);

  for (;;) {
    if (start <= blockStart) break;
    const leftStart = textNodeStartAt(doc, start - 1, blockStart, start);
    if (leftStart == null) break;
    const leftNode = doc.nodeAt(leftStart);
    const leftMark = leftNode?.marks.find(
      (m) => m.type === linkType && m.attrs.href === targetHref,
    );
    if (!leftNode?.isText || !leftMark) break;
    start = leftStart;
  }

  for (;;) {
    if (end >= blockEnd) break;
    const rightNode = doc.nodeAt(end);
    const rightMark = rightNode?.marks.find(
      (m) => m.type === linkType && m.attrs.href === targetHref,
    );
    if (!rightNode?.isText || !rightMark) break;
    end += rightNode.nodeSize;
  }

  const finalMark = linkMarkOnNode(doc.nodeAt(start)) ?? atMark;
  return { from: start, to: end, href: targetHref, mark: finalMark };
}

function linkAtCoords(view: EditorView, event: MouseEvent): LinkRange | null {
  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!coords) return null;
  return findLinkMarkRange(view.state.doc, coords.pos);
}

function isStaticNodeLink(href: string): boolean {
  return Boolean(resolveMarkdownHrefTarget(href)) && !isDynamicEditorHref(href);
}

function createIconButton(className: string, iconHtml: string, label: string): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `tome-link-tooltip-button ${className}`;
  btn.setAttribute("aria-label", label);
  btn.title = label;
  btn.innerHTML = iconHtml;
  return btn;
}

export type LinkTooltipHandle = {
  dispose: () => void;
  /** Open preview for a known range (tests / programmatic callers). */
  showPreview: (range: LinkRange) => void;
};

/**
 * Install Tome-owned body link tooltip (preview + edit + convert).
 */
export function installLinkTooltip(
  view: EditorView,
  root: HTMLElement,
  options: LinkTooltipOptions,
): LinkTooltipHandle {
  const content = document.createElement("div");
  content.className = "tome-link-tooltip";
  content.dataset.show = "false";

  const provider = new TooltipProvider({
    content,
    debounce: 0,
    shouldShow: () => false,
    root,
  });
  provider.update(view);

  let mode: "preview" | "edit" = "preview";
  let active: LinkRange | null = null;
  let hoveringTooltip = false;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let moveTimer: ReturnType<typeof setTimeout> | null = null;
  let converting = false;

  const clearHideTimer = () => {
    if (hideTimer != null) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  };

  const hide = () => {
    if (hoveringTooltip && mode === "preview") return;
    clearHideTimer();
    provider.hide();
    mode = "preview";
    active = null;
    content.replaceChildren();
  };

  const scheduleHide = () => {
    clearHideTimer();
    hideTimer = setTimeout(() => {
      hideTimer = null;
      hide();
    }, HOVER_DELAY_MS);
  };

  content.addEventListener("mouseenter", () => {
    hoveringTooltip = true;
    clearHideTimer();
  });
  content.addEventListener("mouseleave", () => {
    hoveringTooltip = false;
    if (mode === "preview") scheduleHide();
  });

  const copyHref = async (href: string) => {
    try {
      await navigator.clipboard.writeText(href);
    } catch {
      // Ignore clipboard failures (permissions / non-secure context).
    }
  };

  const removeLink = (range: LinkRange) => {
    const linkType = view.state.schema.marks.link;
    if (!linkType) return;
    view.dispatch(view.state.tr.removeMark(range.from, range.to, linkType));
    hoveringTooltip = false;
    hide();
  };

  const applyHref = (range: LinkRange, href: string) => {
    const linkType = view.state.schema.marks.link;
    if (!linkType) return;
    const next = href.trim();
    if (!next) return;
    const mark = linkType.create({ href: next, title: null });
    let tr = view.state.tr.removeMark(range.from, range.to, linkType);
    tr = tr.addMark(range.from, range.to, mark);
    view.dispatch(tr);
    hoveringTooltip = false;
    hide();
  };

  const showEdit = (range: LinkRange) => {
    mode = "edit";
    active = range;
    clearHideTimer();
    content.replaceChildren();

    const row = document.createElement("div");
    row.className = "tome-link-tooltip-edit";

    const input = document.createElement("input");
    input.className = "tome-link-tooltip-input";
    input.type = "text";
    input.placeholder = "Paste link…";
    input.value = range.href;

    const confirm = createIconButton("tome-link-tooltip-confirm", CONFIRM_ICON, "Confirm");
    confirm.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (active) applyHref(active, input.value);
    });

    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        if (active) applyHref(active, input.value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        hoveringTooltip = false;
        hide();
        view.focus();
      }
    });

    row.append(input, confirm);
    content.append(row);

    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, range.from, range.to)),
    );
    provider.show({ getBoundingClientRect: () => posToDOMRect(view, range.from, range.to) }, view);
    requestAnimationFrame(() => input.focus());
  };

  const showPreview = (range: LinkRange) => {
    mode = "preview";
    active = range;
    clearHideTimer();
    content.replaceChildren();

    const row = document.createElement("div");
    row.className = "tome-link-tooltip-preview";

    const copyBtn = createIconButton("tome-link-tooltip-copy", COPY_ICON, "Copy link");
    copyBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void copyHref(range.href);
    });

    const display = document.createElement("a");
    display.className = "tome-link-tooltip-display";
    display.href = range.href;
    display.target = "_blank";
    display.rel = "noopener noreferrer";
    display.textContent = range.href;
    display.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void copyHref(range.href);
    });

    const editBtn = createIconButton("tome-link-tooltip-edit-btn", EDIT_ICON, "Edit link");
    editBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (active) showEdit(active);
    });

    const removeBtn = createIconButton("tome-link-tooltip-remove", REMOVE_ICON, "Remove link");
    removeBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (active) removeLink(active);
    });

    row.append(copyBtn, display, editBtn, removeBtn);

    if (isStaticNodeLink(range.href)) {
      const convertBtn = document.createElement("button");
      convertBtn.type = "button";
      convertBtn.className = "tome-link-tooltip-button tome-link-tooltip-convert";
      convertBtn.setAttribute("aria-label", "Use dynamic title");
      convertBtn.title = "Use dynamic title";
      const icon = createNodeLinkIconElement();
      convertBtn.append(icon);
      convertBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!active || converting) return;
        const target = active;
        const nodeId = resolveMarkdownHrefTarget(target.href);
        if (!nodeId) return;
        converting = true;
        void options
          .resolveTitle(nodeId)
          .then((title) => {
            convertStaticNodeLinkToDynamic(view, target.from, target.to, title || "Untitled");
            hoveringTooltip = false;
            hide();
          })
          .catch(() => {
            // Keep tooltip open on failure.
          })
          .finally(() => {
            converting = false;
          });
      });
      row.append(convertBtn);
    }

    content.append(row);
    provider.show({ getBoundingClientRect: () => posToDOMRect(view, range.from, range.to) }, view);
  };

  const onMouseMove = (event: MouseEvent) => {
    if (mode === "edit") return;
    if (!view.hasFocus() && !hoveringTooltip) return;

    if (moveTimer != null) clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      moveTimer = null;
      if (mode === "edit") return;
      const range = linkAtCoords(view, event);
      if (range) {
        if (
          active &&
          active.from === range.from &&
          active.to === range.to &&
          active.href === range.href &&
          content.dataset.show === "true"
        ) {
          return;
        }
        showPreview(range);
        return;
      }
      if (!hoveringTooltip) scheduleHide();
    }, HOVER_DELAY_MS);
  };

  const onMouseLeave = () => {
    if (mode === "edit") return;
    scheduleHide();
  };

  view.dom.addEventListener("mousemove", onMouseMove);
  view.dom.addEventListener("mouseleave", onMouseLeave);

  return {
    showPreview,
    dispose: () => {
      if (moveTimer != null) clearTimeout(moveTimer);
      clearHideTimer();
      view.dom.removeEventListener("mousemove", onMouseMove);
      view.dom.removeEventListener("mouseleave", onMouseLeave);
      provider.destroy();
      content.remove();
    },
  };
}
