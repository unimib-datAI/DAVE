import type { EntityAnnotation } from '@/lib/types/document';
import { pythonToJSIndex } from '@/lib/ner/core';

/**
 * An entity annotation reduced to what the markdown renderer needs, with its
 * offsets converted from Python codepoint offsets (how the backend stores
 * them - see `offset_type` and `lib/ner/core` getSpan) to JS (UTF-16) string
 * offsets so they line up with mdast source positions.
 */
export type MarkdownEntity = {
  id: number;
  type: string;
  /** the annotation's other types (features.types), for the "+N" chip */
  types?: string[];
  /** JS (UTF-16) offset into the markdown source */
  start: number;
  /** JS (UTF-16) offset into the markdown source */
  end: number;
  /**
   * The exact source substring the annotation covers. The plugin locates the
   * mention by searching for this string (with `start` as a hint) rather than
   * by offset arithmetic, which markdown parsing doesn't preserve.
   */
  text: string;
};

/**
 * Convert raw entity annotations to `MarkdownEntity`s: map offsets to JS
 * indices, sort by start, and drop overlapping / nested annotations (the
 * classic renderer discards those too - see `createNodes` in lib/ner/core).
 */
export function prepareMarkdownEntities(
  annotations: EntityAnnotation[],
  text: string
): MarkdownEntity[] {
  const mapped = annotations
    .map((ann) => {
      const start = pythonToJSIndex(ann.start, text);
      const end = pythonToJSIndex(ann.end, text);
      return {
        id: ann.id,
        type: ann.type,
        types: ann.features?.types ?? [],
        start,
        end,
        text: text.slice(start, end),
      };
    })
    .filter((a) => a.end > a.start && a.text.length > 0)
    .sort((a, b) => (a.start === b.start ? b.end - a.end : a.start - b.start));

  const out: MarkdownEntity[] = [];
  const seen = new Set<number>();
  let lastEnd = -1;
  for (const a of mapped) {
    if (seen.has(a.id)) continue; // duplicate id in the source data
    if (a.start < lastEnd) continue; // overlapping / nested - skip
    seen.add(a.id);
    out.push(a);
    lastEnd = a.end;
  }
  return out;
}

type AnyNode = {
  type: string;
  value?: string;
  children?: AnyNode[];
  position?: { start?: { offset?: number }; end?: { offset?: number } };
  data?: Record<string, unknown>;
};

type Options = {
  /** Entities to tag in this render, located by `text` content. */
  entities: MarkdownEntity[];
  /**
   * Render every newline inside a text node as a `<br>` (like the classic
   * `white-space: pre-wrap` renderer), instead of letting CommonMark collapse
   * a soft break into a space. Defaults to `false`.
   */
  softBreaks?: boolean;
};

/**
 * remark (mdast) plugin. Walks `text` nodes and, wherever an entity's `text`
 * appears, replaces that run with an `<entity-mention>` element. It also (when
 * `softBreaks`) turns every `\n` into a `<br>`.
 *
 * Entities are found by string search, not offset arithmetic - markdown
 * parsing (escapes, references, CRLF, `trim-lines`) doesn't preserve offsets.
 */
export function remarkEntityAnnotations({
  entities,
  softBreaks = false,
}: Options) {
  return (tree: AnyNode) => {
    if (entities.length === 0 && !softBreaks) return;
    // The caller (MarkdownNER) already clips every entity to a single block,
    // so an entity is normally one fragment. It can still be split if it
    // overlaps inline markup (`**bold**`) or a hard break within the block -
    // only the first fragment gets `id="entity-tag-<id>"` + the chip; the
    // rest render as a plain highlight (duplicate ids would break the
    // cluster list's getElementById navigation).
    const primaryEmitted = new Set<number>();
    walk(tree);

    function walk(node: AnyNode) {
      if (!node.children || !Array.isArray(node.children)) return;
      const nextChildren: AnyNode[] = [];
      for (const child of node.children) {
        if (
          child.type === 'text' &&
          typeof child.value === 'string' &&
          child.position?.start?.offset != null &&
          child.position?.end?.offset != null
        ) {
          nextChildren.push(...splitTextNode(child));
        } else {
          walk(child);
          nextChildren.push(child);
        }
      }
      node.children = nextChildren;
    }

    function splitTextNode(node: AnyNode): AnyNode[] {
      const nodeStart = node.position!.start!.offset!;
      const value = node.value as string;

      // Locate each entity by its text content within this node.
      type Found = { e: MarkdownEntity; at: number; len: number };
      const found: Found[] = [];
      for (const e of entities) {
        if (!e.text) continue;
        const hint = e.start - nodeStart;
        if (hint > value.length + 4 || hint + e.text.length < -4) continue;

        const candidates = [e.text, e.text.replace(/[*_~`]/g, '')];
        let matched = false;
        for (const want of candidates) {
          if (!want) continue;
          let at = value.indexOf(want, Math.max(0, hint - 8));
          if (at === -1) at = value.indexOf(want);
          if (at !== -1) {
            found.push({ e, at, len: want.length });
            matched = true;
            break;
          }
        }
        if (matched) continue;

        // Entity text is split by inline markup it partly crosses
        // (`**John** Smith`): match each markup-delimited piece separately.
        const pieces = e.text.split(/[*_~`]+/).filter((p) => p.trim().length > 1);
        if (pieces.length > 1) {
          let any = false;
          for (const piece of pieces) {
            const pAt = value.indexOf(piece);
            if (pAt !== -1) {
              found.push({ e, at: pAt, len: piece.length });
              any = true;
            }
          }
          if (any) continue;
        }

        // Entity text straddles this node (hard break / inline markup) - tag
        // the leading or trailing part that lives here.
        const head = e.text.split('\n')[0].trimEnd();
        if (head && head.length < e.text.length && value.endsWith(head)) {
          found.push({ e, at: value.length - head.length, len: head.length });
          continue;
        }
        const tail = e.text.split('\n').pop()!.trimStart();
        if (tail && tail.length < e.text.length && value.startsWith(tail)) {
          found.push({ e, at: 0, len: tail.length });
        }
      }
      found.sort((a, b) => a.at - b.at);

      if (found.length === 0 && !softBreaks) return [node];

      const out: AnyNode[] = [];
      const pushPlain = (chunk: string) => {
        if (!chunk) return;
        if (!softBreaks || !chunk.includes('\n')) {
          out.push({ type: 'text', value: chunk });
          return;
        }
        const parts = chunk.split('\n');
        parts.forEach((part, i) => {
          if (part) out.push({ type: 'text', value: part });
          if (i < parts.length - 1) {
            out.push({
              type: 'entityBreak',
              data: { hName: 'br', hProperties: {}, hChildren: [] },
            });
          }
        });
      };

      let cursor = 0;
      for (const { e, at, len } of found) {
        if (at < cursor) continue; // overlaps a previous mention - skip
        if (at > cursor) pushPlain(value.slice(cursor, at));
        out.push(mention(value.slice(at, at + len), e));
        cursor = at + len;
      }
      if (cursor < value.length) pushPlain(value.slice(cursor));

      return out.length > 0 ? out : [node];
    }

    function mention(value: string, e: MarkdownEntity): AnyNode {
      const isPrimary = !primaryEmitted.has(e.id);
      if (isPrimary) primaryEmitted.add(e.id);
      return {
        type: 'entityMention',
        data: {
          hName: 'entity-mention',
          hProperties: {
            'data-entity-id': String(e.id),
            'data-entity-type': e.type,
            'data-entity-types': (e.types ?? []).join(','),
            ...(isPrimary ? { 'data-entity-primary': '1' } : {}),
          },
          hChildren: [{ type: 'text', value }],
        },
      };
    }
  };
}
