import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import { $view } from "@milkdown/kit/utils";
import type { Node as ProseNode } from "@milkdown/prose/model";
import type { EditorView, NodeView } from "@milkdown/prose/view";
import { DEFAULT_CALLOUT_EMOJI, extractLeadingCalloutEmoji } from "tome-flatfile/callout";
import { calloutSchema } from "./callout-schema";

/** Curated palette for the callout icon picker (no emoji-mart dependency). */
export const CALLOUT_EMOJI_PALETTE = [
  "💡",
  "⚠️",
  "✅",
  "❌",
  "📝",
  "🔥",
  "ℹ️",
  "❓",
  "💬",
  "✨",
  "⭐",
  "🎯",
  "📌",
  "🚀",
  "❗",
  "⛔",
  "🔔",
  "🧠",
  "👀",
  "🛠️",
  "📦",
  "🏆",
  "❤️",
  "📎",
] as const;

let activePickerClose: (() => void) | null = null;

function closeActivePicker(): void {
  activePickerClose?.();
  activePickerClose = null;
}

function positionPicker(panel: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const margin = 8;
  panel.style.left = "0px";
  panel.style.top = "0px";
  document.body.appendChild(panel);
  const size = panel.getBoundingClientRect();
  let left = rect.left;
  let top = rect.bottom + 4;
  if (left + size.width > window.innerWidth - margin) {
    left = window.innerWidth - size.width - margin;
  }
  if (top + size.height > window.innerHeight - margin) {
    top = rect.top - size.height - 4;
  }
  panel.style.left = `${Math.max(margin, left)}px`;
  panel.style.top = `${Math.max(margin, top)}px`;
}

function openCalloutEmojiPicker(
  anchor: HTMLElement,
  currentEmoji: string,
  onSelect: (emoji: string) => void,
): void {
  closeActivePicker();

  const panel = document.createElement("div");
  panel.className = "tome-callout-emoji-picker";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Choose callout icon");

  const grid = document.createElement("div");
  grid.className = "tome-callout-emoji-picker-grid";
  grid.setAttribute("role", "listbox");

  for (const emoji of CALLOUT_EMOJI_PALETTE) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tome-callout-emoji-picker-item";
    if (emoji === currentEmoji) button.classList.add("is-selected");
    button.setAttribute("role", "option");
    button.setAttribute("aria-label", `Use ${emoji}`);
    button.textContent = emoji;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onSelect(emoji);
      closeActivePicker();
    });
    grid.appendChild(button);
  }

  const customRow = document.createElement("div");
  customRow.className = "tome-callout-emoji-picker-custom";

  const customLabel = document.createElement("label");
  customLabel.className = "tome-callout-emoji-picker-custom-label";
  customLabel.textContent = "Custom";

  const customInput = document.createElement("input");
  customInput.type = "text";
  customInput.className = "tome-callout-emoji-picker-custom-input";
  customInput.setAttribute("aria-label", "Custom emoji");
  customInput.maxLength = 8;
  customInput.placeholder = "emoji";

  const applyCustom = () => {
    const extracted = extractLeadingCalloutEmoji(customInput.value.trim());
    if (!extracted) return;
    onSelect(extracted);
    closeActivePicker();
  };

  customInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      applyCustom();
    }
  });

  const applyButton = document.createElement("button");
  applyButton.type = "button";
  applyButton.className = "tome-callout-emoji-picker-custom-apply";
  applyButton.textContent = "Apply";
  applyButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    applyCustom();
  });

  customRow.append(customLabel, customInput, applyButton);
  panel.append(grid, customRow);
  positionPicker(panel, anchor);

  const onPointerDown = (event: MouseEvent) => {
    const target = event.target as Node;
    if (panel.contains(target) || anchor.contains(target)) return;
    closeActivePicker();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeActivePicker();
    }
  };

  window.addEventListener("mousedown", onPointerDown);
  window.addEventListener("keydown", onKeyDown, true);

  activePickerClose = () => {
    window.removeEventListener("mousedown", onPointerDown);
    window.removeEventListener("keydown", onKeyDown, true);
    panel.remove();
    activePickerClose = null;
  };
}

function createCalloutNodeView(
  node: ProseNode,
  view: EditorView,
  getPos: () => number | undefined,
): NodeView {
  const dom = document.createElement("blockquote");
  dom.className = "tome-callout";
  dom.dataset.emoji = String(node.attrs.emoji || DEFAULT_CALLOUT_EMOJI);

  const iconButton = document.createElement("button");
  iconButton.type = "button";
  iconButton.className = "tome-callout-icon";
  iconButton.setAttribute("aria-label", "Change callout icon");
  iconButton.contentEditable = "false";
  iconButton.textContent = dom.dataset.emoji;

  const body = document.createElement("div");
  body.className = "tome-callout-body";

  dom.append(iconButton, body);

  const setEmoji = (emoji: string) => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    const current = view.state.doc.nodeAt(pos);
    if (!current || current.type.name !== "callout") return;
    if (current.attrs.emoji === emoji) return;
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, emoji }));
  };

  iconButton.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  iconButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!view.editable) return;
    openCalloutEmojiPicker(iconButton, String(dom.dataset.emoji || DEFAULT_CALLOUT_EMOJI), setEmoji);
  });

  return {
    dom,
    contentDOM: body,
    update(updated) {
      if (updated.type.name !== "callout") return false;
      const emoji = String(updated.attrs.emoji || DEFAULT_CALLOUT_EMOJI);
      dom.dataset.emoji = emoji;
      iconButton.textContent = emoji;
      return true;
    },
    stopEvent(event) {
      const target = event.target as Node | null;
      return Boolean(target && iconButton.contains(target));
    },
    ignoreMutation(mutation) {
      if (mutation.type === "selection") return false;
      return !body.contains(mutation.target);
    },
    destroy() {
      closeActivePicker();
    },
  };
}

export const calloutView = $view(calloutSchema.node, () => (node, view, getPos) =>
  createCalloutNodeView(node, view, getPos),
);

export const calloutViewPlugin: MilkdownPlugin[] = [calloutView];
