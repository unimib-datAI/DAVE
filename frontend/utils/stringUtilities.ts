interface Chunk {
  chunk_id: string;
  text: string;
}
type SimilarityResults = Record<string, number>;

// ---------------------------------------------------------------------------
// Sentence splitting
// ---------------------------------------------------------------------------

function _splitBlockSentences(text: string, out: string[]): void {
  let i = 0;
  let start = 0;

  while (i < text.length) {
    const ch = text[i];

    // ! and ? are unambiguous sentence enders — consume runs of them.
    if (ch === '!' || ch === '?') {
      let j = i + 1;
      while (j < text.length && (text[j] === '!' || text[j] === '?')) j++;
      const seg = text.slice(start, j).trim();
      if (seg) out.push(seg);
      while (j < text.length && text[j] === ' ') j++;
      start = j;
      i = j;
      continue;
    }

    if (ch === '.') {
      // Heuristic 1: ellipsis — two or more consecutive dots → skip past all of them.
      if (text[i + 1] === '.' || (i > 0 && text[i - 1] === '.')) {
        while (i < text.length && text[i] === '.') i++;
        continue;
      }

      // Heuristic 2: decimal number — digit immediately before AND after the dot.
      if (
        i > 0 &&
        /\d/.test(text[i - 1]) &&
        i + 1 < text.length &&
        /\d/.test(text[i + 1])
      ) {
        i++;
        continue;
      }

      // Heuristic 3: acronym — the word immediately before the dot is exactly one letter
      // (e.g. s.p.a, U.S.A, e.g., i.e.).
      const prevWord = text.slice(0, i).match(/[A-Za-z]+$/)?.[0] ?? '';
      if (prevWord.length === 1) {
        i++;
        continue;
      }

      // Check what follows the dot — skip whitespace to find the next real character.
      let k = i + 1;
      while (k < text.length && text[k] === ' ') k++;

      // It IS a sentence end when followed by: end-of-string, newline, or an uppercase letter.
      if (k >= text.length || text[k] === '\n' || /[A-Z]/.test(text[k])) {
        const seg = text.slice(start, i + 1).trim();
        if (seg) out.push(seg);
        start = k;
        i = k;
        continue;
      }
    }

    i++;
  }

  const last = text.slice(start).trim();
  if (last) out.push(last);
}

/**
 * Split text into sentences.
 * Primary rule: a sentence ends at . ! ?
 * Heuristics to avoid false splits:
 *   - ellipsis (.., ...)
 *   - decimal numbers (3.14)
 *   - acronyms — single letter before the dot (U.S.A., e.g., s.p.a.)
 * Also splits on structural boundaries: double newlines and bullet/list markers.
 */
export function splitSentences(text: string): string[] {
  const result: string[] = [];
  // Structural split: paragraph breaks and list items.
  const blocks = text.split(/\n{2,}|\n(?=[ \t]*(?:[-*•]|\d+[.)])[ \t])/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (trimmed) _splitBlockSentences(trimmed, result);
  }
  return result;
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/\b[a-z0-9]+\b/g) ?? [];
}

function bigrams(tokens: string[]): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i < tokens.length - 1; i++) {
    result.add(`${tokens[i]}|${tokens[i + 1]}`);
  }
  return result;
}

// Fraction of sentence's bigrams found in chunk — rewards specific phrase matches.
function bigramRecall(
  sentBigrams: Set<string>,
  chunkBigrams: Set<string>
): number {
  if (sentBigrams.size === 0) return 0.0;
  let count = 0;
  sentBigrams.forEach((b) => {
    if (chunkBigrams.has(b)) count++;
  });
  return count / sentBigrams.size;
}

function extractNumbers(text: string): Set<string> {
  return new Set(text.match(/\b\d+\.?\d*\b/g) ?? []);
}

function jaccard(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  let intersection = 0;
  setA.forEach((x) => {
    if (setB.has(x)) intersection++;
  });
  let unionSize = setA.size;
  setB.forEach((x) => {
    if (!setA.has(x)) unionSize++;
  });
  return unionSize > 0 ? intersection / unionSize : 0.0;
}

function tokenRecall(
  sentenceTokens: Set<string>,
  chunkTokens: Set<string>
): number {
  if (sentenceTokens.size === 0) return 0.0;
  let count = 0;
  sentenceTokens.forEach((t) => {
    if (chunkTokens.has(t)) count++;
  });
  return count / sentenceTokens.size;
}

function idfWeightedRecall(
  sentenceTokens: string[],
  chunkTokenSet: Set<string>,
  idf: Record<string, number>
): number {
  const totalWeight = sentenceTokens.reduce(
    (sum, t) => sum + (idf[t] ?? 1.0),
    0
  );
  if (totalWeight === 0) return 0.0;
  const matchedWeight = sentenceTokens
    .filter((t) => chunkTokenSet.has(t))
    .reduce((sum, t) => sum + (idf[t] ?? 1.0), 0);
  return matchedWeight / totalWeight;
}

function numberOverlap(sentence: string, chunkText: string): number {
  const numsS = extractNumbers(sentence);
  const numsC = extractNumbers(chunkText);
  if (numsS.size === 0) return 0.0;
  let count = 0;
  numsS.forEach((n) => {
    if (numsC.has(n)) count++;
  });
  return count / numsS.size;
}

export function buildIdf(chunks: Chunk[]): Record<string, number> {
  const N = chunks.length;
  const df: Record<string, number> = {};
  chunks.forEach((chunk) => {
    const unique = new Set<string>();
    tokenize(chunk.text).forEach((t) => unique.add(t));
    unique.forEach((t) => {
      df[t] = (df[t] ?? 0) + 1;
    });
  });
  const result: Record<string, number> = {};
  Object.keys(df).forEach((token) => {
    result[token] = Math.log((N + 1) / (df[token] + 1)) + 1;
  });
  return result;
}

class BM25Okapi {
  private readonly k1 = 1.5;
  private readonly b = 0.75;
  private readonly epsilon = 0.25;
  private readonly corpusSize: number;
  private readonly avgdl: number;
  private readonly docFreqs: Map<string, number>[];
  private readonly docLen: number[];
  private readonly idf: Map<string, number>;

  constructor(corpus: string[][]) {
    this.corpusSize = corpus.length;
    this.docFreqs = [];
    this.docLen = [];
    const nd = new Map<string, number>();

    corpus.forEach((tokens) => {
      this.docLen.push(tokens.length);
      const freqs = new Map<string, number>();
      tokens.forEach((token) => {
        freqs.set(token, (freqs.get(token) ?? 0) + 1);
      });
      this.docFreqs.push(freqs);
      freqs.forEach((_, token) => {
        nd.set(token, (nd.get(token) ?? 0) + 1);
      });
    });

    this.avgdl =
      this.docLen.reduce((a, b) => a + b, 0) / (this.corpusSize || 1);
    this.idf = this._calcIdf(nd);
  }

  private _calcIdf(nd: Map<string, number>): Map<string, number> {
    const idf = new Map<string, number>();
    let idfSum = 0;
    const negativeIdfs: string[] = [];

    nd.forEach((freq, word) => {
      const val = Math.log(this.corpusSize - freq + 0.5) - Math.log(freq + 0.5);
      idf.set(word, val);
      idfSum += val;
      if (val < 0) negativeIdfs.push(word);
    });

    const eps = this.epsilon * (idf.size > 0 ? idfSum / idf.size : 0);
    negativeIdfs.forEach((word) => idf.set(word, eps));
    return idf;
  }

  getScores(query: string[]): number[] {
    const scores = new Array<number>(this.corpusSize).fill(0);
    for (const q of query) {
      const qIdf = this.idf.get(q) ?? 0;
      for (let i = 0; i < this.corpusSize; i++) {
        const qFreq = this.docFreqs[i].get(q) ?? 0;
        scores[i] +=
          qIdf *
          ((qFreq * (this.k1 + 1)) /
            (qFreq +
              this.k1 * (1 - this.b + (this.b * this.docLen[i]) / this.avgdl)));
      }
    }
    return scores;
  }
}

function calculateStringSimScores(
  sentence: string,
  chunks: Chunk[],
  idf?: Record<string, number>
): SimilarityResults {
  const sentTokens = tokenize(sentence);
  const sentSet = new Set(sentTokens);
  const sentBigrams = bigrams(sentTokens);

  if (sentTokens.length === 0) {
    const empty: SimilarityResults = {};
    chunks.forEach((c) => {
      empty[c.chunk_id] = 0;
    });
    return empty;
  }

  // Key tokens: the highest-IDF tokens in the sentence (top half by IDF score).
  // Used as a soft gate — chunk must share at least ONE key token to be considered.
  // This prevents generic chunks from winning on BM25 alone, while allowing
  // paraphrased sentences through (at least one specific word usually survives).
  const idfVals = sentTokens.map((t) => (idf ? idf[t] ?? 1.0 : 1.0));
  const avgIdf =
    idfVals.length > 0
      ? idfVals.reduce((a, b) => a + b, 0) / idfVals.length
      : 1.0;
  const keyTokenSet = new Set<string>();
  sentTokens.forEach((t, idx) => {
    if (idfVals[idx] >= avgIdf) keyTokenSet.add(t);
  });

  const corpusAllTokens = chunks.map((c) => tokenize(c.text));
  const bm25 = new BM25Okapi(corpusAllTokens);
  const rawBm25Scores = bm25.getScores(sentTokens);
  const maxBm25 = Math.max(...rawBm25Scores);
  const normBm25 = Math.max(maxBm25, 1.0);

  const results: SimilarityResults = {};
  for (let i = 0; i < chunks.length; i++) {
    const chunkSet = new Set(corpusAllTokens[i]);
    const chunkBigrams = bigrams(corpusAllTokens[i]);

    // Gate: at least 1 key token must appear in the chunk.
    // Cheap filter that eliminates off-topic chunks without blocking paraphrased content.
    if (keyTokenSet.size > 0) {
      let hasKey = false;
      keyTokenSet.forEach((t) => {
        if (chunkSet.has(t)) hasKey = true;
      });
      if (!hasKey) {
        results[chunks[i].chunk_id] = 0;
        continue;
      }
    }

    // 1. BM25 (normalised): standard retrieval signal.
    const bm25Score = Math.min(rawBm25Scores[i] / normBm25, 1.0);

    // 2. IDF-weighted token overlap: fraction of sentence tokens found in chunk,
    //    weighted by rarity. Works on all tokens (no stopword removal).
    const overlapScore = idf
      ? idfWeightedRecall(sentTokens, chunkSet, idf)
      : tokenRecall(sentSet, chunkSet);

    // 3. Bigram recall: fraction of sentence bigrams present in chunk.
    const bigramRec = bigramRecall(sentBigrams, chunkBigrams);

    // 4. Unigram Jaccard.
    const unigramJac = jaccard(sentSet, chunkSet);

    // 5. Number overlap.
    const numberScore = numberOverlap(sentence, chunks[i].text);

    // Weighted combination. Weights sum to 1.0.
    const score =
      0.4 * bm25Score +
      0.3 * overlapScore +
      0.15 * bigramRec +
      0.1 * unigramJac +
      0.05 * numberScore;

    results[chunks[i].chunk_id] = Math.round(score * 10000) / 10000;
  }
  return results;
}

interface SentenceScores {
  [chunkId: string]: number;
}

interface MatchingChunks {
  [sentenceIndex: number]: string[];
}

export async function findMatchingChunks(
  sentences: string[],
  chunks: Chunk[],
  threshold: number = 0.7
): Promise<MatchingChunks> {
  const idf = buildIdf(chunks);
  const matchingChunks: MatchingChunks = {};

  sentences.forEach((sentence, index) => {
    const sentenceNumber = index + 1;
    const scores = calculateStringSimScores(sentence, chunks, idf);
    const entries = Object.entries(scores).filter(([, s]) => s > 0);
    if (entries.length === 0) return;

    const aboveThreshold = entries.filter(([, score]) => score >= threshold);

    if (aboveThreshold.length > 0) {
      matchingChunks[sentenceNumber] = aboveThreshold.map(
        ([chunkId]) => chunkId
      );
    } else {
      // Always fall back to the single best chunk so paraphrased sentences get cited.
      const best = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
      matchingChunks[sentenceNumber] = [best[0]];
    }
  });

  return matchingChunks;
}
