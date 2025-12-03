# QA Vectorizer Service

A FastAPI-based service for document indexing, vector search, and retrieval using Elasticsearch and sentence transformers.

## Overview

The QA Vectorizer provides:
- **Semantic Search**: Vector embeddings using sentence transformers
- **Hybrid Search**: Combines vector search with full-text search using RRF (Reciprocal Rank Fusion)
- **Document Processing**: Automatic chunking, annotation processing, and embedding generation
- **Elasticsearch Integration**: Full index management and query capabilities

## Installation

Install dependencies:

```bash
pip install -r src/requirements.txt
```

## Running the Service

Start the FastAPI server:

```bash
cd src
python app.py
```

The service will start on the configured port (default: 7863).

## API Documentation

This service includes comprehensive interactive API documentation powered by FastAPI and Swagger/OpenAPI.

### Accessing Documentation

Once the server is running, access the documentation at:

#### Swagger UI (Interactive)
```
http://localhost:7863/docs
```

#### ReDoc (Alternative View)
```
http://localhost:7863/redoc
```

#### OpenAPI Schema
```
http://localhost:7863/openapi.json
```

### Features

The interactive documentation provides:
- **Try-it-out functionality** - Test endpoints directly from the browser
- **Automatic request/response validation**
- **Detailed schema definitions** with examples
- **Complete endpoint descriptions** and parameters
- **Response format examples**

### API Endpoint Groups

1. **Chroma Collection** - Vector search operations
2. **Elasticsearch Index** - Index management (create, delete, mapping)
3. **Elasticsearch Documents** - Document indexing and annotation management
4. **Elasticsearch Query** - Search and query with filtering and faceting

For complete API documentation, see [SWAGGER.md](./SWAGGER.md).

## Key Endpoints

- `POST /chroma/collection/{collection_name}/query` - Hybrid vector and full-text search
- `POST /elastic/index` - Create Elasticsearch index
- `POST /{elastic_index}/_doc` - Index document with full processing (recommended)
- `POST /elastic/index/{index_name}/query` - Query documents with filters
- `POST /elastic/index/{index_name}/doc/{document_id}/annotations` - Add annotations

## Database

#### Chroma DB (Optional)

[https://docs.trychroma.com/]()

1. You can start using chromadb configured with a persistent directory, we will use a db
   whenever they fix this issue [https://github.com/chroma-core/chroma/issues/721]()
2. You can also run the server by following these commands:

Move to the chroma package directory:

```bash
cd ./packages/chroma
```

Run docker container:

```bash
docker-compose up -d
```

Now the database is available on port `8000` and you can follow the instructions here: [https://docs.trychroma.com/usage-guide#running-chroma-in-clientserver-mode]()

#### Elasticsearch

Ensure Elasticsearch is running and accessible. Configure the connection in your environment settings.

## Embedding Model

The service uses sentence transformer models for generating embeddings. The default model is `Alibaba-NLP/gte-multilingual-base` (768 dimensions).

You can configure a different model via the `SENTENCE_TRANSFORMER_EMBEDDING_MODEL` environment variable.

## Configuration

Set up your environment variables for:
- Elasticsearch connection
- Embedding model selection
- Service port
- Other service-specific settings

See `settings.py` for available configuration options.
