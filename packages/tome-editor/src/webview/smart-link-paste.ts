import { Plugin, PluginKey } from "@milkdown/prose/state";
import type { EditorView } from "@milkdown/prose/view";

const smartLinkPasteKey = new PluginKey("tome-smart-link-paste");

export type ClipboardLink = {
  href: string;
  text: string;
  /** True when clipboard HTML supplied a display title distinct from the URL. */
  titled: boolean;
};

/** True for absolute http(s) URLs only (not relative, mailto, or app `?node=` links). */
export function isExternalHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * If clipboard HTML is essentially a single external anchor (Edge “copy link” /
 * address-bar titled paste), return that anchor. Ignore Windows HTML fragment chrome.
 */
export function parseSingleHtmlAnchor(html: string): { href: string; text: string } | null {
  const trimmed = html.trim();
  if (!trimmed) return null;

  const template = document.createElement("template");
  template.innerHTML = trimmed;
  const root = template.content;
  const anchors = root.querySelectorAll("a[href]");
  if (anchors.length !== 1) return null;

  const anchor = anchors[0] as HTMLAnchorElement;
  const href = (anchor.getAttribute("href") ?? "").trim();
  if (!href) return null;

  const clone = root.cloneNode(true) as DocumentFragment;
  clone.querySelector("a[href]")?.remove();
  const leftover = (clone.textContent ?? "").replace(/\u00a0/g, " ").trim();
  if (leftover.length > 0) return null;

  const text = (anchor.textContent ?? "").replace(/\u00a0/g, " ").trim();
  return { href, text: text || href };
}

/**
 * Resolve a smart-link paste target from clipboard MIME payloads.
 * Prefers a single titled HTML anchor; otherwise a bare single-line external URL.
 */
export function parseClipboardLink(html: string, plain: string): ClipboardLink | null {
  const fromHtml = parseSingleHtmlAnchor(html);
  if (fromHtml && isExternalHttpUrl(fromHtml.href)) {
    const text = fromHtml.text.trim();
    if (text && text !== fromHtml.href) {
      return { href: fromHtml.href, text, titled: true };
    }
    return { href: fromHtml.href, text: fromHtml.href, titled: false };
  }

  const plainTrim = plain.trim();
  if (!plainTrim || plainTrim.includes("\n") || plainTrim.includes("\r")) return null;
  if (!isExternalHttpUrl(plainTrim)) return null;
  return { href: plainTrim, text: plainTrim, titled: false };
}

export function applySmartLinkPaste(view: EditorView, link: ClipboardLink): boolean {
  const linkType = view.state.schema.marks.link;
  if (!linkType) return false;

  const mark = linkType.create({ href: link.href, title: null });
  const { empty, from, to } = view.state.selection;

  if (!empty && !link.titled) {
    view.dispatch(view.state.tr.addMark(from, to, mark));
    return true;
  }

  const label = link.titled ? link.text : link.href;
  const textNode = view.state.schema.text(label, [mark]);
  view.dispatch(view.state.tr.replaceSelectionWith(textNode, false));
  return true;
}

export function handleSmartLinkPaste(view: EditorView, event: ClipboardEvent): boolean {
  const editable = view.editable;
  if (!editable) return false;

  const currentNode = view.state.selection.$from.node();
  if (currentNode.type.spec.code) return false;

  const { clipboardData } = event;
  if (!clipboardData) return false;

  const html = clipboardData.getData("text/html") ?? "";
  const plain = clipboardData.getData("text/plain") ?? "";
  const link = parseClipboardLink(html, plain);
  if (!link) return false;

  return applySmartLinkPaste(view, link);
}

export function createSmartLinkPastePlugin(): Plugin {
  return new Plugin({
    key: smartLinkPasteKey,
    props: {
      handlePaste(view, event) {
        return handleSmartLinkPaste(view, event);
      },
    },
  });
}

export function installSmartLinkPaste(view: EditorView): void {
  const plugin = createSmartLinkPastePlugin();
  view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, plugin] }));
}
