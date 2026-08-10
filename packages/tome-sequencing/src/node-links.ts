export function sequencingNodePageHref(nodeId: string, base?: string | URL): string {
  const url = new URL(base ?? "http://local/");
  url.searchParams.set("node", nodeId);
  return `${url.pathname}?${url.searchParams.toString()}`;
}
