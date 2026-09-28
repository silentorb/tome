import type { EditorView } from "@milkdown/prose/view";
import {
  resolveActiveEditorBlock,
  unwrapActiveCallout,
  wrapActiveBlockInCallout,
} from "./callout-wrap";

const DRAG_HANDLE_SELECTOR = ".milkdown-block-handle .operation-item:last-child";
const BLOCK_HANDLE_SELECTOR = ".milkdown-block-handle";
const CLICK_MOVE_THRESHOLD_PX = 4;

interface ArmedClick {
  x: number;
  y: number;
  dragStarted: boolean;
}

/** Delete the block selected by the block handle (NodeSelection) or the top-level block at the caret. */
export function deleteActiveEditorBlock(view: EditorView): boolean {
  const active = resolveActiveEditorBlock(view);
  if (!active) return false;

  const { state, dispatch } = view;
  dispatch(state.tr.delete(active.pos, active.pos + active.node.nodeSize));
  view.focus();
  return true;
}

function appendMenuItem(
  panel: HTMLElement,
  label: string,
  onClick: () => void,
  options?: { danger?: boolean },
): void {
  const button = document.createElement("button");
  button.type = "button";
  button.className = options?.danger
    ? "tome-block-handle-menu-item is-danger"
    : "tome-block-handle-menu-item";
  button.setAttribute("role", "menuitem");
  button.textContent = label;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  panel.appendChild(button);
}

/** Grip clicks often target the SVG icon, which is Element but not HTMLElement. */
function isDragHandleTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(DRAG_HANDLE_SELECTOR));
}

function isBlockHandleTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(BLOCK_HANDLE_SELECTOR));
}

/**
 * Open a context menu on a stationary left-click of Crepe's block grip.
 * Milkdown sets `draggable` on the whole handle, so native drag often cancels or
 * retargets `pointerup` — arm on pointerdown, resolve on window pointerup/cancel,
 * and suppress when dragstart fires.
 */
export function installBlockHandleMenu(
  view: EditorView,
  host: HTMLElement,
): () => void {
  let armed: ArmedClick | null = null;
  let menu: HTMLDivElement | null = null;
  let removeMenuListeners: (() => void) | null = null;

  const closeMenu = () => {
    removeMenuListeners?.();
    removeMenuListeners = null;
    menu?.remove();
    menu = null;
  };

  const openMenu = (clientX: number, clientY: number) => {
    closeMenu();

    const panel = document.createElement("div");
    panel.className = "tome-block-handle-menu";
    panel.setAttribute("role", "menu");

    const active = resolveActiveEditorBlock(view);
    if (active?.node.type.name === "callout") {
      appendMenuItem(panel, "Unwrap Callout", () => {
        unwrapActiveCallout(view);
        closeMenu();
      });
    } else {
      appendMenuItem(panel, "Wrap in Callout", () => {
        wrapActiveBlockInCallout(view);
        closeMenu();
      });
    }

    appendMenuItem(
      panel,
      "Delete",
      () => {
        deleteActiveEditorBlock(view);
        closeMenu();
      },
      { danger: true },
    );

    document.body.appendChild(panel);

    const rect = panel.getBoundingClientRect();
    const margin = 8;
    let left = clientX;
    let top = clientY + 4;
    if (left + rect.width > window.innerWidth - margin) {
      left = window.innerWidth - rect.width - margin;
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = clientY - rect.height - 4;
    }
    panel.style.left = `${Math.max(margin, left)}px`;
    panel.style.top = `${Math.max(margin, top)}px`;

    menu = panel;

    const onOutsideMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panel.contains(target)) return;
      closeMenu();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
    };

    window.addEventListener("mousedown", onOutsideMouseDown);
    window.addEventListener("keydown", onKeyDown, true);
    removeMenuListeners = () => {
      window.removeEventListener("mousedown", onOutsideMouseDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!isDragHandleTarget(event.target)) return;
    armed = { x: event.clientX, y: event.clientY, dragStarted: false };
  };

  const onDragStart = (event: DragEvent) => {
    if (!armed || !isBlockHandleTarget(event.target)) return;
    armed.dragStarted = true;
  };

  const finishPointer = (event: PointerEvent) => {
    const pending = armed;
    armed = null;
    if (!pending || pending.dragStarted) return;

    const dx = Math.abs(event.clientX - pending.x);
    const dy = Math.abs(event.clientY - pending.y);
    if (dx > CLICK_MOVE_THRESHOLD_PX || dy > CLICK_MOVE_THRESHOLD_PX) return;
    if (view.dom.dataset.dragging === "true") return;

    event.preventDefault();
    event.stopPropagation();
    openMenu(event.clientX, event.clientY);
  };

  host.addEventListener("pointerdown", onPointerDown, true);
  host.addEventListener("dragstart", onDragStart, true);
  window.addEventListener("pointerup", finishPointer, true);
  window.addEventListener("pointercancel", finishPointer, true);

  return () => {
    host.removeEventListener("pointerdown", onPointerDown, true);
    host.removeEventListener("dragstart", onDragStart, true);
    window.removeEventListener("pointerup", finishPointer, true);
    window.removeEventListener("pointercancel", finishPointer, true);
    armed = null;
    closeMenu();
  };
}
