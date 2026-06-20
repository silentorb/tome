const NODE_LINK_ICON =
  '<span class="tome-node-link-icon" aria-hidden="true">' +
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tome-node-link-page-icon">' +
  '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/>' +
  '<path d="M14 2v5a1 1 0 0 0 1 1h5"/>' +
  '<path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>' +
  "</svg></span>";

function nodeIdFromHref(href: string): string | null {
  const match = /\/nodes\/([a-f0-9]{32})\/?(?:[#?].*)?$/i.exec(href);
  return match?.[1]?.toLowerCase() ?? null;
}

/** Prefix file icon on node links that originated from `[[node-id]]` syntax. */
export function decorateDynamicLinkHtml(html: string, dynamicNodeIds: ReadonlySet<string>): string {
  if (dynamicNodeIds.size === 0) return html;
  return html.replace(/<a\b([^>]*?)>([\s\S]*?)<\/a>/gi, (full, attrs, inner) => {
    if (full.includes("tome-dynamic-node-link-wrap")) return full;
    const hrefMatch = /\bhref="([^"]+)"/i.exec(attrs);
    const href = hrefMatch?.[1];
    if (!href) return full;
    const nodeId = nodeIdFromHref(href);
    if (!nodeId || !dynamicNodeIds.has(nodeId)) return full;
    const classMatch = /\bclass="([^"]*)"/i.exec(attrs);
    const existingClass = classMatch?.[1]?.trim();
    const classAttr = existingClass
      ? ` class="${existingClass} tome-dynamic-node-link"`
      : ' class="tome-dynamic-node-link"';
    const attrsWithoutClass = attrs.replace(/\s*class="[^"]*"/i, "");
    return `<span class="tome-dynamic-node-link-wrap">${NODE_LINK_ICON}<a${attrsWithoutClass}${classAttr}>${inner}</a></span>`;
  });
}
