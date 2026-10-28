from rapidfuzz import fuzz
from typing import List, TypedDict


class StringSimilarityOutput(TypedDict):
    firstIndex: int
    secondIndex: int
    score: int


def compute_string_similarity(
    items: List[str], threshold: float
) -> List[StringSimilarityOutput]:
    result: List[StringSimilarityOutput] = []
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            score = fuzz.token_set_ratio(items[i], items[j])
            # Token set ratio returns a score in [0, 100]
            if score / 100 >= threshold:
                result.append({"firstIndex": i, "secondIndex": j, "score": score})
    result.sort(key=lambda res: res["score"], reverse=True)
    return result
