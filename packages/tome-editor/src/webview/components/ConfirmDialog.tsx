import { useEffect, useId, useRef } from "react";
import "./confirm-dialog.css";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmTone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  confirmTone = "default",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel, open]);

  if (!open) return null;

  return (
    <div className="tome-confirm-backdrop" onClick={busy ? undefined : onCancel}>
      <div
        className="tome-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="tome-confirm-title">
          {title}
        </h2>
        <p id={messageId} className="tome-confirm-message">
          {message}
        </p>
        <div className="tome-confirm-actions">
          <button
            ref={cancelRef}
            type="button"
            className="tome-confirm-button"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`tome-confirm-button is-primary${confirmTone === "danger" ? " is-danger" : ""}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
