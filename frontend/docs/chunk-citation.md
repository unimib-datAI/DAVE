# Chunk Citation in Standard RAG

This document explains how DAVE associates each sentence in an LLM-generated answer to one or more retrieved chunks in standard RAG mode. The full pipeline lives in two files:

- **`hooks/use-chat.ts`** — post-generation processing
- **`utils/stringUtilities.ts`** — sentence splitting and similarity scoring

---

## High-Level Pipeline

```
LLM response (raw text)
        │
        ▼
  splitSentences()          ← same function used later in the renderer
        │
        ▼
  clean each sentence       ← strip [n] markers the LLM may have emitted
        │
        ▼
  findMatchingChunks()      ← score every sentence against every chunk
        │
        ▼
  citations map             ← { sentenceIndex: chunkId[] }
        │
        ▼
  stored on Message         ← content + citations + chunkMap + chunkIndexMap
        │
        ▼
  AnnotatedMarkdown         ← re-splits, looks up citations, renders badges
```

---

## Step 1 — Sentence Splitting (`splitSentences`)

The raw LLM output is split into sentences with `splitSentences()` defined in `stringUtilities.ts`. The same function is called again in `AnnotatedMarkdown` at render time, so the sentence indices are guaranteed to stay in sync.

### Structural split first

Before any punctuation logic, the text is broken on structural boundaries:

```
\n\n          paragraph breaks
\n[-*•]       unordered list items
\n\d+[.)]     ordered list items
```

Each resulting block is then passed to `_splitBlockSentences`.

### Intra-block splitting rules

A `.` is treated as a sentence boundary **only when**:
- it is not part of an ellipsis (`..`, `...`)
- it is not a decimal separator (digit on both sides)
- the word immediately before it is not a single letter (acronym guard: `e.g.`, `U.S.A.`, `s.p.a.`)
- it is followed by end-of-string, a newline, or an uppercase letter

`!` and `?` are always sentence boundaries (runs of them are consumed as one).

---

## Step 2 — Cleaning Citations from Sentences

Before scoring, any `[n]` markers that the LLM may have emitted are stripped from each sentence so they do not bias the lexical matching:

```ts
sentence
  .replace(/\s*\[\d+(?:[,\s]+\d+)*\]/g, '')   // remove [1], [1, 2], [1 2] etc.
  .replace(/(\s*,)+\s*(?=[,.]|$)/g, '')        // clean up orphaned commas
  .trim()
```

The cleaned sentences become both the `displayText` stored on the message and the input to the scoring step.

---

## Step 3 — IDF Computation (`buildIdf`)

A single IDF table is computed once over the whole set of retrieved chunks before any sentence is scored. This ensures that rare terms score higher than common ones consistently across all sentences.

The formula used is a smoothed variant of standard IDF:

```
idf(t) = log( (N + 1) / (df(t) + 1) ) + 1
```

Where:
- `N` is the total number of chunks
- `df(t)` is the number of chunks that contain token `t`
- the `+1` inside the log prevents division-by-zero and the outer `+1` keeps the value positive for terms that appear in every chunk

---

## Step 4 — Per-Sentence Scoring (`calculateStringSimScores`)

For each sentence, this function returns a score in `[0, 1]` for **every** chunk. The process has two parts: a cheap gate and then a weighted combination of five signals.

### Key-token gate

Before computing the full score, a fast filter eliminates clearly unrelated chunks:

1. Tokenize the sentence and look up each token's IDF value.
2. Keep only tokens whose IDF is at or above the sentence average — these are the "key tokens" (the specific, rare words).
3. If a chunk does not contain **at least one** key token, its score is immediately set to `0` and it is skipped.

This prevents generic chunks from accumulating high BM25 scores just because they are long.

### The five signals

| # | Signal | Weight | What it measures |
|---|--------|--------|-----------------|
| 1 | **BM25** (normalised) | 0.40 | Standard probabilistic retrieval signal. Rewards term frequency in the chunk while penalising very long chunks. Scores are normalised to `[0, 1]` by dividing by the max BM25 score across all chunks. |
| 2 | **IDF-weighted token recall** | 0.30 | Fraction of the sentence's tokens that appear in the chunk, weighted by rarity. A rare token that is present contributes more than a common one. |
| 3 | **Bigram recall** | 0.15 | Fraction of the sentence's consecutive token pairs (`word1\|word2`) that appear in the chunk. Rewards phrase-level matches, not just bag-of-words overlap. |
| 4 | **Unigram Jaccard** | 0.10 | Intersection over union of token sets. Penalises chunks that contain many extra words not present in the sentence. |
| 5 | **Number overlap** | 0.05 | Fraction of numeric literals in the sentence (`3`, `14.5`, etc.) that also appear in the chunk. Anchors citations to chunks that share the same figures. |

The final score is:

```
score = 0.40 * bm25
      + 0.30 * idfWeightedRecall
      + 0.15 * bigramRecall
      + 0.10 * unigramJaccard
      + 0.05 * numberOverlap
```

---

## Step 5 — Threshold & Fallback (`findMatchingChunks`)

After scoring, each sentence selects its cited chunks with the following rule:

```
threshold = 0.6

if any chunks score >= threshold:
    cite all of them          ← a sentence can cite multiple chunks
else:
    cite the single best one  ← always at least one citation
```

The multi-citation case is why a sentence can have more than one badge: any chunk whose composite score meets the threshold is included, regardless of how many that turns out to be.

The fallback guarantees that even paraphrased sentences — where the LLM rephrased source content and no chunk crosses the threshold — still get a citation pointing to the most relevant chunk.

The output is:

```ts
matchingChunks: {
  1: ["chunk-id-A"],
  2: ["chunk-id-B", "chunk-id-C"],   // sentence 2 cites two chunks
  3: ["chunk-id-A"],
  ...
}
```

---

## Step 6 — Storing the Result on the Message

When streaming ends, the assistant `Message` object is updated with four fields that together carry everything the renderer needs:

| Field | Type | Content |
|-------|------|---------|
| `content` | `string` | Clean display text (sentences joined with `\n\n`, no `[n]` markers) |
| `citations` | `{ [sentenceIndex: number]: string[] }` | 1-based sentence index → list of chunk IDs |
| `chunkMap` | `{ [chunkId: string]: string }` | chunk ID → raw chunk text (for tooltip) |
| `chunkIndexMap` | `{ [chunkId: string]: number }` | chunk ID → display number `n` shown in the badge |

---

## Step 7 — Rendering (`AnnotatedMarkdown`)

The `AnnotatedMarkdown` component in `modules/search/Message.tsx` receives those four fields and renders citation badges inline.

1. It calls `splitSentences(content)` — **exactly the same function** used in `use-chat.ts`, so every `i` maps to the same sentence.
2. For sentence at index `i`, it looks up `citations[i + 1]` (indices are 1-based).
3. For each `chunkId` in the list it creates a superscript badge `[n]` where `n = chunkIndexMap[chunkId]`.
4. The badge is wrapped in a `Tooltip` whose content is the raw `chunkMap[chunkId]` text, shown on hover.

```
Sentence text [1][3]
              │   └─ tooltip: text of chunk 3
              └──── tooltip: text of chunk 1
```

---

## Why the Splitter Must Match Exactly

The `citations` map is keyed by sentence index. If `AnnotatedMarkdown` produced a different segmentation from `use-chat.ts`, sentence 3 in the renderer might correspond to sentence 4 in the map, causing badges to appear on the wrong sentences or not at all. The shared `splitSentences` import is the contract that keeps the two in sync.

---

## Summary of Data Structures

```
processedChunks   { chunk_id, text }[]          flat ordered list built at request time
chunkMap          { chunkId → text }             chunk text lookup for tooltips
chunkIndexMap     { chunkId → n }                chunk display number lookup
indexChunkMap     { n → chunkId }                reverse lookup (used internally)
matchingChunks    { sentenceIndex → chunkId[] }  the citation map attached to the message
```
