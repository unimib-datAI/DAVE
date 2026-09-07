# Chunk Citation — How It Works (friendly breakdown)

This document explains, in plain terms, how sentence-to-chunk citation works in the codebase, what metrics are used, and how the final score is computed. See the implementation in [frontend/utils/stringUtilities.ts](frontend/utils/stringUtilities.ts).

**Overview**

- **Goal:** given a sentence, find the most relevant chunk(s) from a corpus of text chunks so we can cite the source for that sentence.
- **High level pipeline:** `splitSentences` → tokenize → `buildIdf` → `calculateStringSimScores` (per-sentence scoring) → `findMatchingChunks` (threshold + fallback).

**Tokenization & basics**

- Tokenization: lowercased alphanumeric tokens using the regex `\b[a-z0-9]+\b` (function: `tokenize`).
- Bigrams: adjacent token pairs (function: `bigrams`).
- IDF: computed by `buildIdf` with the formula $\text{idf}(t)=\log\frac{N+1}{df_t+1}+1$, where $N$ is number of chunks and $df_t$ is document frequency.

**Gate: key tokens (cheap topical filter)**

- From the sentence tokens we pick the tokens with IDF >= sentence-average IDF — these are the *key tokens*.
- A chunk must contain at least one key token to be considered; otherwise it's immediately given score 0. This is a lightweight topical filter to avoid off-topic chunks.

**Metrics used to score sentence vs chunk**

Scores are computed per chunk and combined as a weighted sum. The metrics are:

- **BM25 (weight 0.40)** — a classic probabilistic IR score implemented in `BM25Okapi` with `k1=1.5`, `b=0.75`. BM25 is computed across chunk token frequencies and then normalized by the maximum BM25 score across all chunks for that sentence. `BM25Okapi` uses the standard idf: $\log(N-df+0.5)-\log(df+0.5)$ with negative idfs clamped to a small positive epsilon.

- **IDF‑weighted token overlap (weight 0.30)** — fraction of sentence tokens that appear in the chunk, weighted by token IDF. Implemented in `idfWeightedRecall`. If IDF data isn't provided, a plain token recall fallback is used.

- **Bigram recall (weight 0.15)** — fraction of sentence bigrams that also appear in the chunk; rewards exact phrase matches (function: `bigramRecall`).

- **Unigram Jaccard (weight 0.10)** — Jaccard similarity between sets of sentence tokens and chunk tokens (function: `jaccard`).

- **Number overlap (weight 0.05)** — fraction of numeric tokens found both in the sentence and chunk (function: `numberOverlap`). Useful for numerical claims and facts.

**Final score formula**

The weighted sum is:

$$
\text{score} = 0.4\cdot BM25 + 0.3\cdot Overlap + 0.15\cdot Bigram + 0.1\cdot Jaccard + 0.05\cdot Numbers
$$

Scores are rounded to 4 decimal places before being returned.

**Thresholding and fallback (in `findMatchingChunks`)**

- Default threshold is 0.7. For each sentence, the code picks all chunks with score >= threshold.
- If no chunk reaches the threshold, the algorithm falls back to the single best-scoring chunk (so paraphrased sentences still get a citation).
- The function returns a mapping of sentence index → list of chunk IDs.

**Practical example (quick math)**

- Suppose for a sentence a candidate chunk yields: BM25=0.8, Overlap=0.6, Bigram=0.4, Jaccard=0.3, Numbers=0.0.

Compute:

- 0.4*0.8 = 0.32
- 0.3*0.6 = 0.18
- 0.15*0.4 = 0.06
- 0.1*0.3 = 0.03
- 0.05*0.0 = 0.00

Total score = 0.32 + 0.18 + 0.06 + 0.03 + 0.00 = 0.59 → below the 0.7 threshold, so this chunk would only be chosen if it's the single best one.

**Why each metric matters (intuition)**

- `BM25`: strong retrieval signal for general relevance and term frequency importance.
- `IDF-weighted overlap`: ensures rare/important words matter more than stopwords.
- `Bigram recall`: captures exact phrasing and localized matches (good for quotes and names).
- `Jaccard`: measures overall token set overlap (robust when word order varies).
- `Number overlap`: specifically catches numerical evidence (dates, quantities).
- `Key token gate`: prevents generic chunks from scoring highly purely with BM25 or overlap — the chunk must share at least one specific token.

**Where code lives**

- Main implementation: [frontend/utils/stringUtilities.ts](frontend/utils/stringUtilities.ts)
  - `splitSentences`, `tokenize`, `buildIdf`, `BM25Okapi`, `calculateStringSimScores`, `findMatchingChunks` are all in that file.

**Tuning knobs you can change**

- Weights for each metric (currently 0.4/0.3/0.15/0.1/0.05). Change to favor precision vs recall.
- BM25 `k1`/`b` constants in `BM25Okapi`.
- Threshold in `findMatchingChunks` (default 0.7) — lower to get more matches, raise to be stricter.
- The key-token selection heuristic (IDF cutoff) — adjust to allow more or fewer chunks through the gate.

**Quick checklist for debugging**

- If too many off-topic chunks are chosen: raise the threshold, increase key-token strictness, or increase weight of IDF-overlap.
- If paraphrased sentences miss their chunk: lower the threshold or rely on the fallback best-chunk behavior.
- If numeric matches are important: increase the Numbers weight.

**Next steps (optional additions)**

- Add a short unit test that runs `calculateStringSimScores` on contrived sentences and chunks to show behavior.
- Add a visualization of component contributions per-chunk (bar chart of the five metrics).

---

If you'd like, I can also: add a short example test file, generate the visualization, or insert inline code comments in `frontend/utils/stringUtilities.ts`. Which next step do you want?