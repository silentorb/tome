import { inlinePlainText, type NodeBodyDocument } from "tome-graph-interfaces";
import { extractPageIconFromMarkdown } from "./callout-decoration";
import { HOME_ICON, VIEW_ICONS } from "./quick-links-nav";
import type { AppView } from "../shared/types";

const FALLBACK_DEFAULT_ICON = "T";
const FAVICON_LINK_ID = "tome-favicon";
const FAVICON_SIZE = 32;

export interface DocumentIconContext {
  view: AppView;
  nodeId?: string | null;
  recordBody?: string | null;
  recordDocument?: NodeBodyDocument | null;
  homeId?: string | null;
  defaultDocumentIcon?: string | null;
  /** When set, used as favicon href while the resolved glyph is the branding default. */
  documentIconImageUrl?: string | null;
}

const EMOJI_ONLY_LINE = /^(\p{Extended_Pictographic})\s*$/u;

/** First page icon from a semantic body: callout emoji or an emoji-only opening paragraph. */
export function extractPageIconFromDocument(document: NodeBodyDocument): string | null {
  for (const block of document.content) {
    if (block.type === "callout") return block.emoji;
    if (block.type === "paragraph" || block.type === "heading") {
      const text = inlinePlainText(block.content).trim();
      if (!text) continue;
      const emoji = EMOJI_ONLY_LINE.exec(text);
      return emoji?.[1] ?? null;
    }
    return null;
  }
  return null;
}

export function documentIconImageApiUrl(corpusId?: string | null): string {
  if (corpusId?.trim()) {
    return `/api/workspace/document-icon?corpusId=${encodeURIComponent(corpusId.trim())}`;
  }
  return "/api/workspace/document-icon";
}

export function resolveDocumentIcon(ctx: DocumentIconContext): string {
  if (ctx.view === "graph-explorer") return VIEW_ICONS["graph-explorer"];

  const nodeId = ctx.nodeId;
  if (nodeId && ctx.homeId && nodeId === ctx.homeId) return HOME_ICON;

  const bodyIcon = ctx.recordDocument
    ? extractPageIconFromDocument(ctx.recordDocument)
    : ctx.recordBody
      ? extractPageIconFromMarkdown(ctx.recordBody)
      : null;
  if (bodyIcon) return bodyIcon;

  return ctx.defaultDocumentIcon?.trim() || FALLBACK_DEFAULT_ICON;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x + width, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawDefaultIcon(ctx: CanvasRenderingContext2D, icon: string, size: number): void {
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#191919";
  roundRect(ctx, 0, 0, size, size, 6);
  ctx.fill();
  ctx.fillStyle = "#6cb6ff";
  ctx.font = `600 ${Math.round(size * 0.56)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(icon, size / 2, size / 2 + 1);
}

function drawEmojiIcon(ctx: CanvasRenderingContext2D, icon: string, size: number): void {
  ctx.clearRect(0, 0, size, size);
  ctx.font = `${Math.round(size * 0.78)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(icon, size / 2, size / 2 + 1);
}

function isDefaultBrandingIcon(icon: string, defaultIcon: string): boolean {
  return icon === defaultIcon;
}

function renderIconToCanvasDataUrl(icon: string, defaultIcon: string): string | null {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = FAVICON_SIZE;
  canvas.height = FAVICON_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (isDefaultBrandingIcon(icon, defaultIcon)) drawDefaultIcon(ctx, icon, FAVICON_SIZE);
  else drawEmojiIcon(ctx, icon, FAVICON_SIZE);

  return canvas.toDataURL("image/png");
}

function buildSvgFallbackDataUrl(icon: string, defaultIcon: string): string {
  const svg = isDefaultBrandingIcon(icon, defaultIcon)
    ? buildDefaultFaviconSvg(defaultIcon)
    : buildEmojiFaviconSvg(icon);
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function buildEmojiFaviconSvg(emoji: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text x="16" y="23" font-size="20" text-anchor="middle" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${escapeXml(emoji)}</text></svg>`;
}

function buildDefaultFaviconSvg(icon: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#191919"/><text x="16" y="22" font-size="18" font-weight="600" text-anchor="middle" fill="#6cb6ff" font-family="ui-sans-serif, system-ui, sans-serif">${escapeXml(icon)}</text></svg>`;
}

export function iconToFaviconHref(icon: string, defaultIcon = FALLBACK_DEFAULT_ICON): string {
  return renderIconToCanvasDataUrl(icon, defaultIcon) ?? buildSvgFallbackDataUrl(icon, defaultIcon);
}

/** Resolve the favicon href (API image URL or generated letter/emoji data URL). */
export function resolveFaviconHref(ctx: DocumentIconContext): string {
  const defaultIcon = ctx.defaultDocumentIcon?.trim() || FALLBACK_DEFAULT_ICON;
  const icon = resolveDocumentIcon(ctx);
  const imageUrl = ctx.documentIconImageUrl?.trim();
  if (imageUrl && isDefaultBrandingIcon(icon, defaultIcon)) {
    return imageUrl;
  }
  return iconToFaviconHref(icon, defaultIcon);
}

function ensureFaviconLink(): HTMLLinkElement {
  let link = document.getElementById(FAVICON_LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = FAVICON_LINK_ID;
    link.rel = "icon";
    document.head.appendChild(link);
  }
  return link;
}

export function syncDocumentIcon(ctx: DocumentIconContext): void {
  const link = ensureFaviconLink();
  const href = resolveFaviconHref(ctx);
  if (href.startsWith("data:image/png")) {
    link.type = "image/png";
  } else if (href.startsWith("data:image/svg+xml")) {
    link.type = "image/svg+xml";
  } else {
    // API route — Content-Type comes from the response; omit a wrong link type.
    link.removeAttribute("type");
  }
  link.href = href;
}
