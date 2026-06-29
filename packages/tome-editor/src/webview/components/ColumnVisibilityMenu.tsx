import { useEffect, useRef, useState } from "react";
import "./column-visibility-menu.css";

interface ColumnVisibilityMenuProps {
  columns: string[];
  columnLabels?: Record<string, string>;
  hiddenColumns: readonly string[];
  onToggle: (columnKey: string) => void;
}

function formatColumnLabel(key: string): string {
  if (key === "name") return "Name";
  return key
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function EyeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M9.88 9.88a3 3 0 1 0 4.24 4.24"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a18.45 18.45 0 0 1-2.16 3.19"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.61 6.61A18.45 18.45 0 0 0 2 12s3 7 10 7a10.43 10.43 0 0 0 4.92-1.27"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 2l20 20"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ColumnVisibilityMenu({
  columns,
  columnLabels,
  hiddenColumns,
  onToggle,
}: ColumnVisibilityMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hiddenSet = new Set(hiddenColumns);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  if (columns.length === 0) return null;

  const labelFor = (column: string) => columnLabels?.[column] ?? formatColumnLabel(column);

  return (
    <div className="tome-column-visibility-wrap" ref={rootRef}>
      <button
        type="button"
        className="tome-table-column-visibility"
        aria-label="Column visibility"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <EyeIcon />
      </button>
      {open ? (
        <div className="tome-column-visibility-menu" role="menu" aria-label="Column visibility">
          {columns.map((column) => {
            const visible = !hiddenSet.has(column);
            return (
              <div key={column} className="tome-column-visibility-item" role="none">
                <span className="tome-column-visibility-label">{labelFor(column)}</span>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  className="tome-column-visibility-toggle"
                  aria-checked={visible}
                  aria-label={`${visible ? "Hide" : "Show"} ${labelFor(column)}`}
                  onClick={() => onToggle(column)}
                >
                  {visible ? <EyeIcon /> : <EyeOffIcon />}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
