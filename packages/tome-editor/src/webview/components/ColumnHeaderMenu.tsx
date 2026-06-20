import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ConfirmDialog } from "./ConfirmDialog";
import "./page-actions-menu.css";

interface ColumnHeaderMenuProps {
  columnLabel: string;
  isRelation?: boolean;
  children: ReactNode;
  onEdit?: () => void;
  onDelete?: () => void | Promise<void>;
}

interface MenuPosition {
  top: number;
  left: number;
}

export function ColumnHeaderMenu({
  columnLabel,
  isRelation = false,
  children,
  onEdit,
  onDelete,
}: ColumnHeaderMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setMenuPosition({ top: event.clientY, left: event.clientX });
    setMenuOpen(true);
  }, []);

  const closeConfirm = () => {
    if (busy) return;
    setConfirmOpen(false);
  };

  const runDelete = async () => {
    if (!onDelete) return;
    setBusy(true);
    try {
      await onDelete();
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const confirmMessage = isRelation
    ? `Delete the “${columnLabel}” column? This removes the field from the type table and unlinks all related records from every row. This cannot be undone.`
    : `Delete the “${columnLabel}” column? This removes the field from the type table and clears its value on every row. This cannot be undone.`;

  const menuPanel =
    menuOpen && menuPosition ? (
      <div
        ref={menuRef}
        className="tome-page-actions-menu is-portal"
        role="menu"
        style={{
          position: "fixed",
          top: menuPosition.top,
          left: menuPosition.left,
        }}
      >
        {onEdit ? (
          <button
            type="button"
            role="menuitem"
            className="tome-page-actions-item"
            onClick={() => {
              setMenuOpen(false);
              onEdit();
            }}
          >
            Edit
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            role="menuitem"
            className="tome-page-actions-item is-danger"
            onClick={() => {
              setMenuOpen(false);
              setConfirmOpen(true);
            }}
          >
            Delete
          </button>
        ) : null}
      </div>
    ) : null;

  return (
    <>
      <div
        ref={rootRef}
        className="tome-column-header-menu-wrap"
        onContextMenu={handleContextMenu}
      >
        {children}
      </div>
      {menuPanel ? createPortal(menuPanel, document.body) : null}

      <ConfirmDialog
        open={confirmOpen && Boolean(onDelete)}
        title="Delete column?"
        message={confirmMessage}
        confirmLabel="Delete column"
        confirmTone="danger"
        busy={busy}
        onCancel={closeConfirm}
        onConfirm={() => {
          if (onDelete) void runDelete();
        }}
      />
    </>
  );
}
