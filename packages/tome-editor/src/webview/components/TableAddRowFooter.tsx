import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import "./table-add-row-footer.css";

interface TableAddRowContextValue {
  footerLabel: string;
  expanded: boolean;
  expand: () => void;
  title: string;
  setTitle: (value: string) => void;
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
  onSubmit: (title: string) => Promise<void>;
  children: ReactNode;
}

export function TableAddRow({ label, onSubmit, children }: TableAddRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setExpanded(false);
    setTitle("");
    setError(null);
  }, []);

  const submit = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(trimmed);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [onSubmit, reset, title]);

  const value: TableAddRowContextValue = {
    footerLabel: label,
    expanded,
    expand: () => setExpanded(true),
    title,
    setTitle,
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
