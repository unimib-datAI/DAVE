import logging

import torch
from langchain.text_splitter import RecursiveCharacterTextSplitter
from sentence_transformers import SentenceTransformer


class DocumentChunker:
    def __init__(self, chunk_size: int, chunk_overlap: int, length_function=len):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=length_function,
        )

    def chunk(self, text: str):
        return [
            doc.page_content
            for doc in self.text_splitter.create_documents(texts=[text])
        ]


class Embedder:
    _model_name = "distiluse-base-multilingual-cased-v1"
    _tokenizer = None
    _model = None

    def __init__(self):
        self.embeddings = None
        # Automatically detect CUDA availability
        device = "cuda" if torch.cuda.is_available() else "cpu"
        if device == "cpu":
            logging.info("CUDA not available in Embedder, using CPU")
        else:
            logging.info(f"Using GPU in Embedder: {torch.cuda.get_device_name(0)}")
        self._model = SentenceTransformer(self._model_name).to(device)

    def embed(self, text):
        embedding_list = self._model.encode(text)
        self.embeddings = embedding_list
        return embedding_list
