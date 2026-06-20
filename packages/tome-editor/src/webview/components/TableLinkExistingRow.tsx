import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { EditorApi } from "../api/client";
import { RecordLinkPicker } from "./RecordLinkPicker";
import "./table-link-existing-row.css";

interface TableLinkExistingRowContextValue {
  footerLabel: string;
  expanded: boolean;
  expand: () => void;
  reset: () => void;
  api: EditorApi;
  allowedTypeIds?: string[];
  excludedIds: readonly string[];
  onLink: (targetId: string) => Promise<void>;
}

const TableLinkExistingRowContext = createContext<TableLinkExistingRowContextValue | null>(null);

function useTableLinkExistingRowContext(): TableLinkExistingRowContextValue {
  const context = useContext(TableLinkExistingRowContext);
  if (!context) {
    throw new Error("TableLinkExistingRow components must be used within TableLinkExistingRow");
  }
  return context;
}

interface TableLinkExistingRowProps {
  label: string;
  api: EditorApi;
  allowedTypeIds?: string[];
  excludedIds: readonly string[];
  onLink: (targetId: string) => Promise<void>;
  children: ReactNode;
}

export function TableLinkExistingRow({
  label,
  api,
  allowedTypeIds,
  excludedIds,
  onLink,
  children,
}: TableLinkExistingRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [sessionExcludedIds, setSessionExcludedIds] = useState<readonly string[]>(excludedIds);

  useEffect(() => {
    if (!expanded) setSessionExcludedIds(excludedIds);
  }, [excludedIds, expanded]);

  const handleLink = useCallback(
    async (targetId: string) => {
      await onLink(targetId);
      setSessionExcludedIds((prev) =>
        prev.includes(targetId) ? prev : [...prev, targetId],
      );
    },
    [onLink],
  );

  const value: TableLinkExistingRowContextValue = {
    footerLabel: label,
    expanded,
    expand: () => setExpanded(true),
    reset: () => setExpanded(false),
    api,
    allowedTypeIds,
    excludedIds: sessionExcludedIds,
    onLink: handleLink,
  };

  return (
    <TableLinkExistingRowContext.Provider value={value}>{children}</TableLinkExistingRowContext.Provider>
  );
}

interface TableLinkExistingRowTriggerProps {
  label?: string;
}

export function TableLinkExistingRowTrigger({ label = "Link" }: TableLinkExistingRowTriggerProps) {
  const { expand } = useTableLinkExistingRowContext();

  return (
    <button
      type="button"
      className="tome-table-link-existing-btn"
      onClick={expand}
    >
      {label}
    </button>
  );
}

export function TableLinkExistingRowFooter() {
  const {
    footerLabel,
    expanded,
    expand,
    reset,
    api,
    allowedTypeIds,
    excludedIds,
    onLink,
  } = useTableLinkExistingRowContext();

  if (!expanded) {
    return (
      <div className="tome-table-link-existing">
        <button
          type="button"
          className="tome-table-link-existing-trigger"
          onClick={expand}
        >
          + {footerLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="tome-table-link-existing tome-table-link-existing-form">
      <RecordLinkPicker
        api={api}
        embedded
        closeOnSelect={false}
        allowedTypeIds={allowedTypeIds}
        excludedIds={excludedIds}
        ariaLabel={footerLabel}
        onSelect={onLink}
        onClose={reset}
      />
      <button type="button" className="tome-btn-secondary" onClick={reset}>
        Cancel
      </button>
    </div>
  );
}
