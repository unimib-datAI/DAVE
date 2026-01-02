"""
VectorSearch Module

This module provides a clean abstraction for performing hybrid vector and full-text search
operations on Elasticsearch indexes using sentence transformers for embeddings.

The VectorSearch class encapsulates all the complex logic for:
- Generating embeddings from query text
- Building Elasticsearch KNN and full-text queries
- Combining results using Reciprocal Rank Fusion (RRF)
- Retrieving and processing document chunks
- Deciding when to return full documents vs chunks

Usage Example:
    ```python
    from vector_search import VectorSearch
    from sentence_transformers import SentenceTransformer
    from transformers import AutoTokenizer
    from elasticsearch import Elasticsearch

    # Initialize dependencies
    model = SentenceTransformer("Alibaba-NLP/gte-multilingual-base")
    es_client = Elasticsearch([{"host": "localhost", "port": 9200}])
    tokenizer = AutoTokenizer.from_pretrained("microsoft/Phi-3.5-mini-instruct")

    # Create VectorSearch instance
    vector_search = VectorSearch(
        model=model,
        es_client=es_client,
        tokenizer=tokenizer,
        retrievers=retrievers_dict,
        default_retriever=default_retriever
    )

    # Perform search
    results = vector_search.search(
        collection_name="my_index",
        query="What is machine learning?",
        retrieval_method="full",
        filter_ids=["doc1", "doc2"],
        collect_chunk_ranks_fn=collect_chunk_ranks,
        collect_chunk_ranks_full_text_fn=collect_chunk_ranks_full_text
    )
    ```
"""

from collections import defaultdict
from typing import Any, Dict, List, Optional

import torch
from retriever import DocumentRetriever
from sentence_transformers import SentenceTransformer
from transformers import PreTrainedTokenizer

from elasticsearch import Elasticsearch


class VectorSearch:
    """
    Handles vector search operations combining dense vector search and full-text search
    using Reciprocal Rank Fusion (RRF).
    """

    def __init__(
        self,
        model: SentenceTransformer,
        es_client: Elasticsearch,
        tokenizer: PreTrainedTokenizer,
        retrievers: Dict[str, DocumentRetriever],
        default_retriever: DocumentRetriever,
    ):
        """
        Initialize VectorSearch with required dependencies.

        Args:
            model: SentenceTransformer model for generating embeddings
            es_client: Elasticsearch client for search operations
            tokenizer: Tokenizer for token counting
            retrievers: Dictionary mapping collection names to retrievers
            default_retriever: Default retriever to use when collection not found
        """
        self.model = model
        self.es_client = es_client
        self.tokenizer = tokenizer
        self.retrievers = retrievers
        self.default_retriever = default_retriever

    def search(
        self,
        collection_name: str,
        query: str,
        retrieval_method: str,
        filter_ids: Optional[List[str]] = None,
        collection_id: Optional[str] = None,
        force_rag: bool = False,
        collect_chunk_ranks_fn: callable = None,
        collect_chunk_ranks_full_text_fn: callable = None,
    ) -> List[Dict[str, Any]]:
        """
        Perform vector search on the specified collection.

        Args:
            collection_name: Name of the Elasticsearch index to search
            query: Search query text
            retrieval_method: Search method ('full', 'dense', 'full-text', 'hibrid_no_ner')
            filter_ids: Optional list of document IDs to filter by
            collection_id: Optional collection ID to filter by
            force_rag: If True, always return chunks instead of full documents
            collect_chunk_ranks_fn: Function to collect chunk ranks from vector search
            collect_chunk_ranks_full_text_fn: Function to collect chunk ranks from full-text search

        Returns:
            List of document results with chunks and metadata
        """
        # Generate embeddings
        print(f"RECEIVED FILTER IDS {filter_ids}")
        embeddings = []
        with torch.no_grad():
            embeddings = self.model.encode(query)
        embeddings = embeddings.tolist()

        # Adjust parameters based on filter mode
        if filter_ids and len(filter_ids) == 1:
            knn_k = 50
            chunks_to_gather = 40
            inner_hits_size = 50
            print(
                f"SINGLE DOCUMENT MODE: knn_k={knn_k}, chunks_to_gather={chunks_to_gather}"
            )
        else:
            knn_k = 25
            chunks_to_gather = 25
            inner_hits_size = 30
            print(
                f"MULTI DOCUMENT MODE: knn_k={knn_k}, chunks_to_gather={chunks_to_gather}"
            )

        # Build queries
        query_body, query_full_text = self._build_queries(
            query=query,
            embeddings=embeddings,
            retrieval_method=retrieval_method,
            filter_ids=filter_ids,
            collection_id=collection_id,
            knn_k=knn_k,
            inner_hits_size=inner_hits_size,
        )
        print(f"DEBUG: Vector query body: {query_body}")
        print(f"DEBUG: Full-text query body: {query_full_text}")

        # Execute searches
        results = []
        response_full_text = []

        if retrieval_method in ["full", "dense", "hibrid_no_ner"]:
            results = self.es_client.search(index=collection_name, body=query_body)
            print(f"DEBUG: Vector search response hits: {len(results['hits']['hits'])}")
            for hit in results["hits"]["hits"]:
                if "inner_hits" in hit and "chunks.vectors" in hit["inner_hits"]:
                    print(
                        f"DEBUG: Vector inner_hits for doc {hit['_source']['id']}: {len(hit['inner_hits']['chunks.vectors']['hits']['hits'])}"
                    )

        if retrieval_method in ["full", "hibrid_no_ner", "full-text"]:
            response_full_text = self.es_client.search(
                index=collection_name, body=query_full_text
            )
            print(
                f"DEBUG: Full-text search response hits: {len(response_full_text['hits']['hits'])}"
            )
            for hit in response_full_text["hits"]["hits"]:
                if "inner_hits" in hit and "chunks" in hit["inner_hits"]:
                    print(
                        f"DEBUG: Full-text inner_hits for doc {hit['_source']['id']}: {len(hit['inner_hits']['chunks']['hits']['hits'])}"
                    )

        del embeddings

        # Combine results using RRF
        vector_ranks = collect_chunk_ranks_fn(results) if len(results) > 0 else {}
        print(f"DEBUG: Vector ranks collected: {len(vector_ranks)}")
        full_text_ranks = (
            collect_chunk_ranks_full_text_fn(response_full_text)
            if len(response_full_text) > 0
            else {}
        )
        print(f"DEBUG: Full-text ranks collected: {len(full_text_ranks)}")

        rrf_k = 50 if (filter_ids and len(filter_ids) == 1) else 30

        combined_scores = {}
        all_chunk_ids = set(vector_ranks.keys()).union(full_text_ranks.keys())

        for chunk_id in all_chunk_ids:
            rank_vector = vector_ranks.get(chunk_id, float("inf"))
            rank_full_text = full_text_ranks.get(chunk_id, float("inf"))
            combined_scores[chunk_id] = (1 / (rrf_k + rank_vector)) + (
                1 / (rrf_k + rank_full_text)
            )

        final_ranking = sorted(
            combined_scores.items(), key=lambda x: x[1], reverse=True
        )

        print(f"Final ranking contains {len(final_ranking)} chunks")
        print(f"Will gather top {chunks_to_gather} chunks")

        # Gather top chunks
        if filter_ids and len(filter_ids) == 1:
            # Single document mode: gather all top chunks (may be from one doc)
            doc_chunks_id_map = {}
            for chunk in final_ranking[:chunks_to_gather]:
                doc_id = chunk[0][0]
                chunk_text = chunk[0][1]
                chunk_text_anonymized = chunk[0][2]
                temp_chunk = {
                    "id": doc_id,
                    "text": chunk_text,
                    "text_anonymized": chunk_text_anonymized,
                    "metadata": {"doc_id": doc_id, "chunk_size": len(chunk_text)},
                }
                if doc_id in doc_chunks_id_map:
                    doc_chunks_id_map[doc_id].append(temp_chunk)
                else:
                    doc_chunks_id_map[doc_id] = [temp_chunk]
        else:
            # Multi document mode: diversify across documents
            doc_chunk_scores = defaultdict(list)
            for item in final_ranking:
                chunk_id, score = item
                doc_id = chunk_id[0]
                doc_chunk_scores[doc_id].append((score, chunk_id))

            # Sort documents by their highest chunk score
            sorted_docs = sorted(
                doc_chunk_scores.items(),
                key=lambda x: max(s for s, _ in x[1]),
                reverse=True,
            )

            # Take top 5 documents, and from each, take top 5 chunks
            selected_chunks = []
            max_docs = 5
            max_chunks_per_doc = 5
            for doc_id, chunks in sorted_docs[:max_docs]:
                top_chunks = sorted(chunks, key=lambda x: x[0], reverse=True)[
                    :max_chunks_per_doc
                ]
                selected_chunks.extend(top_chunks)

            # Build doc_chunks_id_map from selected_chunks
            doc_chunks_id_map = {}
            for score, chunk_id in selected_chunks:
                doc_id = chunk_id[0]
                chunk_text = chunk_id[1]
                chunk_text_anonymized = chunk_id[2]
                temp_chunk = {
                    "id": doc_id,
                    "text": chunk_text,
                    "text_anonymized": chunk_text_anonymized,
                    "metadata": {"doc_id": doc_id, "chunk_size": len(chunk_text)},
                }
                if doc_id in doc_chunks_id_map:
                    doc_chunks_id_map[doc_id].append(temp_chunk)
                else:
                    doc_chunks_id_map[doc_id] = [temp_chunk]

        num_docs = len(doc_chunks_id_map)
        total_chunks = sum(len(chunks) for chunks in doc_chunks_id_map.values())
        print(f"Retrieved {total_chunks} chunks from {num_docs} documents")

        # Retrieve full documents
        doc_ids = list(doc_chunks_id_map.keys())
        current_retriever = self.retrievers.get(collection_name, self.default_retriever)
        print(f"current retriever {current_retriever}")

        full_docs = []
        for doc_id in doc_ids:
            d = current_retriever.retrieve(doc_id)
            if "error" in d:
                print("Error retrieving document", d["error"])
                continue
            full_docs.append(d)
            print(f"current id {d.keys()}")

        # Determine whether to return full docs or chunks
        return self._prepare_results(
            full_docs=full_docs,
            doc_chunks_id_map=doc_chunks_id_map,
            query=query,
            filter_ids=filter_ids,
            force_rag=force_rag,
        )

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
        """Build Elasticsearch query bodies for vector and full-text search."""

        should_query = (
            [{"match": {"chunks.vectors.text": query}}]
            if retrieval_method == "hibrid_no_ner"
            else [
                {"match": {"chunks.vectors.text": query}},
                {"match": {"chunks.vectors.entities": query}},
            ]
        )

        if filter_ids and len(filter_ids) > 0:
            # Filtered search
            query_body = self._build_filtered_knn_query(
                embeddings, filter_ids, collection_id, knn_k
            )
            query_full_text = self._build_filtered_fulltext_query(
                query, should_query, filter_ids, collection_id, inner_hits_size
            )
        else:
            # Global search
            query_body = self._build_global_knn_query(embeddings, collection_id, knn_k)
            query_full_text = self._build_global_fulltext_query(
                query, should_query, collection_id, inner_hits_size
            )

        return query_body, query_full_text

    def _build_filtered_knn_query(
        self,
        embeddings: List[float],
        filter_ids: List[str],
        collection_id: Optional[str],
        knn_k: int,
    ) -> Dict[str, Any]:
        """Build KNN query with document ID filters."""
        knn_filter = {"terms": {"id": filter_ids}}

        if collection_id:
            knn_filter = {
                "bool": {
                    "must": [
                        {"terms": {"id": filter_ids}},
                        {"term": {"collectionId.keyword": collection_id}},
                    ]
                }
            }

        return {
            "knn": {
                "inner_hits": {
                    "_source": False,
                    "fields": [
                        "chunks.vectors.text",
                        "chunks.vectors.text_anonymized",
                        "_score",
                    ],
                    "size": knn_k,
                },
                "field": "chunks.vectors.predicted_value",
                "query_vector": embeddings,
                "k": knn_k,
                "num_candidates": 1000,
                "filter": knn_filter,
            }
        }

    def _build_global_knn_query(
        self, embeddings: List[float], collection_id: Optional[str], knn_k: int
    ) -> Dict[str, Any]:
        """Build KNN query without document ID filters."""
        query = {
            "_source": ["id"],
            "knn": {
                "inner_hits": {
                    "_source": False,
                    "fields": [
                        "chunks.vectors.text",
                        "chunks.vectors.text_anonymized",
                        "_score",
                    ],
                    "size": knn_k,
                },
                "field": "chunks.vectors.predicted_value",
                "query_vector": embeddings,
                "k": knn_k,
            },
        }

        if collection_id:
            query["knn"]["filter"] = {"term": {"collectionId.keyword": collection_id}}

        return query

    def _build_filtered_fulltext_query(
        self,
        query: str,
        should_query: List[Dict],
        filter_ids: List[str],
        collection_id: Optional[str],
        inner_hits_size: int,
    ) -> Dict[str, Any]:
        """Build full-text query with document ID filters."""
        fulltext_filter_list = [{"terms": {"id": filter_ids}}]

        if collection_id:
            fulltext_filter_list.append(
                {"term": {"collectionId.keyword": collection_id}}
            )
        return {
            "_source": ["id"],
            "query": {
                "bool": {
                    "filter": fulltext_filter_list
                    if collection_id
                    else [{"terms": {"id": filter_ids}}],
                    "must": {
                        "nested": {
                            "path": "chunks.vectors",
                            "query": {"bool": {"should": should_query}},
                            "inner_hits": {
                                "_source": False,
                                "fields": [
                                    "chunks.vectors.text",
                                    "chunks.vectors.text_anonymized",
                                    "_score",
                                ],
                                "size": inner_hits_size,
                            },
                        }
                    },
                }
            },
        }

    def _build_global_fulltext_query(
        self,
        query: str,
        should_query: List[Dict],
        collection_id: Optional[str],
        inner_hits_size: int,
    ) -> Dict[str, Any]:
        """Build full-text query without document ID filters."""
        nested_query = {
            "nested": {
                "path": "chunks.vectors",
                "query": {"bool": {"should": should_query}},
                "inner_hits": {
                    "_source": False,
                    "fields": [
                        "chunks.vectors.text",
                        "chunks.vectors.text_anonymized",
                        "_score",
                    ],
                    "size": inner_hits_size,
                },
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
        else:
            return {"_source": ["id"], "query": nested_query}

    def _prepare_results(
        self,
        full_docs: List[Dict],
        doc_chunks_id_map: Dict[str, List[Dict]],
        query: str,
        filter_ids: Optional[List[str]],
        force_rag: bool,
    ) -> List[Dict[str, Any]]:
        """Prepare final results, deciding whether to return full docs or chunks."""
        doc_results = []

        # Full document keywords
        full_docs_keywords = ["estrai", "riassumi"]
        full_docs_flag = any(keyword in query.lower() for keyword in full_docs_keywords)

        # Force RAG mode
        if force_rag:
            print("FORCE RAG ENABLED")
            for doc in full_docs:
                doc_results.append(
                    {
                        "doc": doc,
                        "chunks": doc_chunks_id_map[doc["id"]],
                        "full_docs": False,
                    }
                )
            return doc_results

        # Single document case with token limit check
        if filter_ids and len(filter_ids) == 1 and len(full_docs) > 0:
            tokens = self.tokenizer.tokenize(full_docs[0]["text"])
            print(f"Number of tokens: {len(tokens)}")

            if len(tokens) < 18000:
                doc_results.append(
                    {
                        "full_docs": False,
                        "doc": full_docs[0],
                        "chunks": doc_chunks_id_map[full_docs[0]["id"]],
                    }
                )
                return doc_results

        # Full docs flag handling
        if full_docs_flag:
            token_count = sum(
                len(self.tokenizer.tokenize(doc["text"])) for doc in full_docs
            )

            if token_count <= 18000:
                for doc in full_docs:
                    temp_chunk = {
                        "id": doc["id"],
                        "text": doc["text"],
                        "metadata": {
                            "doc_id": doc["id"],
                            "chunk_size": len(doc["text"]),
                        },
                    }
                    doc_results.append(
                        {
                            "full_docs": True,
                            "doc": doc,
                            "chunks": [temp_chunk],
                        }
                    )
                return doc_results

        # Default: return chunked documents
        for doc in full_docs:
            doc_results.append(
                {"doc": doc, "chunks": doc_chunks_id_map[doc["id"]], "full_docs": False}
            )

        return doc_results
