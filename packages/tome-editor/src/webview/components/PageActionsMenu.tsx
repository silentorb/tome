import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "./ConfirmDialog";
import "./page-actions-menu.css";

type PendingAction = "archive" | "unarchive" | "delete" | null;

interface MenuPosition {
  top: number;
  left: number;
}

interface PageActionsMenuProps {
  recordTitle: string;
  archived?: boolean;
  disabled?: boolean;
  /** `ellipsis` (⋯) for the page app bar; `vertical-dots` (⋮) for table rows. */
  trigger?: "ellipsis" | "vertical-dots";
  /** Menu alignment relative to the trigger. */
  menuAlign?: "left" | "right";
  /** Portal + fixed positioning so menus are not clipped by scroll containers. */
  menuPlacement?: "inline" | "portal";
  onArchive: () => Promise<void>;
  onUnarchive?: () => Promise<void>;
  /** Open relate dialog; page app bar only. */
  onRelate?: () => void;
  /** Unlink from the current table only; shown when provided (table rows, not page app bar). */
  onRemove?: () => Promise<void>;
  /** Retarget row relationship; table rows only. */
  onMove?: () => void;
  onDelete: () => Promise<void>;
  archiveHubTitle?: string;
}

export function PageActionsMenu({
  recordTitle,
  archived = false,
  disabled = false,
  trigger = "ellipsis",
  menuAlign = "right",
  menuPlacement = "inline",
  onArchive,
  onUnarchive,
  onRelate,
  onRemove,
  onMove,
  onDelete,
  archiveHubTitle = "Archive",
}: PageActionsMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isArchived = archived;

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setMenuPosition({
      top: rect.bottom + 4,
      left: menuAlign === "left" ? rect.left : rect.right,
    });
  }, [menuAlign]);

  useLayoutEffect(() => {
    if (!menuOpen || menuPlacement !== "portal") return;
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [menuOpen, menuPlacement, updateMenuPosition]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) setMenuPosition(null);
  }, [menuOpen]);

  const closeConfirm = () => {
    if (busy) return;
    setPendingAction(null);
  };

  const runAction = async (action: Exclude<PendingAction, null>) => {
    setBusy(true);
    try {
      if (action === "archive") await onArchive();
      else if (action === "unarchive") await onUnarchive?.();
      else await onDelete();
      setPendingAction(null);
      setMenuOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const runRemove = async () => {
    if (!onRemove) return;
    setMenuOpen(false);
    setBusy(true);
    try {
      await onRemove();
    } finally {
      setBusy(false);
    }
  };

  const displayTitle = recordTitle.trim() || "Untitled";

  const menuItems = (
    <>
      {onRelate ? (
        <button
          type="button"
          role="menuitem"
          className="tome-page-actions-item"
          onClick={() => {
            setMenuOpen(false);
            onRelate();
          }}
        >
          Relate
        </button>
      ) : null}
      {!isArchived ? (
        <button
          type="button"
          role="menuitem"
          className="tome-page-actions-item"
          onClick={() => {
            setMenuOpen(false);
            setPendingAction("archive");
          }}
        >
          Archive
        </button>
      ) : onUnarchive ? (
        <button
          type="button"
          role="menuitem"
          className="tome-page-actions-item"
          onClick={() => {
            setMenuOpen(false);
            setPendingAction("unarchive");
          }}
        >
          Unarchive
        </button>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          role="menuitem"
          className="tome-page-actions-item"
          disabled={busy}
          onClick={() => {
            void runRemove();
          }}
        >
          Remove
        </button>
      ) : null}
      {onMove ? (
        <button
          type="button"
          role="menuitem"
          className="tome-page-actions-item"
          disabled={busy}
          onClick={() => {
            setMenuOpen(false);
            onMove();
          }}
        >
          Move
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="tome-page-actions-item is-danger"
        onClick={() => {
          setMenuOpen(false);
          setPendingAction("delete");
        }}
      >
        Delete
      </button>
    </>
  );

  const menuPanel =
    menuOpen && (menuPlacement === "inline" || menuPosition) ? (
      <div
        ref={menuPlacement === "portal" ? menuRef : undefined}
        className={`tome-page-actions-menu${menuPlacement === "portal" ? " is-portal" : ""}`}
        role="menu"
        style={
          menuPlacement === "portal" && menuPosition
            ? {
                position: "fixed",
                top: menuPosition.top,
                left: menuPosition.left,
                transform: menuAlign === "right" ? "translateX(-100%)" : undefined,
              }
            : undefined
        }
      >
        {menuItems}
      </div>
    ) : null;

  return (
    <>
      <div
        className={`tome-page-actions${menuOpen ? " is-menu-open" : ""}`}
        ref={rootRef}
        data-menu-align={menuAlign}
      >
        <button
          ref={triggerRef}
          type="button"
          className={`tome-page-actions-trigger${trigger === "vertical-dots" ? " is-vertical-dots" : ""}`}
          aria-label="Page actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          disabled={disabled}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {trigger === "vertical-dots" ? (
            <span className="tome-page-actions-vertical-dots-icon" aria-hidden="true">
              ⋮
            </span>
          ) : (
            "⋯"
          )}
        </button>
        {menuPlacement === "inline" ? menuPanel : null}
      </div>
      {menuPlacement === "portal" && menuPanel
        ? createPortal(menuPanel, document.body)
        : null}

      <ConfirmDialog
        open={pendingAction === "archive"}
        title="Archive page?"
        message={`Archive “${displayTitle}”? It will be moved under ${archiveHubTitle} and hidden from most views.`}
        confirmLabel="Archive"
        busy={busy}
        onCancel={closeConfirm}
        onConfirm={() => void runAction("archive")}
      />

      <ConfirmDialog
        open={pendingAction === "unarchive"}
        title="Unarchive page?"
        message={`Restore “${displayTitle}” to active views and sync its relationships back into the editor?`}
        confirmLabel="Unarchive"
        busy={busy}
        onCancel={closeConfirm}
        onConfirm={() => void runAction("unarchive")}
      />

      <ConfirmDialog
        open={pendingAction === "delete"}
        title="Delete page?"
        message={`Delete “${displayTitle}”? This permanently removes the page and its relationships. This cannot be undone.`}
        confirmLabel="Delete"
        confirmTone="danger"
        busy={busy}
        onCancel={closeConfirm}
        onConfirm={() => void runAction("delete")}
      />
    </>
  );
}
