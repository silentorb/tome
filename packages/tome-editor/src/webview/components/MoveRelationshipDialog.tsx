import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { EditorApi } from "../api/client";
import { useUserSettings } from "../hooks/useUserSettings";
import { RecordLinkPicker } from "./RecordLinkPicker";
import "./add-relationship-dialog.css";

interface MoveRelationshipDialogProps {
  api: EditorApi;
  open: boolean;
  recordTitle: string;
  /** Locked directed projection type for this move (e.g. section label). */
  projectionType: string;
  /**
   * Endpoint role being picked for Only-active filtering.
   * Relation-section Move picks a new source; database Move picks a new target.
   */
  onlyActivePickingRole: "source" | "target";
  allowedTypeIds?: readonly string[];
  excludedIds: readonly string[];
  onClose: () => void;
  onMove: (selectedId: string) => Promise<void>;
  onMoved?: () => void;
}

function moveErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("duplicate")) return "That relationship already exists.";
  if (raw.includes("target type not allowed")) {
    return "Target record type is not allowed for this relationship.";
  }
  if (raw.includes("not found")) return "Source or target record was not found.";
  return raw || "Could not move relationship.";
}

export function MoveRelationshipDialog({
  api,
  open,
  recordTitle,
  projectionType,
  onlyActivePickingRole,
  allowedTypeIds,
  excludedIds,
  onClose,
  onMove,
  onMoved,
}: MoveRelationshipDialogProps) {
  const titleId = useId();
  const onlyActiveId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const {
    relationshipsOnlyActiveTargets,
    setRelationshipsOnlyActiveTargets,
  } = useUserSettings();
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerKey, setPickerKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setMoving(false);
    setError(null);
    setPickerKey((key) => key + 1);
    closeRef.current?.focus();
  }, [open, recordTitle]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !moving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moving, onClose, open]);

  const handleSelect = useCallback(
    async (selectedId: string) => {
      if (moving) return;
      setMoving(true);
      setError(null);
      try {
        await onMove(selectedId);
        onMoved?.();
        onClose();
      } catch (err) {
        setError(moveErrorMessage(err));
      } finally {
        setMoving(false);
      }
    },
    [moving, onClose, onMove, onMoved],
  );

  if (!open) return null;

  const displayTitle = recordTitle.trim() || "Untitled";

  return (
    <div
      className="tome-add-relationship-backdrop"
      onClick={moving ? undefined : onClose}
    >
      <div
        className="tome-add-relationship-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tome-add-relationship-header">
          <h2 id={titleId} className="tome-add-relationship-title">
            Move
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="tome-add-relationship-close"
            aria-label="Close"
            disabled={moving}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <p className="tome-add-relationship-hint">
          Move “{displayTitle}” to connect to a different record.
        </p>
        <div className="tome-add-relationship-fields">
          <div className="tome-add-relationship-field">
            <div className="tome-add-relationship-label-row">
              <span className="tome-add-relationship-label">New connection</span>
              <label
                className="tome-add-relationship-only-active"
                htmlFor={onlyActiveId}
              >
                <input
                  id={onlyActiveId}
                  type="checkbox"
                  checked={relationshipsOnlyActiveTargets}
                  disabled={moving}
                  onChange={(event) => {
                    setRelationshipsOnlyActiveTargets(event.target.checked);
                    setPickerKey((key) => key + 1);
                  }}
                />
                Only active
              </label>
            </div>
            <RecordLinkPicker
              key={pickerKey}
              api={api}
              embedded
              closeOnSelect
              allowedTypeIds={
                allowedTypeIds && allowedTypeIds.length > 0
                  ? [...allowedTypeIds]
                  : undefined
              }
              excludedIds={excludedIds}
              participatesInProjectionType={
                relationshipsOnlyActiveTargets ? projectionType : undefined
              }
              onlyActivePickingRole={onlyActivePickingRole}
              ariaLabel={`Search destination for ${displayTitle}`}
              onSelect={handleSelect}
              onClose={() => {}}
            />
          </div>
        </div>
        {moving ? (
          <div className="tome-add-relationship-status" aria-live="polite">
            Moving…
          </div>
        ) : null}
        {error ? (
          <div className="tome-add-relationship-error" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}
