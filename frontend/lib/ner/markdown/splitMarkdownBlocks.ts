export type MarkdownBlock = {
  /** offset of the first character of the block in the full source */
  start: number;
  /** offset just past the block's last character (incl. its trailing newline) */
  end: number;
};

/**
 * Split a markdown document into top-level blocks so the renderer can
 * virtualize them.
 *
 * This is a deliberately cheap, dependency-free splitter (the project's
 * markdown deps are not hoisted under pnpm, so a real `remark-parse` is not
 * importable here). It uses the CommonMark rule that a blank line separates
 * block-level constructs, with an explicit carve-out for fenced code blocks
 * (which may legally contain blank lines).
 *
 * Consequences of the heuristic, all acceptable for these documents:
 *  - a "loose" list (blank lines between items) renders as one `<ul>` per item
 *  - a blockquote broken by a blank line renders as adjacent blockquotes
 *  - an entity spanning a blank line is clipped to each block (rendered as two
 *    tags sharing the same id, like an entity spanning inline markup)
 *
 * Offsets are exact, so entity placement and selection mapping stay correct.
 */
export function splitMarkdownBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const n = text.length;

  let blockStart = -1;
  let blockEnd = -1;
  let inFence = false;
  let fenceChar = '';

  let i = 0;
  while (i < n) {
    const nl = text.indexOf('\n', i);
    const lineEnd = nl === -1 ? n : nl + 1; // include the newline
    const line = text.slice(i, nl === -1 ? n : nl);

    const fenceOpen = /^ {0,3}(`{3,}|~{3,})/.exec(line);

    if (inFence) {
      blockEnd = lineEnd;
      const close = new RegExp(`^ {0,3}${fenceChar}{3,}\\s*$`);
      if (close.test(line)) inFence = false;
    } else if (fenceOpen) {
      if (blockStart === -1) blockStart = i;
      blockEnd = lineEnd;
      inFence = true;
      fenceChar = fenceOpen[1][0];
    } else if (line.trim() === '') {
      if (blockStart !== -1) {
        blocks.push({ start: blockStart, end: blockEnd });
        blockStart = -1;
      }
    } else {
      if (blockStart === -1) blockStart = i;
      blockEnd = lineEnd;
    }

    i = lineEnd;
  }

  if (blockStart !== -1) blocks.push({ start: blockStart, end: blockEnd });
  if (blocks.length === 0 && n > 0) blocks.push({ start: 0, end: n });

  return blocks;
}
