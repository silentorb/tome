import type { EditorState } from "@milkdown/prose/state";

/** Characters allowed in an active @mention query (includes spaces for multi-word title search). */
const MENTION_QUERY_CHARS = "[\\w\\-'. ]";

/** Matches @mention trigger at end of text before the cursor (within a text block). */
export const MENTION_TRIGGER_RE = new RegExp(
  `(?<![\\w@])@(${MENTION_QUERY_CHARS}{0,48})$`,
);

/** True when the whole string is a single @mention trigger (no trailing text). */
export function isMentionFragment(fragment: string): boolean {
  const match = MENTION_TRIGGER_RE.exec(fragment);
  return match !== null && match.index === 0 && match[0].length === fragment.length;
}

export interface ActiveMentionRange {
  query: string;
  replaceFrom: number;
  replaceTo: number;
}

function mentionFromTextBefore(
  textBefore: string,
  replaceTo: number,
  replaceFromOffset: number,
): ActiveMentionRange | null {
  const match = MENTION_TRIGGER_RE.exec(textBefore);
  if (!match || match.index === undefined) return null;
  const atOffset = match[0].indexOf("@");
  return {
    query: match[1] ?? "",
    replaceFrom: replaceFromOffset + match.index + atOffset,
    replaceTo,
  };
}

/** Range of the active @mention at the cursor, including @ and typed query. */
export function activeMentionRangeAtSelection(
  state: EditorState,
): ActiveMentionRange | null {
  const $from = state.selection.$from;
  if ($from.parent.isTextblock) {
    const textBefore = $from.parent.textBetween(
      0,
      $from.parentOffset,
      undefined,
      "\ufffc",
    );
    return mentionFromTextBefore(textBefore, $from.pos, $from.start());
  }

  const replaceTo = state.selection.from;
  const textStart = Math.max(0, replaceTo - 64);
  const textBefore = state.doc.textBetween(textStart, replaceTo, "\n", "\0");
  return mentionFromTextBefore(textBefore, replaceTo, textStart);
}

/** Range to replace on pick; extends through cursor when the last keystroke has not fired input yet. */
export function resolveMentionInsertRange(
  state: EditorState,
  stored: { replaceFrom: number; replaceTo: number } | null,
): ActiveMentionRange | null {
  const live = activeMentionRangeAtSelection(state);
  if (live) return live;
  if (!stored) return null;

  const cursor = state.selection.from;
  let replaceTo = stored.replaceTo;
  if (cursor > replaceTo) {
    const fragment = state.doc.textBetween(
      stored.replaceFrom,
      cursor,
      "\n",
      "\ufffc",
    );
    if (isMentionFragment(fragment)) {
      replaceTo = cursor;
    }
  }

  const fragment = state.doc.textBetween(
    stored.replaceFrom,
    replaceTo,
    "\n",
    "\ufffc",
  );
  const match = MENTION_TRIGGER_RE.exec(fragment);
  return {
    query: match?.[1] ?? "",
    replaceFrom: stored.replaceFrom,
    replaceTo,
  };
}
