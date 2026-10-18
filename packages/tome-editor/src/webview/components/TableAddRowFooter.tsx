import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import type { EditorApi } from "../api/client";
import { RecordLinkPicker } from "./RecordLinkPicker";
import "./table-add-row-footer.css";

interface TableAddRowContextValue {
  footerLabel: string;
  expanded: boolean;
  expand: () => void;
  title: string;
  setTitle: (value: string) => void;
  membershipTargetId: string | null;
  membershipTargetLabel: string | null;
  setMembershipTarget: (id: string | null, label: string | null) => void;
  membershipTarget?: {
    api: EditorApi;
    allowedTypeIds?: string[];
    label: string;
  };
  pickingTarget: boolean;
  setPickingTarget: (value: boolean) => void;
  submitting: boolean;
  error: string | null;
  reset: () => void;
  submit: () => Promise<void>;
}

const TableAddRowContext = createContext<TableAddRowContextValue | null>(null);

function useTableAddRowContext(): TableAddRowContextValue {
  const context = useContext(TableAddRowContext);
  if (!context) {
    throw new Error("TableAddRow components must be used within TableAddRow");
  }
  return context;
}

interface TableAddRowProps {
  label: string;
  onSubmit: (title: string, membershipTargetId?: string) => Promise<void>;
  /** When set, create-row requires a membership relation target (predicate-scoped hubs). */
  membershipTarget?: {
    api: EditorApi;
    allowedTypeIds?: string[];
    label: string;
  };
  children: ReactNode;
}

export function TableAddRow({
  label,
  onSubmit,
  membershipTarget,
  children,
}: TableAddRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [membershipTargetId, setMembershipTargetId] = useState<string | null>(null);
  const [membershipTargetLabel, setMembershipTargetLabel] = useState<string | null>(
    null,
  );
  const [pickingTarget, setPickingTarget] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setExpanded(false);
    setTitle("");
    setMembershipTargetId(null);
    setMembershipTargetLabel(null);
    setPickingTarget(false);
    setError(null);
  }, []);

  const setMembershipTarget = useCallback((id: string | null, label: string | null) => {
    setMembershipTargetId(id);
    setMembershipTargetLabel(label);
  }, []);

  const submit = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    if (membershipTarget && !membershipTargetId) {
      setError(`${membershipTarget.label} is required.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed, membershipTargetId ?? undefined);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [membershipTarget, membershipTargetId, onSubmit, reset, title]);

  const value: TableAddRowContextValue = {
    footerLabel: label,
    expanded,
    expand: () => setExpanded(true),
    title,
    setTitle,
    membershipTargetId,
    membershipTargetLabel,
    setMembershipTarget,
    membershipTarget,
    pickingTarget,
    setPickingTarget,
    submitting,
    error,
    reset,
    submit,
  };

  return <TableAddRowContext.Provider value={value}>{children}</TableAddRowContext.Provider>;
}

interface TableAddRowTriggerProps {
  label?: string;
}

export function TableAddRowTrigger({ label = "New" }: TableAddRowTriggerProps) {
  const { expand } = useTableAddRowContext();

  return (
    <button
      type="button"
      className="tome-table-new-row-btn"
      onClick={expand}
    >
      {label}
    </button>
  );
}

export function TableAddRowFooter() {
  const {
    footerLabel,
    expanded,
    expand,
    title,
    setTitle,
    membershipTarget,
    membershipTargetId,
    membershipTargetLabel,
    setMembershipTarget,
    pickingTarget,
    setPickingTarget,
    submitting,
    error,
    reset,
    submit,
  } = useTableAddRowContext();

  if (!expanded) {
    return (
      <div className="tome-table-add-row">
        <button
          type="button"
          className="tome-table-add-row-trigger"
          onClick={expand}
        >
          + {footerLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="tome-table-add-row tome-table-add-row-form">
      <input
        type="text"
        className="tome-table-add-row-input"
        placeholder="Name"
        value={title}
        autoFocus
        disabled={submitting}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") void submit();
          if (event.key === "Escape") reset();
        }}
      />
      {membershipTarget ? (
        <div className="tome-table-add-row-membership">
          <span className="tome-table-add-row-membership-label">
            {membershipTarget.label}
          </span>
          {membershipTargetId && membershipTargetLabel ? (
            <span className="tome-table-add-row-membership-value">
              {membershipTargetLabel}
              <button
                type="button"
                className="tome-btn-secondary"
                disabled={submitting}
                onClick={() => setMembershipTarget(null, null)}
              >
                Clear
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="tome-btn-secondary"
              disabled={submitting}
              onClick={() => setPickingTarget(true)}
            >
              Choose…
            </button>
          )}
          {pickingTarget ? (
            <RecordLinkPicker
              api={membershipTarget.api}
              allowedTypeIds={membershipTarget.allowedTypeIds}
              excludedIds={[]}
              ariaLabel={membershipTarget.label}
              onSelect={async (nodeId, summary) => {
                setMembershipTarget(nodeId, summary?.title ?? nodeId);
                setPickingTarget(false);
              }}
              onClose={() => setPickingTarget(false)}
            />
          ) : null}
        </div>
      ) : null}
      <div className="tome-table-add-row-actions">
        <button
          type="button"
          className="tome-btn-secondary"
          onClick={reset}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="button"
          className="tome-btn-primary"
          onClick={() => void submit()}
          disabled={submitting}
        >
          {submitting ? "Adding…" : "Add"}
        </button>
      </div>
      {error ? <div className="tome-table-add-row-error">{error}</div> : null}
    </div>
  );
}
