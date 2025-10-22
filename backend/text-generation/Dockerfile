FROM python:3.11-slim

# Set the host to 0.0.0.0 for external access
ENV HOST 0.0.0.0

# Install basic system dependencies
RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y git build-essential \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN python3 -m pip install --upgrade pip setuptools fastapi uvicorn sse-starlette pydantic-settings starlette-context

WORKDIR /workspace

COPY ./requirements.txt ./src .

RUN pip install --no-cache-dir -r ./requirements.txt

EXPOSE 7862
ENTRYPOINT ["./entrypoint.sh"]
