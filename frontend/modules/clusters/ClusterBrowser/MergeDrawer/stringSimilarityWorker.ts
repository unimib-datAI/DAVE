import { token_set_ratio } from 'fuzzball';

type StringSimilarityWorkerInput = {
  strings: string[];
  threshold: number;
};

export type StringSimilarityWorkerOutput = {
  firstIndex: number;
  secondIndex: number;
  score: number;
};

self.onmessage = function (e: MessageEvent<StringSimilarityWorkerInput>) {
  const strings = e.data.strings;
  const result: StringSimilarityWorkerOutput[] = [];
  for (let i = 0; i < strings.length; i++) {
    for (let j = i + 1; j < strings.length; j++) {
      const score = token_set_ratio(strings[i], strings[j]);
      if (score / 100 >= e.data.threshold)
        result.push({ firstIndex: i, secondIndex: j, score });
    }
  }

  // Sort by descending score
  result.sort((a, b) => b.score - a.score);
  postMessage(result);
};
