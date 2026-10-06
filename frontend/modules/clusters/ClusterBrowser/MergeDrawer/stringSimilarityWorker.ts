import { token_set_ratio } from 'fuzzball';
import { ClusterWithDocId, Suggestion } from '../types';

type StringSimilarityWorkerType = {
  clusters: ClusterWithDocId[];
  threshold: number;
};

self.onmessage = function (e: MessageEvent<StringSimilarityWorkerType>) {
  console.log('computing suggestions inside worker...');
  const clusters = e.data.clusters;
  const result: Suggestion[] = [];
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const score = token_set_ratio(clusters[i].title, clusters[j].title);
      if (score / 100 >= e.data.threshold)
        result.push({ first: clusters[i], second: clusters[j], score });
    }
  }
  postMessage(result);
};
