import { NodeSelection, TextSelection } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";

const DRAG_HANDLE_SELECTOR = ".milkdown-block-handle .operation-item:last-child";
const CLICK_MOVE_THRESHOLD_PX = 4;

interface PointerOrigin {
  x: number;
  y: number;
}

/** Delete the block selected by the block handle (NodeSelection) or the top-level block at the caret. */
export function deleteActiveEditorBlock(view: EditorView): boolean {
  const { state, dispatch } = view;
  const { selection } = state;

  if (selection instanceof NodeSelection) {
    dispatch(state.tr.deleteSelection());
    view.focus();
    return true;
  }

  if (!(selection instanceof TextSelection)) return false;

  const { $from } = selection;
  if ($from.depth < 1) return false;

  const blockPos = $from.before(1);
  const blockNode = $from.node(1);
  if (!blockNode) return false;

  dispatch(state.tr.delete(blockPos, blockPos + blockNode.nodeSize));
  view.focus();
  return true;
}

function isDragHandleTarget(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement && Boolean(target.closest(DRAG_HANDLE_SELECTOR));
}

function dragHandleFromTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest(DRAG_HANDLE_SELECTOR);
}

export function installBlockHandleMenu(
  view: EditorView,
  host: HTMLElement,
): () => void {
  const pointerOrigins = new WeakMap<HTMLElement, PointerOrigin>();
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

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "tome-block-handle-menu-item is-danger";
    deleteButton.setAttribute("role", "menuitem");
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      deleteActiveEditorBlock(view);
      closeMenu();
    });

    panel.appendChild(deleteButton);
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

    const onPointerDown = (event: MouseEvent) => {
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

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    removeMenuListeners = () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!isDragHandleTarget(event.target)) return;
    const handle = dragHandleFromTarget(event.target);
    if (!handle) return;
    pointerOrigins.set(handle, { x: event.clientX, y: event.clientY });
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!isDragHandleTarget(event.target)) return;
    const handle = dragHandleFromTarget(event.target);
    if (!handle) return;

    const origin = pointerOrigins.get(handle);
    pointerOrigins.delete(handle);
    if (!origin) return;

    const dx = Math.abs(event.clientX - origin.x);
    const dy = Math.abs(event.clientY - origin.y);
    if (dx > CLICK_MOVE_THRESHOLD_PX || dy > CLICK_MOVE_THRESHOLD_PX) return;
    if (view.dom.dataset.dragging === "true") return;

    event.preventDefault();
    event.stopPropagation();
    openMenu(event.clientX, event.clientY);
  };

  host.addEventListener("pointerdown", onPointerDown, true);
  host.addEventListener("pointerup", onPointerUp, true);

  return () => {
    host.removeEventListener("pointerdown", onPointerDown, true);
    host.removeEventListener("pointerup", onPointerUp, true);
    closeMenu();
  };
}
