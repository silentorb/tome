const LEADING_CALLOUT_EMOJI =
  /^[\p{Extended_Pictographic}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{FE0F}\u{200D}]+(?:\s+)?/u;

/** Default emoji for new callouts from the editor slash menu. */
export const DEFAULT_CALLOUT_EMOJI = "💡";
export const DEFAULT_CALLOUT_PREFIX = `${DEFAULT_CALLOUT_EMOJI} `;

export function hasLeadingCalloutEmoji(text: string): boolean {
  return LEADING_CALLOUT_EMOJI.test(text.trimStart());
}

export function extractLeadingCalloutEmoji(text: string): string | null {
  const match = LEADING_CALLOUT_EMOJI.exec(text.trimStart());
  return match ? match[0].trim() : null;
}
