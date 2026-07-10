import hashlib
import json
import logging
import os
import re
import uuid
from functools import lru_cache
from os import environ
from typing import List, Optional

import requests
import torch
import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from settings import AppSettings

from elasticsearch import Elasticsearch

logging.basicConfig(level=logging.DEBUG)


@lru_cache()
def get_settings():
    return AppSettings()


def get_device():
    """
    Automatically detect and return the appropriate device for model inference.
    Returns 'cuda' if CUDA is available, otherwise 'cpu'.
    """
    if torch.cuda.is_available():
        device = "cuda"
        logging.info(f"CUDA is available. Using GPU: {torch.cuda.get_device_name(0)}")
    else:
        device = "cpu"
        logging.info("CUDA is not available. Using CPU for inference.")
    return device


# Setup FastAPI with comprehensive API documentation:
app = FastAPI(
    title="QA Vectorizer API",
    description="""
    QA Vectorizer API provides document indexing and embedding generation using Elasticsearch and sentence-transformer models.

    ## Features

    * **Embeddings**: Generate dense vector embeddings for arbitrary text (main or chunk-attribution model)
    * **Document Management**: Index, update, and delete documents with annotations
    * **Elasticsearch Integration**: Full Elasticsearch index management
    * **Annotation Support**: Handle document annotations and entity mentions
    * **Chunking**: Automatic document chunking with configurable parameters

    Search, faceting, and RAG retrieval live in the Next.js frontend, which
    calls this service only for embedding generation.

    ## Authentication

    Currently, the API does not require authentication (CORS is open).
    """,
    version="1.0.0",
    contact={
        "name": "IKBP Team",
    },
    openapi_tags=[
        {
            "name": "Elasticsearch Index",
            "description": "Elasticsearch index management operations",
        },
        {
            "name": "Elasticsearch Documents",
            "description": "Document indexing and management operations",
        },
        {
            "name": "Elasticsearch Query",
            "description": "Search and query operations",
        },
    ],
)

# I need open CORS for my setup, you may not!!
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CreateCollectionRequest(BaseModel):
    """Request model for creating a new collection"""

    name: str


class IndexDocumentRequest(BaseModel):
    """Request model for indexing documents with embeddings"""

    embeddings: List[List[float]]
    documents: List[str]
    metadatas: List[dict] = []


class CreateElasticIndexResponse(BaseModel):
    """Response model for creating an Elasticsearch index"""

    n_documents: int

    class Config:
        json_schema_extra = {
            "example": {
                "legal_documents": {
                    "aliases": {},
                    "mappings": {
                        "properties": {
                            "text": {"type": "text"},
                            "name": {"type": "keyword"},
                            "annotations": {"type": "nested"},
                            "metadata": {"type": "nested"},
                            "chunks": {"type": "nested"},
                        }
                    },
                    "settings": {
                        "index": {
                            "mapping": {"nested_objects": {"limit": "20000"}},
                            "number_of_shards": "1",
                            "number_of_replicas": "1",
                        }
                    },
                },
                "n_documents": 0,
            }
        }


class DeleteIndexResponse(BaseModel):
    """Response model for deleting an index"""

    count: int

    class Config:
        json_schema_extra = {"example": {"count": 1}}


class IndexDocumentResponse(BaseModel):
    """Response model for indexing a document"""

    result: str
    id: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {"result": "created", "id": "a7f8d9e2c1b3456789abcdef"}
        }


class AnnotationUpdateResponse(BaseModel):
    """Response model for updating annotations"""

    result: str
    document_id: str
    annotations_count: int

    class Config:
        json_schema_extra = {
            "example": {
                "result": "updated",
                "document_id": "doc123",
                "annotations_count": 15,
            }
        }


class IndexElasticDocumentWithProcessingRequest(BaseModel):
    """Request model for indexing a document with full processing (annotations, chunking, embeddings)"""

    text: str
    id: str
    collectionId: str
    annotation_sets: Optional[dict] = None
    preview: Optional[str] = None
    name: Optional[str] = None
    features: Optional[dict] = None
    offset_type: Optional[str] = None
    text_deanonymized: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "text": "This is the full text of the legal document...",
                "collectionId": "collection id",
                "name": "Document Title",
                "preview": "This is a preview...",
                "annotation_sets": {},
                "features": {},
                "offset_type": "character",
                "text_deanonymized": "This is the de-anonymized text...",
            }
        }


def get_string_hash(input_string):
    """Generate SHA256 hash for a given string."""
    hash_object = hashlib.sha256()
    hash_object.update(input_string.encode("utf-8"))
    return hash_object.hexdigest()


def process_annotation(annotation, text, document_id):
    """Process a single annotation into the required format."""
    name = text[annotation["start"] : annotation["end"]]

    ann_object = {
        "mention": name,
        "start": annotation["start"],
        "end": annotation["end"],
        "id": annotation["id"],
        "type": annotation["type"],
    }

    # Handle linking information
    if "linking" in annotation.get("features", {}) and not annotation["features"][
        "linking"
    ].get("is_nil", True):
        linking = annotation["features"]["linking"]
        ann_object.update(
            {
                "display_name": annotation["features"].get("title", name),
                "is_linked": True,
                "id_ER": linking.get("top_candidate", {}).get("url", ""),
            }
        )
    else:
        ann_object.update(
            {"display_name": name, "is_linked": False, "id_ER": f"{document_id}_{name}"}
        )

    return ann_object


def clean_document_data(file_object):
    """Clean and prepare document data for indexing."""
    # Remove unnecessary fields
    for key in ["annotation_sets", "annoation_sets", "features", "_id"]:
        if key in file_object:
            del file_object[key]

    # Ensure required fields exist
    if "metadata" not in file_object:
        file_object["metadata"] = []

    return file_object


def get_index_settings():
    """Get the index settings with custom nested object limit."""
    return {
        "settings": {"index.mapping.nested_objects.limit": 20000},
        "mappings": {
            "properties": {
                "text": {"type": "text"},
                "text_deanonymized": {"type": "text"},
                "name": {"type": "keyword"},
                "preview": {"type": "keyword"},
                "id": {"type": "keyword"},
                "metadata": {
                    "type": "nested",
                    "properties": {
                        "type": {"type": "keyword"},
                        "value": {"type": "keyword"},
                    },
                },
                "annotations": {
                    "type": "nested",
                    "properties": {
                        "mention": {"type": "keyword"},
                        "start": {"type": "integer"},
                        "end": {"type": "integer"},
                        "display_name": {"type": "keyword"},
                        "id": {"type": "integer"},
                        "type": {"type": "keyword"},
                        "is_linked": {"type": "boolean"},
                        "id_ER": {"type": "keyword"},
                    },
                },
                "chunks": {
                    "type": "nested",
                    "properties": {
                        "vectors": {
                            "type": "nested",
                            "properties": {
                                "predicted_value": {
                                    "type": "dense_vector",
                                    "index": True,
                                    "dims": 768,
                                    "similarity": "cosine",
                                },
                                "text": {"type": "text"},
                                "entities": {"type": "text"},
                            },
                        },
                    },
                },
            }
        },
    }


class EmbedRequest(BaseModel):
    """Request model for generating sentence embeddings"""

    texts: List[str]
    # "main" uses the primary retrieval/indexing model (configurable via
    # SENTENCE_TRANSFORMER_EMBEDDING_MODEL). "chunk" uses the lightweight
    # all-MiniLM-L6-v2 model used for per-chunk attribution embeddings in RAG.
    model: Optional[str] = "main"

    class Config:
        json_schema_extra = {
            "example": {
                "texts": [
                    "Il Tribunale di Milano ha stabilito che...",
                    "La parte ricorrente ha presentato ricorso...",
                ],
                "model": "main",
            }
        }


class EmbedResponse(BaseModel):
    """Response model for generated embeddings"""

    embeddings: List[List[float]]

    class Config:
        json_schema_extra = {"example": {"embeddings": [[0.012, -0.034, 0.056]]}}


@app.post(
    "/embed",
    response_model=EmbedResponse,
    tags=["Embeddings"],
    summary="Generate sentence embeddings",
    description="""
    Generate dense vector embeddings for a list of texts.

    `model` selects which sentence-transformer to use:
    - `main` (default): the primary retrieval/indexing model.
    - `chunk`: the lightweight all-MiniLM-L6-v2 model used for per-chunk
      attribution embeddings by the RAG pipeline.

    This is the last piece of vectorization logic that stays in qavectorizer -
    everything else (indexing, search, faceting, RAG retrieval) is being moved
    to the Next.js frontend, which calls this endpoint whenever it needs
    embeddings.
    """,
    response_description="List of embedding vectors, one per input text, in the same order",
)
def embed(req: EmbedRequest):
    target_model = chunk_model if req.model == "chunk" else model
    embeddings = target_model.encode(req.texts, show_progress_bar=False)
    return {"embeddings": [embedding.tolist() for embedding in embeddings]}


@app.post(
    "/{elastic_index}/_doc",
    tags=["Elasticsearch Documents"],
    summary="Index document with full processing",
    description="""
    Index a document with complete processing pipeline:

    1. **Annotation Processing**: Extract and process entity annotations
    2. **Text Chunking**: Split document into chunks (500 chars, 100 overlap)
    3. **Embedding Generation**: Generate vector embeddings using sentence transformers
    4. **Indexing**: Store in Elasticsearch with all metadata

    This is the recommended endpoint for indexing new documents.
    """,
    response_description="Indexing result with document ID",
)
def index_document_with_processing(
    elastic_index: str, req: IndexElasticDocumentWithProcessingRequest
):
    """Index a document with full processing: annotations, chunking, embeddings."""

    try:
        print(f"=== Indexing document to {elastic_index} ===")
        print(f"Document name: {req.name}")
        print(f"Text length: {len(req.text) if req.text else 0}")
        print(f"Has annotation_sets: {req.annotation_sets is not None}")
        print(f"Has collection id {req.collectionId}")
        print(f"Has de-anonymized text: {req.text_deanonymized is not None}")

        # Debug: Check if text_deanonymized is available or using fallback
        if req.text_deanonymized:
            print("DEBUG: text_deanonymized is available, using it")
        else:
            print(
                "DEBUG: text_deanonymized is NOT available, using fallback to text field"
            )

        # Prepare the document
        file_object = {
            "id": req.id,
            "text": req.text,
            "text_deanonymized": req.text_deanonymized
            if req.text_deanonymized
            else req.text,
            "annotation_sets": req.annotation_sets,
            "preview": req.preview,
            "name": req.name,
            "features": req.features,
            "offset_type": req.offset_type,
            "collectionId": req.collectionId,
        }

        # Generate document ID
        # file_object["id"] = get_string_hash(file_object["text"])
        # print(f"Generated document ID: {file_object['id']}")

        # Process annotations
        annotations = []
        annotation_sets = file_object.get("annotation_sets", {}) or {}
        print(f"annotation_sets keys: {list(annotation_sets.keys())}")
        entities = annotation_sets.get("entities_", {})
        print(f"entities_ keys: {list(entities.keys()) if entities else 'None'}")
        raw_annotations = entities.get("annotations", [])
        print(f"Number of raw annotations to process: {len(raw_annotations)}")

        for i, annotation in enumerate(raw_annotations):
            try:
                ann_object = process_annotation(
                    annotation, file_object["text"], file_object["id"]
                )
                annotations.append(ann_object)
                if i < 3:  # Log first 3 annotations for debugging
                    print(
                        f"Processed annotation {i}: {ann_object.get('mention', 'N/A')} (type: {ann_object.get('type', 'N/A')})"
                    )
            except Exception as e:
                print(f"Warning: Error processing annotation {i}: {e}")
                print(f"Annotation data: {annotation}")
                continue

        file_object["annotations"] = annotations
        print(f"Total annotations processed and added: {len(annotations)}")

        # Clean up the document
        file_object = clean_document_data(file_object)

        # Ensure index exists
        if not es_client.indices.exists(index=elastic_index):
            index_settings = get_index_settings()
            es_client.indices.create(index=elastic_index, **index_settings)

        # Chunk and embed - use de-anonymized text for embeddings if available
        text_for_chunking = req.text_deanonymized if req.text_deanonymized else req.text

        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=100,
            length_function=len,
        )
        chunks = text_splitter.split_text(text_for_chunking)

        # Also chunk the anonymized text for preview purposes
        chunks_anonymized = text_splitter.split_text(file_object["text"])

        if chunks:
            embeddings = model.encode(chunks, show_progress_bar=False)

            passages_body = []
            for i, (emb, chunk) in enumerate(zip(embeddings, chunks)):
                # Store both anonymized and de-anonymized versions
                chunk_anonymized = (
                    chunks_anonymized[i] if i < len(chunks_anonymized) else chunk
                )
                passages_body.append(
                    {
                        "vectors": {
                            "predicted_value": emb.tolist(),
                            "text": chunk,  # De-anonymized text for generation
                            "text_anonymized": chunk_anonymized,  # Anonymized text for preview
                            "entities": "",
                        }
                    }
                )

            file_object["chunks"] = passages_body

        # Index the document
        print(
            f"Indexing document with {len(file_object.get('annotations', []))} annotations..."
        )
        res = es_client.index(index=elastic_index, document=file_object)
        es_client.indices.refresh(index=elastic_index)
        print(f"Document indexed successfully: {res['result']}")
        print(f"=== Indexing complete ===")

        return {"result": res["result"], "id": file_object["id"]}

    except Exception as e:
        print(f"ERROR in index_document_with_processing: {str(e)}")
        import traceback

        traceback.print_exc()
        raise HTTPException(
            status_code=500, detail=f"Error processing document: {str(e)}"
        )


settings = get_settings()
print(settings.dict())
logger = logging.getLogger(__name__)

# if not os.getenv("ENVIRONMENT", "production") == "dev":
# Automatically detect the best device (CUDA or CPU)
device = get_device()
print(f"Available device {device}")
model = SentenceTransformer(
    environ.get(
        "SENTENCE_TRANSFORMER_EMBEDDING_MODEL", "Alibaba-NLP/gte-multilingual-base"
    ),
    device=device,
    trust_remote_code=True,
)
# Override with environment variable if specified, otherwise use auto-detected device
target_device = environ.get("SENTENCE_TRANSFORMER_DEVICE", device)
print(f"Model loaded on device: {model.device}")
model = model.eval()

# Lightweight model used by the Next.js RAG pipeline for per-chunk
# attribution embeddings (requested via POST /embed with model="chunk").
chunk_model = SentenceTransformer("all-MiniLM-L6-v2", device=device)
chunk_model = chunk_model.eval()

# Print each collection
# for collection in collections:
#     print(collection)
_settings = get_settings()
_es_host = _settings.elastic_host
_es_port = int(_settings.elastic_port)
print(
    "starting es client",
    {
        "host": _es_host,
        "scheme": "http",
        "port": _es_port,
    },
)
es_client = Elasticsearch(
    hosts=[
        {
            "host": _es_host,
            "scheme": "http",
            "port": _es_port,
        }
    ],
    request_timeout=60,
)

# if not os.getenv("ENVIRONMENT", "production") == "dev":
#     with open(environ.get("OGG2NAME_INDEX"), "r") as fd:
#         ogg2name_index = json.load(fd)

# [start fastapi]:
_PORT = int(settings.indexer_server_port)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=_PORT)
