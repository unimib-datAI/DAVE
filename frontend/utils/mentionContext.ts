const ELLIPSES = '...';
const MENTION_PADDING = 60;

// TODO: design a bettern algorithm for finding the mention context
export function getMentionContext(
  text: string,
  mentionStart: number,
  mentionEnd: number
) {
  const start = Math.max(0, mentionStart - MENTION_PADDING);
  const end = Math.min(text.length, mentionEnd + MENTION_PADDING);

  const context =
    (start === 0 ? '' : ELLIPSES) +
    text.slice(start, end) +
    (end === text.length ? '' : ELLIPSES);

  const prefixLength = start === 0 ? 0 : ELLIPSES.length;
  const mentionStartInContext = prefixLength + mentionStart - start;
  const mentionEndInContext = mentionStartInContext + mentionEnd - mentionStart;

  return {
    context,
    mentionStart: mentionStartInContext,
    mentionEnd: mentionEndInContext,
  };
}
