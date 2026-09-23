import { extractLeadingCalloutEmoji, hasLeadingCalloutEmoji } from "tome-flatfile/callout";

function firstParagraphMatch(inner: string): RegExpExecArray | null {
  return /<p>([\s\S]*?)<\/p>/i.exec(inner);
}

function isCalloutBlockquoteInner(inner: string): boolean {
  const firstParagraph = firstParagraphMatch(inner);
  if (!firstParagraph) return false;
  const text = firstParagraph[1]!.replace(/<[^>]+>/g, "");
  return hasLeadingCalloutEmoji(text);
}

function stripLeadingEmojiFromParagraphHtml(paragraphInner: string, emoji: string): string {
  const textOnly = paragraphInner.replace(/<[^>]+>/g, "");
  if (!hasLeadingCalloutEmoji(textOnly)) return paragraphInner;

  // Prefer stripping from a leading text run so nested tags stay intact when possible.
  const escaped = emoji.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const leading = new RegExp(`^(\\s*)${escaped}\\s*`);
  if (leading.test(paragraphInner)) {
    return paragraphInner.replace(leading, "$1");
  }

  // Fallback: strip emoji from decoded plain text and re-wrap as a simple paragraph body.
  const trimmed = textOnly.trimStart();
  if (!trimmed.startsWith(emoji)) return paragraphInner;
  return trimmed.slice(emoji.length).replace(/^\s+/, "");
}

function structureCalloutInner(inner: string): { emoji: string; bodyInner: string } | null {
  const firstParagraph = firstParagraphMatch(inner);
  if (!firstParagraph) return null;
  const paragraphInner = firstParagraph[1]!;
  const text = paragraphInner.replace(/<[^>]+>/g, "");
  const emoji = extractLeadingCalloutEmoji(text);
  if (!emoji) return null;

  const strippedParagraphInner = stripLeadingEmojiFromParagraphHtml(paragraphInner, emoji);
  const rebuiltFirst = `<p>${strippedParagraphInner}</p>`;
  const rest = inner.slice(firstParagraph.index! + firstParagraph[0].length);
  const bodyInner = rebuiltFirst + rest;
  return { emoji, bodyInner };
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

    if (isCalloutBlockquoteInner(inner)) {
      const structured = structureCalloutInner(inner);
      const decoratedInner = decorateBlockquoteTags(structured?.bodyInner ?? inner);
      let taggedOpen = hasClass
        ? openTag.replace(/\bclass\s*=\s*(["'])([^"']*)\1/, (_match, quote, classes) => {
            const next = `${classes} tome-callout`.trim();
            return `class=${quote}${next}${quote}`;
          })
        : openTag.replace("<blockquote", '<blockquote class="tome-callout"');

      if (structured) {
        if (/\bdata-emoji\s*=/.test(taggedOpen)) {
          taggedOpen = taggedOpen.replace(
            /\bdata-emoji\s*=\s*(["'])[^"']*\1/,
            `data-emoji="${structured.emoji}"`,
          );
        } else {
          taggedOpen = taggedOpen.replace(/>$/, ` data-emoji="${structured.emoji}">`);
        }
        result +=
          taggedOpen +
          `<span class="tome-callout-icon" aria-hidden="true">${structured.emoji}</span>` +
          `<div class="tome-callout-body">${decoratedInner}</div>` +
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
 * Promote emoji-lead blockquotes to structured callouts:
 * `blockquote.tome-callout[data-emoji]` with `.tome-callout-icon` + `.tome-callout-body`.
 */
export function decorateCalloutHtml(html: string): string {
  return decorateBlockquoteTags(html);
}
