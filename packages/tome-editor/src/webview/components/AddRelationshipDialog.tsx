import { useCallback, useEffect, useId, useRef, useState } from "react";
import { formatRelationshipTypeLabel } from "tome-db/relationship-type-label";
import type { EditorApi } from "../api/client";
import { RelationshipTypePicker } from "./RelationshipTypePicker";
import { RecordLinkPicker } from "./RecordLinkPicker";
import "./add-relationship-dialog.css";

interface AddRelationshipDialogProps {
  api: EditorApi;
  nodeId: string;
  open: boolean;
  onClose: () => void;
  onLinked?: () => void;
}

function linkErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes("duplicate")) return "That relationship already exists.";
  if (raw.includes("target type not allowed")) {
    return "Target record type is not allowed for this relationship.";
  }
  if (raw.includes("not found")) return "Source or target record was not found.";
  return raw || "Could not create relationship.";
}

export function AddRelationshipDialog({
  api,
  nodeId,
  open,
  onClose,
  onLinked,
}: AddRelationshipDialogProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [allowedTypeIds, setAllowedTypeIds] = useState<string[] | undefined>(undefined);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetPickerKey, setTargetPickerKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setSelectedType(null);
    setAllowedTypeIds(undefined);
    setLinking(false);
    setError(null);
    setTargetPickerKey((key) => key + 1);
    closeRef.current?.focus();
  }, [open, nodeId]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !linking) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [linking, onClose, open]);

  useEffect(() => {
    if (!open || !selectedType) {
      setAllowedTypeIds(undefined);
      return;
    }
    let cancelled = false;
    void api
      .getRelationshipLinkOptions(nodeId, selectedType)
      .then((options) => {
        if (cancelled) return;
        setAllowedTypeIds(options.allowedTargetTypeIds ?? undefined);
      })
      .catch(() => {
        if (!cancelled) setAllowedTypeIds(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [api, nodeId, open, selectedType]);

  const handleTypeSelect = useCallback((type: string) => {
    setSelectedType(type || null);
    setError(null);
    setTargetPickerKey((key) => key + 1);
  }, []);

  const handleLink = useCallback(
    async (targetId: string) => {
      if (!selectedType || linking) return;
      setLinking(true);
      setError(null);
      try {
        await api.linkOutgoingRelationship(nodeId, {
          type: selectedType,
          targetId,
        });
        onLinked?.();
        onClose();
      } catch (err) {
        setError(linkErrorMessage(err));
      } finally {
        setLinking(false);
      }
    },
    [api, linking, nodeId, onClose, onLinked, selectedType],
  );

  if (!open) return null;

  return (
    <div
      className="tome-add-relationship-backdrop"
      onClick={linking ? undefined : onClose}
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
            Relate
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="tome-add-relationship-close"
            aria-label="Close"
            disabled={linking}
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <p className="tome-add-relationship-hint">
          Link this page to an existing record by relationship type and target.
        </p>
        <div className="tome-add-relationship-fields">
          <div className="tome-add-relationship-field">
            <span className="tome-add-relationship-label">Relationship type</span>
            <RelationshipTypePicker
              api={api}
              selectedType={selectedType}
              ariaLabel="Relationship type"
              onSelect={handleTypeSelect}
            />
          </div>
          <div className="tome-add-relationship-field">
            <span className="tome-add-relationship-label">Target record</span>
            {selectedType ? (
              <RecordLinkPicker
                key={targetPickerKey}
                api={api}
                embedded
                closeOnSelect
                allowedTypeIds={allowedTypeIds}
                excludedIds={[nodeId]}
                ariaLabel={`Search target for ${formatRelationshipTypeLabel(selectedType)}`}
                onSelect={handleLink}
                onClose={() => {}}
              />
            ) : (
              <div className="tome-add-relationship-target-placeholder">
                Select a relationship type first.
              </div>
            )}
          </div>
        </div>
        {linking ? (
          <div className="tome-add-relationship-status" aria-live="polite">
            Linking…
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
