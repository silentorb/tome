import "./table-search-input.css";

interface TableSearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

function SearchIcon() {
  return (
    <svg
      className="tome-table-search-icon-svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function TableSearchInput({ value, onChange }: TableSearchInputProps) {
  return (
    <label className="tome-table-search">
      <span className="tome-table-search-icon">
        <SearchIcon />
      </span>
      <input
        type="search"
        className="tome-table-search-input"
        aria-label="Filter table rows by name"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
