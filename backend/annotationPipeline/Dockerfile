FROM python:3.10-slim AS builder

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# PyTorch wheel index. The default PyPI wheel targets CUDA 13, which needs a
# newer driver than the host's; cu124 runs on drivers >= 525.
ARG TORCH_INDEX_URL=https://download.pytorch.org/whl/cu124

COPY requirements.txt /app/requirements.txt

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential git wget ca-certificates \
    && pip install --upgrade pip setuptools wheel \
    && pip install --no-cache-dir torch --index-url ${TORCH_INDEX_URL} \
    && pip install --no-cache-dir --prefer-binary -r /app/requirements.txt \
    && apt-get purge -y --auto-remove build-essential git wget \
    && rm -rf /var/lib/apt/lists/* /root/.cache/pip

FROM python:3.10-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Hugging Face / transformers cache locations (mount a host volume to /cache)
ENV HF_HOME=/cache/huggingface
ENV TRANSFORMERS_CACHE=/cache/transformers
ENV HF_DATASETS_CACHE=/cache/datasets

RUN mkdir -p /cache/huggingface /cache/transformers /cache/datasets

COPY --from=builder /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY . /app

VOLUME ["/cache"]
EXPOSE 8002

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8002"]
