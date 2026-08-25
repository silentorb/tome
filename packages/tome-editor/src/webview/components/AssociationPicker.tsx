import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sortBySearchRelevanceMulti } from "tome-db/search-relevance";
import type { RelationshipTypeOption } from "tome-graph-interfaces";
import type { EditorApi } from "../api/client";
import "./record-link-picker.css";

interface AssociationPickerProps {
  api: EditorApi;
  selectedType: string | null;
  ariaLabel: string;
  onSelect: (type: string, label?: string) => void;
}

export function filterAndSortAssociations(
  types: readonly RelationshipTypeOption[],
  query: string,
): RelationshipTypeOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...types];
  const matches = types.filter((item) => item.label.toLowerCase().includes(q));
  return sortBySearchRelevanceMulti(matches, query, (item) => [item.label]);
}

export function AssociationPicker({
  api,
  selectedType,
  ariaLabel,
  onSelect,
}: AssociationPickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<RelationshipTypeOption[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void api
      .listRelationshipTypes()
      .then((items) => setTypes(items))
      .catch((err) => {
        setTypes([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, [api]);

  const filtered = useMemo(
    () => filterAndSortAssociations(types, query),
    [query, types],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query, types.length]);

  const selectedLabel = types.find((item) => item.type === selectedType)?.label;

  const pick = useCallback(
    (item: RelationshipTypeOption) => {
      onSelect(item.type, item.label);
      setQuery("");
      setActiveIndex(0);
    },
    [onSelect],
  );

  const displayValue =
    selectedType && !query ? (selectedLabel ?? "") : query;

  return (
    <div
      ref={rootRef}
      className="tome-record-link-picker is-embedded"
      role="group"
      aria-label={ariaLabel}
    >
      <input
        type="search"
        className="tome-record-link-picker-search"
        placeholder="Search relationship types…"
        value={displayValue}
        aria-controls="tome-relationship-type-picker-listbox"
        onChange={(event) => {
          setQuery(event.target.value);
          if (selectedType) onSelect("");
        }}
        onFocus={() => {
          if (selectedType && !query) setQuery("");
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((index) => Math.min(index + 1, Math.max(0, filtered.length - 1)));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((index) => Math.max(index - 1, 0));
            return;
          }
          if (event.key === "Enter" && filtered[activeIndex]) {
            event.preventDefault();
            pick(filtered[activeIndex]!);
          }
        }}
      />
      <div
        id="tome-relationship-type-picker-listbox"
        className="tome-record-link-picker-list"
        role="listbox"
      >
        {error ? <div className="tome-record-link-picker-error">{error}</div> : null}
        {loading && filtered.length === 0 ? (
          <div className="tome-record-link-picker-empty">Loading types…</div>
        ) : null}
        {!loading && filtered.length === 0 ? (
          <div className="tome-record-link-picker-empty">No matching types</div>
        ) : (
          filtered.map((item, index) => {
            const isActive = index === activeIndex;
            const isSelected = item.type === selectedType;
            return (
              <button
                key={item.type}
                type="button"
                role="option"
                aria-selected={isActive || isSelected}
                className={`tome-record-link-picker-item${isActive ? " is-active" : ""}${isSelected ? " is-selected" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(item)}
              >
                <span className="tome-record-link-picker-title">{item.label}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
