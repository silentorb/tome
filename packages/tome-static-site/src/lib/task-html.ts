import {
  extractLeadingTaskMarker,
  hasLeadingTaskMarker,
} from "tome-flatfile/task";

function firstParagraphMatch(inner: string): RegExpExecArray | null {
  return /<p>([\s\S]*?)<\/p>/i.exec(inner);
}

function isTaskBlockquoteInner(inner: string): boolean {
  const firstParagraph = firstParagraphMatch(inner);
  if (!firstParagraph) return false;
  const text = firstParagraph[1]!.replace(/<[^>]+>/g, "");
  return hasLeadingTaskMarker(text);
}

function stripLeadingMarkerFromParagraphHtml(paragraphInner: string, rawMarker: string): string {
  const textOnly = paragraphInner.replace(/<[^>]+>/g, "");
  if (!hasLeadingTaskMarker(textOnly)) return paragraphInner;

  const escaped = rawMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const leading = new RegExp(`^(\\s*)${escaped}`);
  if (leading.test(paragraphInner)) {
    return paragraphInner.replace(leading, "$1");
  }

  const trimmed = textOnly.trimStart();
  const marker = extractLeadingTaskMarker(trimmed);
  if (!marker) return paragraphInner;
  return trimmed.slice(marker.raw.length);
}

function structureTaskInner(inner: string): { checked: boolean; bodyInner: string } | null {
  const firstParagraph = firstParagraphMatch(inner);
  if (!firstParagraph) return null;
  const paragraphInner = firstParagraph[1]!;
  const text = paragraphInner.replace(/<[^>]+>/g, "");
  const marker = extractLeadingTaskMarker(text);
  if (!marker) return null;

  const strippedParagraphInner = stripLeadingMarkerFromParagraphHtml(paragraphInner, marker.raw);
  const rebuiltFirst = `<p>${strippedParagraphInner}</p>`;
  const rest = inner.slice(firstParagraph.index! + firstParagraph[0].length);
  const bodyInner = rebuiltFirst + rest;
  return { checked: marker.checked, bodyInner };
}

function decorateBlockquoteTags(html: string): string {
  let result = "";
  let index = 0;

  while (index < html.length) {
    const open = html.indexOf("<blockquote", index);
    if (open < 0) {
      result += html.slice(index);
      break;
    }

    result += html.slice(index, open);
    const openEnd = html.indexOf(">", open);
    if (openEnd < 0) {
      result += html.slice(open);
      break;
    }

    let depth = 1;
    let cursor = openEnd + 1;
    let close = -1;

    while (cursor < html.length && depth > 0) {
      const nextOpen = html.indexOf("<blockquote", cursor);
      const nextClose = html.indexOf("</blockquote>", cursor);
      if (nextClose < 0) break;

      if (nextOpen >= 0 && nextOpen < nextClose) {
        depth += 1;
        cursor = nextOpen + "<blockquote".length;
        continue;
      }

      depth -= 1;
      if (depth === 0) {
        close = nextClose;
        break;
      }
      cursor = nextClose + "</blockquote>".length;
    }

    if (close < 0) {
      result += html.slice(open);
      break;
    }

    const openTag = html.slice(open, openEnd + 1);
    const inner = html.slice(openEnd + 1, close);
    const closeTag = "</blockquote>";
    const hasClass = /\bclass\s*=/.test(openTag);

    if (isTaskBlockquoteInner(inner)) {
      const structured = structureTaskInner(inner);
      const decoratedInner = decorateBlockquoteTags(structured?.bodyInner ?? inner);
      let taggedOpen = hasClass
        ? openTag.replace(/\bclass\s*=\s*(["'])([^"']*)\1/, (_match, quote, classes) => {
            const next = `${classes} tome-task`.trim();
            return `class=${quote}${next}${quote}`;
          })
        : openTag.replace("<blockquote", '<blockquote class="tome-task"');

      if (structured) {
        const checkedAttr = structured.checked ? "true" : "false";
        if (/\bdata-checked\s*=/.test(taggedOpen)) {
          taggedOpen = taggedOpen.replace(
            /\bdata-checked\s*=\s*(["'])[^"']*\1/,
            `data-checked="${checkedAttr}"`,
          );
        } else {
          taggedOpen = taggedOpen.replace(/>$/, ` data-checked="${checkedAttr}">`);
        }
        const glyph = structured.checked ? "☑" : "☐";
        result +=
          taggedOpen +
          `<span class="tome-task-checkbox" aria-hidden="true">${glyph}</span>` +
          `<div class="tome-task-body">${decoratedInner}</div>` +
          closeTag;
      } else {
        result += taggedOpen + decoratedInner + closeTag;
      }
    } else {
      result += openTag + decorateBlockquoteTags(inner) + closeTag;
    }

    index = close + closeTag.length;
  }

  return result;
}

/**
 * Promote checkbox-lead blockquotes to structured tasks:
 * `blockquote.tome-task[data-checked]` with `.tome-task-checkbox` + `.tome-task-body`.
 */
export function decorateTaskHtml(html: string): string {
  return decorateBlockquoteTags(html);
}
