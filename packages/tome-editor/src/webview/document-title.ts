import type { AppView } from "../shared/types";

export function formatDocumentTitle(
  view: AppView,
  recordTitle?: string | null,
  appTitle = "Tome",
): string {
  if (view === "graph-explorer") return `Graph Explorer · ${appTitle}`;
  if (recordTitle) {
    return recordTitle === appTitle ? appTitle : `${recordTitle} · ${appTitle}`;
  }
  return appTitle;
}

export function syncDocumentTitle(
  view: AppView,
  recordTitle?: string | null,
  appTitle = "Tome",
): void {
  document.title = formatDocumentTitle(view, recordTitle, appTitle);
}
