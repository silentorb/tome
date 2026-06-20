import { useState } from "react";
import type { DatabaseColumnDef, ViewSortSpec } from "../../shared/types";

interface TabEditorProps {
  initialName: string;
  initialSorts: ViewSortSpec[];
  columnDefs?: DatabaseColumnDef[];
  canDelete: boolean;
  busy?: boolean;
  onCancel: () => void;
  onSave: (input: { name: string; sorts: ViewSortSpec[] }) => void;
  onDelete: () => void;
}

function columnOptions(columnDefs?: DatabaseColumnDef[]): { value: string; label: string }[] {
  const options = [{ value: "name", label: "Name" }];
  for (const col of columnDefs ?? []) {
    if (col.key === "name") continue;
    options.push({ value: col.key, label: col.name });
  }
  return options;
}

export function TabEditor({
  initialName,
  initialSorts,
  columnDefs,
  canDelete,
  busy = false,
  onCancel,
  onSave,
  onDelete,
}: TabEditorProps) {
  const [name, setName] = useState(initialName);
  const [sorts, setSorts] = useState<ViewSortSpec[]>(
    initialSorts.length > 0 ? initialSorts : [{ column: "name", direction: "asc" }],
  );
  const options = columnOptions(columnDefs);

  const updateSort = (index: number, patch: Partial<ViewSortSpec>) => {
    setSorts((current) =>
      current.map((sort, i) => (i === index ? { ...sort, ...patch } : sort)),
    );
  };

  return (
    <form
      className="tome-table-tab-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ name: name.trim(), sorts });
      }}
    >
      <div className="tome-table-tab-name-row">
        <label>
          Tab name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            disabled={busy}
          />
        </label>

        {canDelete ? (
          <button
            type="button"
            className="tome-table-tab-delete"
            disabled={busy}
            onClick={onDelete}
          >
            Delete
          </button>
        ) : null}
      </div>

      <div className="tome-table-tab-editor-heading">Sort order</div>
      {sorts.map((sort, index) => (
        <div key={`${index}-${sort.column}`} className="tome-table-tab-sort-row">
          <select
            value={sort.column}
            disabled={busy}
            onChange={(event) => updateSort(index, { column: event.target.value })}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            value={sort.direction}
            disabled={busy}
            onChange={(event) =>
              updateSort(index, { direction: event.target.value as ViewSortSpec["direction"] })
            }
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
          <button
            type="button"
            aria-label="Remove sort"
            disabled={busy}
            onClick={() => setSorts((current) => current.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="tome-table-tab-sort-add"
        disabled={busy}
        onClick={() => setSorts((current) => [...current, { column: "name", direction: "asc" }])}
      >
        Add sort
      </button>

      <div className="tome-table-tab-editor-actions">
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={!name.trim() || busy}>
          Save
        </button>
      </div>
    </form>
  );
}
