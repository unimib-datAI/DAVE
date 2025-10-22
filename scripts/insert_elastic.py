# Configuration
ELASTICSEARCH_HOST = "http://localhost:9200"
INDEX_NAME = "dave"
JSON_FOLDER = "./scripts/input_data"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 100
VECTOR_DIMS = 768
MODEL_NAME = "Alibaba-NLP/gte-multilingual-base"

# Imports
from elasticsearch import Elasticsearch, helpers
import os
import json
import hashlib
import torch
import nltk
from tqdm import tqdm
from sentence_transformers import SentenceTransformer
from langchain_text_splitters import RecursiveCharacterTextSplitter
import logging

# Initialize Elasticsearch client
es = Elasticsearch(ELASTICSEARCH_HOST, verify_certs=False, request_timeout=60)

# Test connection
try:
    response = es.info()
    es_version = response["version"]["number"]
    print(f"Connected to Elasticsearch Server Version: {es_version}")
except Exception as e:
    print(f"Connection failed: {e}")


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
                                    "dims": VECTOR_DIMS,
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


def recreate_index(index_name=INDEX_NAME, delete_existing=False):
    """Create or recreate the Elasticsearch index."""
    try:
        if delete_existing and es.indices.exists(index=index_name):
            es.indices.delete(index=index_name)
            print(f"Deleted existing index: {index_name}")

        if not es.indices.exists(index=index_name):
            index_settings = get_index_settings()
            response = es.indices.create(
                index=index_name,
                mappings=index_settings["mappings"],
                settings=index_settings["settings"],
            )
            print(f"Created index: {index_name}")
            return response
        else:
            print(f"Index {index_name} already exists")
            return None

    except Exception as e:
        print(f"Error managing index: {e}")
        return None


def read_json_files(path, target_ids=None):
    """
    Read and process JSON annotation files from a directory.

    Args:
        path: Directory containing .json.annotated files
        target_ids: Optional set of document IDs to filter by

    Returns:
        List of processed document objects
    """
    json_files = [f for f in os.listdir(path) if f.endswith(".json")]
    data = []

    print(f"Processing {len(json_files)} JSON files from {path}")

    for json_file in tqdm(json_files, desc="Reading files"):
        try:
            with open(os.path.join(path, json_file), "r") as file:
                file_object = json.load(file)

                # Skip empty files
                if not file_object.get("text"):
                    print(f"Warning: Skipping empty file: {json_file}")
                    continue

                # Generate document ID
                file_object["id"] = get_string_hash(file_object["text"])

                # Filter by target IDs if provided
                if target_ids and file_object["id"] not in target_ids:
                    continue

                # Process annotations
                annotations = process_document_annotations(file_object)
                file_object["annotations"] = annotations

                # Clean up the document
                file_object = clean_document_data(file_object)

                data.append(file_object)

        except Exception as e:
            print(f"Error processing {json_file}: {e}")
            continue

    print(f"Successfully processed {len(data)} documents")
    return data


def process_document_annotations(file_object):
    """Extract and process annotations from a document."""
    text = file_object.get("text", "")
    annotations = []

    annotation_sets = file_object.get("annotation_sets", {})
    entities = annotation_sets.get("entities_", {})
    raw_annotations = entities.get("annotations", [])

    for annotation in raw_annotations:
        try:
            ann_object = process_annotation(annotation, text, file_object.get("id", ""))
            annotations.append(ann_object)
        except Exception as e:
            print(f"Warning: Error processing annotation: {e}")
            continue

    print(
        f"Processed {len(annotations)} annotations for document '{file_object.get('name', 'Unknown')}'"
    )
    return annotations


def send_to_elasticsearch(data, index_name=INDEX_NAME, update_existing=True):
    """
    Send documents to Elasticsearch with optional duplicate handling.

    Args:
        data: List of document objects
        index_name: Target index name
        update_existing: Whether to update existing documents
    """
    print(f"Sending {len(data)} documents to Elasticsearch...")

    for item in tqdm(data, desc="Indexing documents"):
        try:
            if update_existing:
                # Remove existing documents with same ID
                search_response = es.search(
                    index=index_name, query={"term": {"id": item["id"]}}
                )

                for hit in search_response["hits"]["hits"]:
                    es.delete(index=index_name, id=hit["_id"])

            # Index the new document
            es.index(index=index_name, id=item["id"], document=item)

        except Exception as e:
            print(f"Error indexing document {item.get('name', 'Unknown')}: {e}")

    print("Document indexing completed")
    # Refresh the index to make documents searchable immediately
    es.indices.refresh(index=index_name)


# Initialize text splitter
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP,
    length_function=len,
    is_separator_regex=False,
)


class DocumentChunker:
    """Handles document chunking and embedding generation."""

    def __init__(self, model_name=MODEL_NAME, device="mps"):
        """Initialize the chunker with sentence transformer model."""
        self.model_name = model_name
        self.device = device
        self._model = None
        self._initialize_model()

    def _initialize_model(self):
        """Lazy initialization of the sentence transformer model."""
        if self._model is None:
            print(f"Loading embedding model: {self.model_name}")
            self._model = SentenceTransformer(
                self.model_name, trust_remote_code=True
            ).to(self.device)
            print("Model loaded successfully")

    def generate_chunks_with_embeddings(self, text):
        """
        Split text into chunks and generate embeddings for each chunk.

        Args:
            text: Input text to chunk and embed

        Returns:
            List of lists: [embedding, chunk_text, entities_placeholder]
        """
        try:
            # Split text into chunks
            chunks = text_splitter.split_text(text)

            if not chunks:
                print("Warning: No chunks generated from text")
                return []

            # Generate embeddings
            embeddings = self._model.encode(chunks, show_progress_bar=False)

            # Return as list of lists (mutable) instead of tuples (immutable)
            result = [
                [emb.tolist(), chunk, ""] for emb, chunk in zip(embeddings, chunks)
            ]

            return result

        except Exception as e:
            print(f"Error in chunking/embedding: {e}")
            return []


# Initialize the chunker
chunker = DocumentChunker()


def update_document_with_chunks(doc_id, doc_source, chunker_instance):
    """
    Update a document with chunks and their entities using existing annotations.

    Args:
        doc_id: Elasticsearch document ID
        doc_source: Full document source containing text and annotations
        chunker_instance: DocumentChunker instance
    """
    text = doc_source.get("text", "")
    existing_annotations = doc_source.get("annotations", [])

    # Generate chunks with embeddings
    chunks = chunker_instance.generate_chunks_with_embeddings(text)

    if not chunks:
        print(f"Warning: No chunks generated for document {doc_id}")
        return

    # No entity processing, so entities empty
    for chunk in chunks:
        chunk[2] = ""

    # Prepare data for Elasticsearch update
    passages_body = [
        {
            "vectors": {
                "predicted_value": chunk[0],
                "entities": chunk[2],
                "text": chunk[1],
            }
        }
        for chunk in chunks
    ]

    # Update document in Elasticsearch
    try:
        response = es.update(index=INDEX_NAME, id=doc_id, doc={"chunks": passages_body})
        print(f"Updated document {doc_id} with {len(chunks)} chunks")
    except Exception as e:
        print(f"Error updating document {doc_id}: {e}")


def process_documents_for_chunking(index_name=INDEX_NAME, query=None, batch_size=10000):
    """
    Process documents from Elasticsearch to add chunks and embeddings.

    Args:
        index_name: Index to search
        query: Optional query to filter documents
        batch_size: Maximum documents to process
    """
    if query is None:
        query = {"match_all": {}}

    try:
        print("Searching for documents to process...")
        response = es.search(index=index_name, query=query, size=batch_size)
        documents = response["hits"]["hits"]

        print(f"Found {len(documents)} documents to process")

        # Suppress Elasticsearch transport logging for cleaner output
        logging.getLogger("elastic_transport").setLevel(logging.WARNING)

        # Process documents in reverse order (optional)
        documents.reverse()

        # Process each document
        for doc in tqdm(documents, desc="Adding chunks and embeddings"):
            # Use the custom ID (hash) instead of Elasticsearch's auto-generated _id
            doc_id = doc["_source"]["id"]
            doc_source = doc["_source"]
            update_document_with_chunks(doc_id, doc_source, chunker)

        print("Document processing completed!")

    except Exception as e:
        print(f"Error during document processing: {e}")


# Main execution
recreate_index(delete_existing=False)

target_ids = None

data = read_json_files(JSON_FOLDER, target_ids=target_ids)

print(f"Loaded {len(data)} documents ready for processing")

send_to_elasticsearch(data)

process_documents_for_chunking()
