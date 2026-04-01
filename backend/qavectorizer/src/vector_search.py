"""
VectorSearch: hybrid dense + full-text search with Reciprocal Rank Fusion (RRF).

Each returned chunk carries a `text_emb` field — a Python list of float32 values
produced by `all-MiniLM-L6-v2` — computed in a single batched call for efficiency.

Quick usage:
    vector_search = VectorSearch(model, es_client, tokenizer, retrievers, default_retriever)
    results = vector_search.search("my_index", "What is ML?", retrieval_method="full")
"""

import json
from collections import defaultdict
from typing import Any, Callable, Dict, List, Optional

import torch
from retriever import DocumentRetriever
from sentence_transformers import SentenceTransformer
from transformers import PreTrainedTokenizer
import hashlib
from elasticsearch import Elasticsearch

_CHUNK_INNER_HIT_FIELDS = [
    "chunks.vectors.text",
    "chunks.vectors.text_anonymized",
    "_score",
]
_FULL_DOC_KEYWORDS = {"estrai", "riassumi"}
_TOKEN_LIMIT = 18_000


class VectorSearch:
    """
    Hybrid vector + full-text search with Reciprocal Rank Fusion (RRF).

    Dense retrieval uses the primary `model` (e.g. gte-multilingual-base).
    Chunk-level attribution embeddings are produced by a lightweight
    `all-MiniLM-L6-v2` model and attached to every returned chunk as
    `text_emb`.
    """

    def __init__(
        self,
        model: SentenceTransformer,
        es_client: Elasticsearch,
        tokenizer: PreTrainedTokenizer,
        retrievers: Dict[str, DocumentRetriever],
        default_retriever: DocumentRetriever,
    ):
        self.model = model
        self.es_client = es_client
        self.tokenizer = tokenizer
        self.retrievers = retrievers
        self.default_retriever = default_retriever
        self.chunk_embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

    # ── public API ────────────────────────────────────────────────────────────

    def search(
        self,
        collection_name: str,
        query: str,
        retrieval_method: str,
        filter_ids: Optional[List[str]] = None,
        collection_id: Optional[str] = None,
        force_rag: bool = False,
        collect_chunk_ranks_fn: Callable = None,
        collect_chunk_ranks_full_text_fn: Callable = None,
    ) -> List[Dict[str, Any]]:
        """
        Perform hybrid search and return ranked document results with chunks.

        Each chunk in the response includes a `text_emb` field containing its
        all-MiniLM-L6-v2 embedding (computed in a single batched inference call).

        Args:
            collection_name: Elasticsearch index to search.
            query: Query string.
            retrieval_method: One of 'full', 'dense', 'full-text', 'hibrid_no_ner'.
            filter_ids: Restrict search to these document IDs.
            collection_id: Additional collection filter.
            force_rag: Always return chunks, never full documents.
            collect_chunk_ranks_fn: Extracts {chunk_id: rank} from a KNN response.
            collect_chunk_ranks_full_text_fn: Same for a full-text response.
        """
        single_doc_mode = bool(filter_ids and len(filter_ids) == 1)

        # 1. Encode query
        with torch.no_grad():
            query_embeddings = self.model.encode(query).tolist()

        # 2. Build & run ES queries
        knn_k, chunks_to_gather, inner_hits_size = (
            64,
            (20 if single_doc_mode else 100),
            50,
        )
        query_body, query_full_text = self._build_queries(
            query=query,
            embeddings=query_embeddings,
            retrieval_method=retrieval_method,
            filter_ids=filter_ids,
            collection_id=collection_id,
            knn_k=knn_k,
            inner_hits_size=inner_hits_size,
        )

        dense_results = (
            self.es_client.search(index=collection_name, body=query_body)
            if retrieval_method in ("full", "dense", "hibrid_no_ner")
            else []
        )
        fulltext_results = (
            self.es_client.search(index=collection_name, body=query_full_text)
            if retrieval_method in ("full", "hibrid_no_ner", "full-text")
            else []
        )

        # 3. RRF fusion
        vector_ranks = collect_chunk_ranks_fn(dense_results) if dense_results else {}
        full_text_ranks = (
            collect_chunk_ranks_full_text_fn(fulltext_results)
            if fulltext_results
            else {}
        )
        final_ranking = self._rrf_rank(vector_ranks, full_text_ranks, single_doc_mode)

        # 4. Collect top chunks (no embeddings yet)
        doc_chunks_id_map = (
            self._gather_chunks_single_doc(final_ranking, chunks_to_gather)
            if single_doc_mode
            else self._gather_chunks_multi_doc(final_ranking)
        )

        # 5. Batch-encode all chunk texts in one shot
        self._embed_chunks(doc_chunks_id_map)

        # 6. Fetch full documents from ES
        full_docs = self._fetch_full_docs(
            collection_name, list(doc_chunks_id_map.keys())
        )

        # 7. Assemble and return results
        return self._prepare_results(
            full_docs=full_docs,
            doc_chunks_id_map=doc_chunks_id_map,
            query=query,
            filter_ids=filter_ids,
            force_rag=force_rag,
        )

    # ── RRF ───────────────────────────────────────────────────────────────────

    @staticmethod
    def _rrf_rank(
        vector_ranks: Dict,
        full_text_ranks: Dict,
        single_doc_mode: bool,
    ) -> List:
        """Combine dense and full-text ranks via RRF (full-text weighted 5×)."""
        rrf_k = 50 if single_doc_mode else 30
        all_ids = set(vector_ranks) | set(full_text_ranks)
        scores = {
            cid: (1 / (rrf_k + vector_ranks.get(cid, float("inf"))))
            + 5.0 * (1 / (rrf_k + full_text_ranks.get(cid, float("inf"))))
            for cid in all_ids
        }
        return sorted(scores.items(), key=lambda x: x[1], reverse=True)

    # ── chunk gathering ───────────────────────────────────────────────────────

    @staticmethod
    def _make_chunk(doc_id: str, text: str, text_anonymized: str) -> Dict[str, Any]:
        """Build a chunk dict. `text_emb` is added later by `_embed_chunks`."""
        return {
            "id": doc_id + "_" + hashlib.sha256(text.encode("utf-8")).hexdigest(),
            "text": text,
            "text_anonymized": text_anonymized,
            "metadata": {"doc_id": doc_id, "chunk_size": len(text)},
        }

    def _embed_chunks(self, doc_chunks_id_map: Dict[str, List[Dict]]) -> None:
        """Batch-encode all chunk texts and attach `text_emb` in-place."""
        flat = [chunk for chunks in doc_chunks_id_map.values() for chunk in chunks]
        if not flat:
            return
        with torch.no_grad():
            embeddings = self.chunk_embedding_model.encode(
                [c["text"] for c in flat], batch_size=64, show_progress_bar=False
            )
        for chunk, emb in zip(flat, embeddings):
            chunk["text_emb"] = emb.tolist()

    def _gather_chunks_single_doc(
        self, final_ranking: List, chunks_to_gather: int
    ) -> Dict[str, List[Dict]]:
        doc_chunks: Dict[str, List[Dict]] = {}
        for chunk_id, _ in final_ranking[:chunks_to_gather]:
            doc_id, text, text_anon = chunk_id[0], chunk_id[1], chunk_id[2]
            doc_chunks.setdefault(doc_id, []).append(
                self._make_chunk(doc_id, text, text_anon)
            )
        return doc_chunks

    def _gather_chunks_multi_doc(
        self,
        final_ranking: List,
        max_docs: int = 5,
        max_chunks_per_doc: int = 5,
    ) -> Dict[str, List[Dict]]:
        doc_chunk_scores: Dict[str, List] = defaultdict(list)
        for chunk_id, score in final_ranking:
            doc_chunk_scores[chunk_id[0]].append((score, chunk_id))

        sorted_docs = sorted(
            doc_chunk_scores.items(),
            key=lambda x: max(s for s, _ in x[1]),
            reverse=True,
        )

        doc_chunks: Dict[str, List[Dict]] = {}
        for doc_id, chunks in sorted_docs[:max_docs]:
            for _, chunk_id in sorted(chunks, reverse=True)[:max_chunks_per_doc]:
                doc_id_, text, text_anon = chunk_id[0], chunk_id[1], chunk_id[2]
                doc_chunks.setdefault(doc_id, []).append(
                    self._make_chunk(doc_id_, text, text_anon)
                )
        return doc_chunks

    # ── document retrieval ────────────────────────────────────────────────────

    def _fetch_full_docs(self, collection_name: str, doc_ids: List[str]) -> List[Dict]:
        """Fetch full document source from ES, with a retriever fallback."""
        try:
            resp = self.es_client.search(
                index=collection_name,
                body={
                    "query": {"terms": {"id": doc_ids}},
                    "_source": ["id", "name", "text", "text_anonymized", "preview"],
                    "size": len(doc_ids),
                },
            )
            id_to_doc: Dict[str, Dict] = {}
            for hit in resp.get("hits", {}).get("hits", []):
                src = hit.get("_source", {})
                doc_id = src.get("id") or hit.get("_id")
                if doc_id is not None:
                    id_to_doc[str(doc_id)] = src
            return [id_to_doc[str(did)] for did in doc_ids if str(did) in id_to_doc]
        except Exception:
            print("ES fetch failed — falling back to configured retriever")
            retriever = self.retrievers.get(collection_name, self.default_retriever)
            return [
                d for did in doc_ids if "error" not in (d := retriever.retrieve(did))
            ]

    # ── result preparation ────────────────────────────────────────────────────

    def _prepare_results(
        self,
        full_docs: List[Dict],
        doc_chunks_id_map: Dict[str, List[Dict]],
        query: str,
        filter_ids: Optional[List[str]],
        force_rag: bool,
    ) -> List[Dict[str, Any]]:
        """Decide whether to return full-doc chunks or retrieved chunks."""
        single_doc_mode = bool(filter_ids and len(filter_ids) == 1)
        full_docs_flag = any(kw in query.lower() for kw in _FULL_DOC_KEYWORDS)

        if force_rag:
            print("FORCE RAG ENABLED")
            return [
                {"doc": doc, "chunks": doc_chunks_id_map[doc["id"]], "full_docs": False}
                for doc in full_docs
            ]

        if single_doc_mode and full_docs:
            tokens = self.tokenizer.tokenize(full_docs[0]["text"])
            print(f"Number of tokens: {len(tokens)}")
            if len(tokens) < _TOKEN_LIMIT:
                return [
                    {
                        "full_docs": False,
                        "doc": full_docs[0],
                        "chunks": doc_chunks_id_map[full_docs[0]["id"]],
                    }
                ]

        if full_docs_flag:
            token_count = sum(
                len(self.tokenizer.tokenize(doc["text"])) for doc in full_docs
            )
            if token_count <= _TOKEN_LIMIT:
                return self._full_doc_results(full_docs)

        return [
            {"doc": doc, "chunks": doc_chunks_id_map[doc["id"]], "full_docs": False}
            for doc in full_docs
        ]

    def _full_doc_results(self, full_docs: List[Dict]) -> List[Dict[str, Any]]:
        """Build results where each document is returned as a single full-text chunk."""
        chunks = [
            {
                "id": doc["id"],
                "text": doc["text"],
                "text_anonymized": doc.get("text_anonymized", doc["text"]),
                "metadata": {"doc_id": doc["id"], "chunk_size": len(doc["text"])},
            }
            for doc in full_docs
        ]
        # Batch-encode the full-doc chunks
        with torch.no_grad():
            embeddings = self.chunk_embedding_model.encode(
                [c["text"] for c in chunks], batch_size=64, show_progress_bar=False
            )
        for chunk, emb in zip(chunks, embeddings):
            chunk["text_emb"] = emb.tolist()

        return [
            {"full_docs": True, "doc": doc, "chunks": [chunk]}
            for doc, chunk in zip(full_docs, chunks)
        ]

    # ── ES query builders ─────────────────────────────────────────────────────

    def _build_queries(
        self,
        query: str,
        embeddings: List[float],
        retrieval_method: str,
        filter_ids: Optional[List[str]],
        collection_id: Optional[str],
        knn_k: int,
        inner_hits_size: int,
    ) -> tuple:
        """Return (knn_query_body, fulltext_query_body)."""
        should_clauses = (
            [{"match": {"chunks.vectors.text": {"query": query, "boost": 5.0}}}]
            if retrieval_method == "hibrid_no_ner"
            else [
                {"match": {"chunks.vectors.text": {"query": query, "boost": 5.0}}},
                {"match": {"chunks.vectors.entities": {"query": query, "boost": 3.0}}},
            ]
        )

        if filter_ids:
            return (
                self._build_filtered_knn_query(
                    embeddings, filter_ids, collection_id, knn_k, inner_hits_size
                ),
                self._build_filtered_fulltext_query(
                    query, should_clauses, filter_ids, collection_id, inner_hits_size
                ),
            )
        return (
            self._build_global_knn_query(
                embeddings, collection_id, knn_k, inner_hits_size
            ),
            self._build_global_fulltext_query(
                query, should_clauses, collection_id, inner_hits_size
            ),
        )

    def _build_filtered_knn_query(
        self,
        embeddings: List[float],
        filter_ids: List[str],
        collection_id: Optional[str],
        knn_k: int,
        inner_hits_size: int,
    ) -> Dict[str, Any]:
        knn_filter = (
            {
                "bool": {
                    "must": [
                        {"terms": {"id": filter_ids}},
                        {"term": {"collectionId.keyword": collection_id}},
                    ]
                }
            }
            if collection_id
            else {"terms": {"id": filter_ids}}
        )
        return {
            "knn": {
                "field": "chunks.vectors.predicted_value",
                "query_vector": embeddings,
                "k": knn_k,
                "num_candidates": 2000,
                "filter": knn_filter,
                "inner_hits": {
                    "_source": False,
                    "fields": _CHUNK_INNER_HIT_FIELDS,
                    "size": inner_hits_size,
                },
            }
        }

    def _build_global_knn_query(
        self,
        embeddings: List[float],
        collection_id: Optional[str],
        knn_k: int,
        inner_hits_size: int,
    ) -> Dict[str, Any]:
        query: Dict[str, Any] = {
            "_source": ["id"],
            "knn": {
                "field": "chunks.vectors.predicted_value",
                "query_vector": embeddings,
                "k": knn_k,
                "inner_hits": {
                    "_source": False,
                    "fields": _CHUNK_INNER_HIT_FIELDS,
                    "size": inner_hits_size,
                },
            },
        }
        if collection_id:
            query["knn"]["filter"] = {"term": {"collectionId.keyword": collection_id}}
        return query

    def _build_filtered_fulltext_query(
        self,
        query: str,
        should_clauses: List[Dict],
        filter_ids: List[str],
        collection_id: Optional[str],
        inner_hits_size: int,
    ) -> Dict[str, Any]:
        filter_list = [{"terms": {"id": filter_ids}}]
        if collection_id:
            filter_list.append({"term": {"collectionId.keyword": collection_id}})
        return {
            "_source": ["id"],
            "query": {
                "bool": {
                    "filter": filter_list,
                    "must": {
                        "nested": {
                            "path": "chunks.vectors",
                            "query": {
                                "bool": {
                                    "should": should_clauses,
                                    "minimum_should_match": 1,
                                }
                            },
                            "inner_hits": {"_source": True, "size": inner_hits_size},
                        }
                    },
                }
            },
        }

    def _build_global_fulltext_query(
        self,
        query: str,
        should_clauses: List[Dict],
        collection_id: Optional[str],
        inner_hits_size: int,
    ) -> Dict[str, Any]:
        nested_query = {
            "nested": {
                "path": "chunks.vectors",
                "query": {
                    "bool": {"should": should_clauses, "minimum_should_match": 1}
                },
                "inner_hits": {"_source": True, "size": inner_hits_size},
            }
        }
        if collection_id:
            return {
                "_source": ["id"],
                "query": {
                    "bool": {
                        "filter": [{"term": {"collectionId.keyword": collection_id}}],
                        "must": nested_query,
                    }
                },
            }
        return {"_source": ["id"], "query": nested_query}
