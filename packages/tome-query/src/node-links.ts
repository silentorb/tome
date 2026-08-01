/** Browser URL for a node page (`?node=`). Avoids importing tome-editor. */
export function queryNodePageHref(nodeId: string, base?: string | URL): string {
  const defaultBase =
    typeof window !== "undefined" ? window.location.href : "http://127.0.0.1:5173/";
  const url = base instanceof URL ? new URL(base.href) : new URL(base ?? defaultBase);
  url.searchParams.set("node", nodeId);
  url.searchParams.delete("view");
  url.searchParams.delete("tab");
  url.searchParams.delete("meta");
  return url.toString();
}
