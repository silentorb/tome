import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DatabaseColumnDef } from "../../shared/types";
import type { EditorApi } from "../api/client";
import { relationPerspectiveFromName, slugifyColumnKey } from "./column-editor-utils";
import { ConfirmDialog } from "./ConfirmDialog";
import "./add-relationship-dialog.css";
import "./column-editor-dialog.css";

const SCALAR_TYPES = [
  { value: "text", label: "Text" },
  { value: "rich_text", label: "Rich text" },
  { value: "number", label: "Number" },
  { value: "checkbox", label: "Checkbox" },
  { value: "select", label: "Select" },
  { value: "status", label: "Status" },
  { value: "multi_select", label: "Multi-select" },
  { value: "date", label: "Date" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
  { value: "phone_number", label: "Phone" },
  { value: "files", label: "Files" },
] as const;

export interface ColumnEditorState {
  mode: "add" | "edit";
  columnKey?: string;
}

interface ColumnEditorDialogProps {
  api: EditorApi;
  open: boolean;
  databaseId: string;
  state: ColumnEditorState | null;
  columnDefs?: DatabaseColumnDef[];
  onClose: () => void;
  onSaved: () => void;
}

function relationPerspectivePreview(name: string): string {
  return relationPerspectiveFromName(name);
}

function initialFormFromColumn(def: DatabaseColumnDef | undefined, mode: "add" | "edit") {
  if (mode === "edit" && def) {
    return {
      name: def.name,
      key: def.key,
      type: def.type === "relation" ? "relation" : def.type,
      enumId: def.enumId ?? "",
      targetTypeId: def.targetDatabaseId ?? "",
      perspective:
        def.type === "relation" ? (def.relationType ?? relationPerspectivePreview(def.name)) : "",
    };
  }
  return {
    name: "",
    key: "",
    type: "text",
    enumId: "",
    targetTypeId: "",
    perspective: "",
  };
}

function migrationConfirmMessage(
  mode: "add" | "edit",
  initial: ReturnType<typeof initialFormFromColumn>,
  next: ReturnType<typeof initialFormFromColumn>,
): string | null {
  if (mode === "add") return null;

  const parts: string[] = [];
  if (next.key !== initial.key) {
    parts.push("Renaming the column key will migrate stored values on every row.");
  }
  if (next.type !== initial.type) {
    if (initial.type === "relation" || next.type === "relation") {
      parts.push("Changing the column type will unlink relation links or clear stored values.");
    } else {
      parts.push("Changing the column type may leave existing cell values incompatible.");
    }
  } else if (next.type === "relation") {
    if (
      next.targetTypeId !== initial.targetTypeId ||
      next.perspective !== initial.perspective
    ) {
      parts.push("Changing relation settings will unlink all existing links for this column.");
    }
  }

  if (parts.length === 0) return null;
  return parts.join(" ");
}

export function ColumnEditorDialog({
  api,
  open,
  databaseId,
  state,
  columnDefs,
  onClose,
  onSaved,
}: ColumnEditorDialogProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enumIds, setEnumIds] = useState<string[]>([]);
  const [typeTables, setTypeTables] = useState<{ id: string; title: string }[]>([]);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [pendingSubmit, setPendingSubmit] = useState<(() => Promise<void>) | null>(null);

  const editingDef = useMemo(
    () => columnDefs?.find((col) => col.key === state?.columnKey),
    [columnDefs, state?.columnKey],
  );

  const [form, setForm] = useState(() =>
    initialFormFromColumn(editingDef, state?.mode ?? "add"),
  );
  const [initialForm, setInitialForm] = useState(form);

  useEffect(() => {
    if (!open || !state) return;
    const next = initialFormFromColumn(editingDef, state.mode);
    setForm(next);
    setInitialForm(next);
    setError(null);
    setBusy(false);
    setConfirmMessage(null);
    setPendingSubmit(null);
    closeRef.current?.focus();
  }, [open, state, editingDef]);

  useEffect(() => {
    if (!open) return;
    void Promise.all([api.getSchema(), api.listTypeTables()]).then(([schema, tables]) => {
      setEnumIds(Object.keys(schema.enums).sort());
      setTypeTables(tables);
    });
  }, [api, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy && !confirmMessage) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, confirmMessage, onClose, open]);

  const autoKey = slugifyColumnKey(form.name);
  const effectiveKey = form.key.trim() || autoKey;
  const perspectivePreview =
    form.perspective.trim() || relationPerspectivePreview(form.name || "Property");

  const submitPayload = () => {
    const name = form.name.trim();
    const key = form.key.trim() || slugifyColumnKey(name);
    const base = {
      name,
      key: state?.mode === "add" ? key : undefined,
      newKey: state?.mode === "edit" && key !== state.columnKey ? key : undefined,
      type: form.type,
    };
    if (form.type === "relation") {
      return {
        ...base,
        targetTypeId: form.targetTypeId,
        perspective: form.perspective.trim() || relationPerspectivePreview(name),
      };
    }
    if (form.type === "select" || form.type === "status") {
      return { ...base, enumId: form.enumId.trim() || undefined };
    }
    return base;
  };

  const runSubmit = async () => {
    if (!state || busy) return;
    const name = form.name.trim();
    if (!name) {
      setError("Name is required.");
      return;
    }
    if (form.type === "relation" && !form.targetTypeId) {
      setError("Target type table is required for relation columns.");
      return;
    }
    if ((form.type === "select" || form.type === "status") && !form.enumId.trim()) {
      setError("Select an existing enum for this column type.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const payload = submitPayload();
      if (state.mode === "add") {
        await api.createDatabaseColumn(databaseId, {
          name: payload.name,
          key: payload.key,
          type: payload.type,
          enumId: "enumId" in payload ? payload.enumId : undefined,
          targetTypeId: "targetTypeId" in payload ? payload.targetTypeId : undefined,
          perspective: "perspective" in payload ? payload.perspective : undefined,
        });
      } else if (state.columnKey) {
        await api.updateDatabaseColumn(databaseId, state.columnKey, {
          name: payload.name,
          newKey: payload.newKey,
          type: payload.type,
          enumId:
            form.type === "select" || form.type === "status"
              ? form.enumId.trim()
              : null,
          targetTypeId: "targetTypeId" in payload ? payload.targetTypeId : undefined,
          perspective: "perspective" in payload ? payload.perspective : undefined,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const requestSave = () => {
    if (!state) return;

    const migrationMessage = migrationConfirmMessage(state.mode, initialForm, {
      ...form,
      key: effectiveKey,
      perspective: perspectivePreview,
    });
    if (migrationMessage) {
      setConfirmMessage(migrationMessage);
      setPendingSubmit(() => runSubmit);
      return;
    }
    void runSubmit();
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    requestSave();
  };

  if (!open || !state) return null;

  const dialogTitle = state.mode === "add" ? "Add column" : `Edit column`;

  return (
    <>
      <div
        className="tome-add-relationship-backdrop"
        onClick={busy ? undefined : onClose}
      >
        <div
          className="tome-add-relationship-dialog tome-column-editor-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="tome-add-relationship-header">
            <h2 id={titleId} className="tome-add-relationship-title">
              {dialogTitle}
            </h2>
            <button
              ref={closeRef}
              type="button"
              className="tome-add-relationship-close"
              aria-label="Close"
              disabled={busy}
              onClick={onClose}
            >
              ×
            </button>
          </header>

          <form className="tome-column-editor-form" onSubmit={handleSubmit}>
            <label className="tome-column-editor-field">
              <span>Name</span>
              <input
                value={form.name}
                disabled={busy}
                autoFocus
                placeholder="Priority"
                onChange={(event) => {
                  const name = event.target.value;
                  setForm((current) => ({
                    ...current,
                    name,
                    key:
                      state.mode === "add" || current.key === slugifyColumnKey(current.name)
                        ? slugifyColumnKey(name)
                        : current.key,
                    perspective:
                      current.type === "relation" &&
                      (!current.perspective ||
                        current.perspective === relationPerspectivePreview(current.name))
                        ? relationPerspectivePreview(name)
                        : current.perspective,
                  }));
                }}
              />
              <span className="tome-column-editor-hint">Display label in the table header.</span>
            </label>

            <label className="tome-column-editor-field">
              <span>Key</span>
              <input
                value={form.key}
                disabled={busy}
                placeholder={autoKey}
                onChange={(event) => setForm((current) => ({ ...current, key: event.target.value }))}
              />
              {state.mode === "edit" && effectiveKey !== initialForm.key ? (
                <span className="tome-column-editor-hint is-warning">
                  Renaming the key migrates stored values on every row.
                </span>
              ) : (
                <span className="tome-column-editor-hint">
                  Storage slug on row data; derived from name if empty (e.g. property).
                </span>
              )}
            </label>

            <label className="tome-column-editor-field">
              <span>Type</span>
              <select
                value={form.type}
                disabled={busy}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event.target.value,
                    enumId:
                      event.target.value === "select" || event.target.value === "status"
                        ? current.enumId
                        : "",
                    targetTypeId:
                      event.target.value === "relation" ? current.targetTypeId : "",
                    perspective:
                      event.target.value === "relation"
                        ? current.perspective || relationPerspectivePreview(current.name)
                        : "",
                  }))
                }
              >
                {SCALAR_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                <option value="relation">Relation</option>
              </select>
            </label>

            {form.type === "select" || form.type === "status" ? (
              <label className="tome-column-editor-field">
                <span>Enum</span>
                <select
                  value={form.enumId}
                  disabled={busy}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, enumId: event.target.value }))
                  }
                >
                  <option value="">Select enum…</option>
                  {enumIds.map((enumId) => (
                    <option key={enumId} value={enumId}>
                      {enumId}
                    </option>
                  ))}
                </select>
                <span className="tome-column-editor-hint">
                  New enums must be added in schema.json manually.
                </span>
              </label>
            ) : null}

            {form.type === "relation" ? (
              <>
                <label className="tome-column-editor-field">
                  <span>Target type table</span>
                  <select
                    value={form.targetTypeId}
                    disabled={busy}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, targetTypeId: event.target.value }))
                    }
                  >
                    <option value="">Select type table…</option>
                    {typeTables.map((table) => (
                      <option key={table.id} value={table.id}>
                        {table.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="tome-column-editor-field">
                  <span>Perspective</span>
                  <input
                    value={form.perspective}
                    disabled={busy}
                    placeholder={perspectivePreview}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, perspective: event.target.value }))
                    }
                  />
                </label>
              </>
            ) : null}

            {error ? <p className="tome-add-relationship-error">{error}</p> : null}

            <div className="tome-column-editor-actions">
              <button type="button" disabled={busy} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" disabled={busy || !form.name.trim()}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <ConfirmDialog
        open={confirmMessage != null}
        title="Apply column changes?"
        message={confirmMessage ?? ""}
        confirmLabel="Save column"
        confirmTone="danger"
        busy={busy}
        onCancel={() => {
          if (busy) return;
          setConfirmMessage(null);
          setPendingSubmit(null);
        }}
        onConfirm={() => {
          if (pendingSubmit) void pendingSubmit();
          setConfirmMessage(null);
          setPendingSubmit(null);
        }}
      />
    </>
  );
}
