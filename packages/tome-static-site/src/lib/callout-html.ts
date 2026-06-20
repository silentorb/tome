import { hasLeadingCalloutEmoji } from "tome-db/callout";

function isCalloutBlockquoteInner(inner: string): boolean {
  const firstParagraph = /<p>([^<]*)<\/p>/i.exec(inner);
  return Boolean(firstParagraph && hasLeadingCalloutEmoji(firstParagraph[1]!));
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
      const taggedOpen = hasClass
        ? openTag.replace(/\bclass\s*=\s*(["'])([^"']*)\1/, (_match, quote, classes) => {
            const next = `${classes} tome-callout`.trim();
            return `class=${quote}${next}${quote}`;
          })
        : openTag.replace("<blockquote", '<blockquote class="tome-callout"');
      result += taggedOpen + decorateBlockquoteTags(inner) + closeTag;
    } else {
      result += openTag + decorateBlockquoteTags(inner) + closeTag;
    }

    index = close + closeTag.length;
  }

  return result;
}

/** Add `tome-callout` to blockquotes whose first paragraph starts with a callout emoji. */
export function decorateCalloutHtml(html: string): string {
  return decorateBlockquoteTags(html);
}
