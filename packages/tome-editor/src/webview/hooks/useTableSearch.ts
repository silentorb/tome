import { useCallback, useState } from "react";
import { syncTableSearchParam, tableSearchFromLocation } from "../../shared/table-search-url";

export function useTableSearch(paramKey: string): [string, (query: string) => void] {
  const [query, setQueryState] = useState(() => tableSearchFromLocation(paramKey));

  const setQuery = useCallback(
    (next: string) => {
      setQueryState(next);
      syncTableSearchParam(paramKey, next);
    },
    [paramKey],
  );

  return [query, setQuery];
}
