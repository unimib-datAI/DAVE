import { test, expect } from '@playwright/test';
import {
  ReflectionSchema,
  normalizeMarkdown,
  buildEvidencePool,
  runResearchLoop,
  sectionsFromPlan,
  type Reflection,
  type ResearchSection,
} from '../lib/deepResearch';
import { z } from 'zod';
import {
  AgentLLM,
  buildContextSentinel,
  buildNumberedContext,
  numberChunks,
  type RetrievedDocument,
} from '../lib/agentCore';
import { parseChatMode, isServerSideMode } from '../lib/chatMode';
import { parseJSONWithSchema } from '../lib/agentUtils';

/**
 * Browser-less checks (no running app, LLM or Elasticsearch needed) for the
 * deep research mode: planning, the research loop (with a mocked search and
 * reflector), the shared evidence pool and the mode selection.
 *
 *   npx playwright test deep-research --project=as-admin
 */

const doc = (id: number, ...chunkIds: string[]): RetrievedDocument => ({
  id,
  title: `Doc ${id}`,
  preview: '',
  chunks: chunkIds.map((c) => ({
    id: c,
    distance: 0,
    text: `text of ${c}`,
    metadata: { doc_id: String(id), chunk_size: 10 },
  })),
});

const plan = (
  sections: { title?: string; question: string; queries?: string[] }[]
) => ({
  standaloneQuery: 'q',
  language: 'en',
  entities: [],
  sections: sections.map((s) => ({
    title: s.title ?? '',
    question: s.question,
    queries: s.queries ?? [],
  })),
});

test.describe('planning', () => {
  test('sectionsFromPlan trims, dedupes, caps and always starts with the question', () => {
    const sections = sectionsFromPlan(
      plan([
        {
          title: 'A',
          question: ' What is A? ',
          queries: ['what is a', 'WHAT IS A?'],
        },
        { title: 'dup', question: 'what is a?' },
        { question: 'What is B?' },
        { question: 'What is C?' },
      ]),
      'fallback',
      2
    );
    expect(sections).toHaveLength(2);
    expect(sections[0].queries[0]).toBe('What is A?');
    // the same query in a different case is only searched once
    expect(sections[0].queries.map((q) => q.toLowerCase())).toEqual([
      'what is a?',
      'what is a',
    ]);
    // a missing title falls back to the question
    expect(sections[1].title).toBe('What is B?');
    expect(sections.map((s) => s.id)).toEqual([0, 1]);
  });

  test('an empty or unusable plan falls back to one section on the question', () => {
    const sections = sectionsFromPlan(
      plan([{ question: '  ' }]),
      'my question',
      5
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].question).toBe('my question');
    expect(sections[0].queries).toEqual(['my question']);
  });

  test('ReflectionSchema is lenient about mistyped fields', () => {
    const parsed = parseJSONWithSchema(
      '{"sections":[{"id":1,"sufficient":"yes","gapQueries":"x"},{"id":2}]}',
      ReflectionSchema
    );
    expect(parsed?.sections).toEqual([
      { id: 1, sufficient: true, gapQueries: [] },
      { id: 2, sufficient: true, gapQueries: [] },
    ]);
  });
});

test.describe('research loop', () => {
  const makeSections = (n: number): ResearchSection[] =>
    sectionsFromPlan(
      plan(
        Array.from({ length: n }, (_, i) => ({ question: `question ${i}` }))
      ),
      'fallback',
      n
    );

  test('stops at maxRounds even if the reflector always wants more', async () => {
    const sections = makeSections(2);
    let searches = 0;
    let reflections = 0;
    const rounds = await runResearchLoop({
      sections,
      maxRounds: 3,
      search: async (queries, s) => {
        searches++;
        return [doc(s.id, `c-${s.id}-${searches}`)];
      },
      reflect: async (active) => {
        reflections++;
        // a brand-new query every time
        return new Map<number, Reflection>(
          active.map((s) => [
            s.id,
            { sufficient: false, gapQueries: [`gap ${s.id} ${reflections}`] },
          ])
        );
      },
    });
    expect(rounds).toBe(3);
    expect(searches).toBe(6); // 2 sections x 3 rounds
    expect(reflections).toBe(2); // no reflection after the last round
    // every round added evidence
    expect(sections[0].docs[0].chunks.length).toBeGreaterThan(0);
  });

  test('stops after the first round when the evidence is sufficient', async () => {
    const sections = makeSections(3);
    const rounds = await runResearchLoop({
      sections,
      maxRounds: 3,
      search: async (_q, s) => [doc(s.id, `c${s.id}`)],
      reflect: async (active) =>
        new Map(
          active.map((s) => [s.id, { sufficient: true, gapQueries: [] }])
        ),
    });
    expect(rounds).toBe(1);
    expect(sections.every((s) => s.satisfied)).toBe(true);
  });

  test('only the unsatisfied sections are searched again, with new queries', async () => {
    const sections = makeSections(2);
    const calls: { id: number; queries: string[] }[] = [];
    await runResearchLoop({
      sections,
      maxRounds: 3,
      search: async (queries, s) => {
        calls.push({ id: s.id, queries });
        return [doc(s.id, `c${s.id}-${calls.length}`)];
      },
      reflect: async (active) =>
        new Map<number, Reflection>(
          active.map((s) =>
            s.id === 0
              ? [s.id, { sufficient: true, gapQueries: [] }]
              : [s.id, { sufficient: false, gapQueries: ['more on one'] }]
          )
        ),
    });
    const second = calls.filter((c) => c.id === 1)[1];
    expect(second.queries).toEqual(['more on one']);
    expect(calls.filter((c) => c.id === 0)).toHaveLength(1);
    // round 3: the reflector's repeat of "more on one" is a query already tried
    expect(calls.filter((c) => c.id === 1)).toHaveLength(2);
  });

  test('a gap query that was already tried ends the section instead of looping', async () => {
    const sections = makeSections(1);
    let searches = 0;
    const rounds = await runResearchLoop({
      sections,
      maxRounds: 10,
      search: async () => {
        searches++;
        return [];
      },
      reflect: async (active) =>
        new Map(
          active.map((s) => [
            s.id,
            { sufficient: false, gapQueries: [s.question.toUpperCase()] },
          ])
        ),
    });
    expect(searches).toBe(1);
    expect(rounds).toBe(1);
  });

  test('an aborted signal stops the loop', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      runResearchLoop({
        sections: makeSections(1),
        maxRounds: 3,
        signal: abort.signal,
        search: async () => [],
        reflect: async () => new Map(),
      })
    ).rejects.toThrow(/aborted/);
  });
});

test.describe('evidence pool and citations', () => {
  test('the pool numbers chunks globally, and a section sees its own numbers', () => {
    const a: ResearchSection = {
      ...sectionsFromPlan(plan([{ question: 'a' }]), 'f', 1)[0],
      docs: [doc(1, 'x1', 'x2'), doc(2, 'y1')],
    };
    const b: ResearchSection = {
      ...sectionsFromPlan(plan([{ question: 'b' }]), 'f', 1)[0],
      id: 1,
      docs: [doc(2, 'y1', 'y2'), doc(3, 'z1')],
    };
    const pool = buildEvidencePool([a, b]);

    // doc 2 is shared: one entry, its chunks merged, numbered once
    expect(pool.docs.map((d) => d.id).sort()).toEqual([1, 2, 3]);
    const numbers = Object.values(pool.chunkIndexMap).sort((x, y) => x - y);
    expect(numbers).toEqual([1, 2, 3, 4, 5]);
    expect(Object.keys(pool.chunkMap).sort()).toEqual([
      'x1',
      'x2',
      'y1',
      'y2',
      'z1',
    ]);

    // section b is written from its own chunks only, with the global numbers
    const ctx = buildNumberedContext(b.docs, pool.chunkIndexMap, null, 10_000);
    expect(ctx).toContain(`[${pool.chunkIndexMap.y2}] text of y2`);
    expect(ctx).toContain(`[${pool.chunkIndexMap.z1}] text of z1`);
    expect(ctx).not.toContain('text of x1');
  });

  test('an empty pool has no documents', () => {
    const sections = sectionsFromPlan(plan([{ question: 'a' }]), 'f', 1);
    expect(buildEvidencePool(sections).docs).toEqual([]);
  });

  test('numberChunks and the CTX sentinel agree', () => {
    const docs = [doc(7, 'a', 'b')];
    const { chunkMap, chunkIndexMap } = numberChunks(docs);
    expect(chunkIndexMap).toEqual({ a: 1, b: 2 });
    const sentinel = buildContextSentinel(docs, chunkMap, chunkIndexMap);
    expect(sentinel.startsWith('\x02DAVE_CTX\x1E')).toBe(true);
    expect(sentinel.endsWith('\x03')).toBe(true);
    const payload = JSON.parse(sentinel.slice('\x02DAVE_CTX\x1E'.length, -1));
    expect(payload.chunkIndexMap).toEqual({ a: 1, b: 2 });
    expect(payload.docs[0].id).toBe(7);
  });
});

test.describe('mode selection', () => {
  test('parseChatMode prefers mode and honours the legacy flag', () => {
    expect(parseChatMode('deep')).toBe('deep');
    expect(parseChatMode('agent', false)).toBe('agent');
    expect(parseChatMode(undefined, true)).toBe('agent');
    expect(parseChatMode(undefined)).toBe('standard');
    expect(parseChatMode('nonsense', true)).toBe('agent');
    // mode wins over the legacy flag
    expect(parseChatMode('standard', true)).toBe('standard');
  });

  test('agent and deep run server-side, standard does not', () => {
    expect(isServerSideMode('standard')).toBe(false);
    expect(isServerSideMode(undefined)).toBe(false);
    expect(isServerSideMode('agent')).toBe(true);
    expect(isServerSideMode('deep')).toBe(true);
  });
});

test.describe('markdown normalization', () => {
  test('puts blank lines around headings and before lists', () => {
    const raw =
      '# Title\nIntro text.\n## Section\nSentence.\n- one\n- two\nAfter.';
    expect(normalizeMarkdown(raw)).toBe(
      '# Title\n\nIntro text.\n\n## Section\n\nSentence.\n\n- one\n- two\nAfter.'
    );
  });

  test('collapses blank runs and the space left where a citation was removed', () => {
    expect(normalizeMarkdown('He met Rossi .\n\n\n\nThen left ,  later.')).toBe(
      'He met Rossi.\n\nThen left,  later.'
    );
  });

  test('leaves already well-formed Markdown unchanged', () => {
    const ok = '# T\n\nText.\n\n- a\n- b\n\n1. x\n2. y';
    expect(normalizeMarkdown(ok)).toBe(ok);
  });
});

test.describe('JSON agents on thinking models', () => {
  const schema = z.object({ ok: z.boolean() });
  type Reply = { content: string; finish: string };

  // An AgentLLM whose client replays `replies` and records each max_tokens.
  const stubbed = (replies: Reply[], key: string) => {
    const llm = new AgentLLM(`http://stub/${key}`, 'k', 'm', 'Test');
    const budgets: number[] = [];
    (llm as any).openai = {
      chat: {
        completions: {
          create: async (req: { max_tokens: number }) => {
            budgets.push(req.max_tokens);
            const r = replies.shift() ?? { content: '', finish: 'length' };
            return {
              choices: [
                { message: { content: r.content }, finish_reason: r.finish },
              ],
            };
          },
        },
      },
    };
    return { llm, budgets };
  };
  const ask = (llm: AgentLLM, extra: object) =>
    llm.askJSON({
      agent: 'T',
      system: 's',
      user: 'u',
      schema,
      fallback: { ok: false },
      maxTokens: 100,
      ...extra,
    });

  test('a reply cut off by the budget is retried with double the budget', async () => {
    const { llm, budgets } = stubbed(
      [
        { content: '', finish: 'length' },
        { content: '{"ok":true}', finish: 'stop' },
      ],
      'escalate'
    );
    expect(await ask(llm, { escalateOnLength: true })).toEqual({ ok: true });
    expect(budgets).toEqual([100, 200]);
  });

  test('the fallback reports why it was used', async () => {
    const { llm } = stubbed([], 'reason');
    let reason = '';
    const out = await ask(llm, {
      escalateOnLength: true,
      onFallback: (r: string) => (reason = r),
    });
    expect(out).toEqual({ ok: false });
    expect(reason).toMatch(/empty.*200-token budget/);
  });

  test('bypassBreaker keeps asking the model after repeated empty replies', async () => {
    const { llm } = stubbed([], 'bypass');
    // two empty replies arm the breaker for callers that do not bypass it
    await ask(llm, {});
    await ask(llm, {});
    const skipped = stubbed(
      [{ content: '{"ok":true}', finish: 'stop' }],
      'bypass'
    );
    // same endpoint/model key as above, so the breaker is open for it
    const llm2 = new AgentLLM('http://stub/bypass', 'k', 'm', 'Test');
    (llm2 as any).openai = (skipped.llm as any).openai;
    expect(await ask(llm2, {})).toEqual({ ok: false });
    expect(skipped.budgets).toEqual([]); // never called
    expect(await ask(llm2, { bypassBreaker: true })).toEqual({ ok: true });
    expect(skipped.budgets).toEqual([100]);
  });
});
