FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /workspace

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY ./src ./

# Install PyTorch: the CPU wheel by default (compatible with macOS/no CUDA); set
# TORCH_INDEX_URL to a CUDA index (e.g. .../whl/cu130) to build for a GPU.
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir torch torchvision torchaudio --index-url ${TORCH_INDEX_URL}

# Install other requirements
RUN pip install --no-cache-dir -r ./requirements.txt

# Build-time default: compose sets this variable only at runtime, and an empty
# EXPOSE fails the build (podman).
ARG INDEXER_SERVER_PORT=7863
EXPOSE ${INDEXER_SERVER_PORT}

CMD python app.py
