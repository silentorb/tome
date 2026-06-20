const WORD_BOUNDARY_CHARS = new Set([" ", "-", "_", "/"]);

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function wordBoundaryMatchIndex(titleLower: string, queryLower: string): number {
  if (titleLower.startsWith(queryLower)) return 0;

  for (let index = 1; index < titleLower.length; index++) {
    if (!WORD_BOUNDARY_CHARS.has(titleLower[index - 1]!)) continue;
    if (titleLower.startsWith(queryLower, index)) return index;
  }

  return -1;
}

/** Lower score means a better match. */
export function searchMatchRelevanceScore(label: string, query: string): number {
  const queryLower = normalizeSearchText(query);
  if (!queryLower) return 0;

  const titleLower = label.toLocaleLowerCase();
  if (titleLower === queryLower) return 0;
  if (titleLower.startsWith(queryLower)) return 1;

  const wordBoundaryIndex = wordBoundaryMatchIndex(titleLower, queryLower);
  if (wordBoundaryIndex >= 0) return 2 + wordBoundaryIndex;

  const substringIndex = titleLower.indexOf(queryLower);
  if (substringIndex >= 0) return 100 + substringIndex;

  return Number.POSITIVE_INFINITY;
}

export function compareSearchMatchRelevance(query: string, labelA: string, labelB: string): number {
  const trimmed = query.trim();
  if (!trimmed) {
    return labelA.localeCompare(labelB, undefined, { sensitivity: "base", numeric: true });
  }

  const scoreA = searchMatchRelevanceScore(labelA, trimmed);
  const scoreB = searchMatchRelevanceScore(labelB, trimmed);
  if (scoreA !== scoreB) return scoreA - scoreB;

  const lengthA = labelA.length;
  const lengthB = labelB.length;
  if (lengthA !== lengthB) return lengthA - lengthB;

  return labelA.localeCompare(labelB, undefined, { sensitivity: "base", numeric: true });
}

export function sortBySearchRelevance<T>(
  items: readonly T[],
  query: string,
  getLabel: (item: T) => string,
): T[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [...items].sort((left, right) =>
      getLabel(left).localeCompare(getLabel(right), undefined, {
        sensitivity: "base",
        numeric: true,
      }),
    );
  }

  return [...items].sort((left, right) =>
    compareSearchMatchRelevance(trimmed, getLabel(left), getLabel(right)),
  );
}

export function sortBySearchRelevanceMulti<T>(
  items: readonly T[],
  query: string,
  getLabels: (item: T) => readonly string[],
): T[] {
  const trimmed = query.trim();
  if (!trimmed) return [...items];

  return [...items].sort((left, right) => {
    const leftScore = Math.min(...getLabels(left).map((label) => searchMatchRelevanceScore(label, trimmed)));
    const rightScore = Math.min(...getLabels(right).map((label) => searchMatchRelevanceScore(label, trimmed)));
    if (leftScore !== rightScore) return leftScore - rightScore;

    const leftLabel = getLabels(left)[0] ?? "";
    const rightLabel = getLabels(right)[0] ?? "";
    if (leftLabel.length !== rightLabel.length) return leftLabel.length - rightLabel.length;

    return leftLabel.localeCompare(rightLabel, undefined, { sensitivity: "base", numeric: true });
  });
}
