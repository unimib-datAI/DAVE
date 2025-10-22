import asyncio
import uvicorn
import os
from typing import Optional, List
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage


# Get configuration from environment variables
TEXT_GENERATION_ADDR = os.getenv("TEXT_GENERATION_ADDR", "http://localhost:8000")
TEXT_GENERATION_KEY = os.getenv("TEXT_GENERATION_KEY", "your-key")
MODEL_NAME = os.getenv("MODEL_NAME", "default-model")

# Ensure the address ends with /v1 for OpenAI compatibility
if not TEXT_GENERATION_ADDR.endswith("/v1"):
    LLM_API_BASE_URL = f"{TEXT_GENERATION_ADDR}/v1"
else:
    LLM_API_BASE_URL = TEXT_GENERATION_ADDR

# Setup FastAPI:
app = FastAPI()
semaphore = asyncio.Semaphore(1)

# I need open CORS for my setup, you may not!!
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# -------


# Health check endpoint
@app.get("/check")
def check():
    return {"status": "running", "model": MODEL_NAME, "api_base": LLM_API_BASE_URL}


class CountTokensRequest(BaseModel):
    inputs: str


@app.post("/count-tokens")
def count_tokens(req: CountTokensRequest):
    # Token counting not implemented for OpenAI compatible mode
    return len(req.inputs.split()) * 1.3  # rough estimate


class GenerateRequest(BaseModel):
    messages: List[dict]
    max_new_tokens: Optional[int] = 200
    temperature: Optional[float] = 0.7
    top_k: Optional[int] = 20
    top_p: Optional[float] = 0.65
    min_p: Optional[float] = 0.06
    token_repetition_penalty_max: Optional[float] = 1.15
    token_repetition_penalty_sustain: Optional[int] = 256
    token_repetition_penalty_decay: Optional[int] = None
    stream: Optional[bool] = True


def stream_resp(llm, messages):
    response = llm.stream(messages)
    for chunk in response:
        yield chunk.content


def prepare_messages(messages):
    prepared_messages = []
    for message in messages:
        if message["role"] == "user":
            prepared_messages.append(
                HumanMessage(content=message["content"]),
            )
        elif message["role"] == "system":
            print("system", message["content"])
            prepared_messages.append(
                SystemMessage(content=message["content"]),
            )
    return prepared_messages


@app.post("/generate")
async def stream_data(req: GenerateRequest):
    while True:
        try:
            # Attempt to acquire the semaphore without waiting, in a loop...
            await asyncio.wait_for(semaphore.acquire(), timeout=0.1)
            break
        except asyncio.TimeoutError:
            print("Server is busy")
            await asyncio.sleep(1)

    try:
        print("stream", req.messages)
        llm = ChatOpenAI(
            openai_api_base=LLM_API_BASE_URL,
            openai_api_key=TEXT_GENERATION_KEY,
            model_name=MODEL_NAME,
            streaming=True,
            temperature=req.temperature,
            top_p=req.top_p,
            max_tokens=req.max_new_tokens,
            frequency_penalty=req.token_repetition_penalty_max,
        )
        prep_messages = prepare_messages(req.messages)
        return StreamingResponse(
            stream_resp(llm, prep_messages), media_type="text/event-stream"
        )

    except Exception as e:
        print("Exception", e)
        return {"response": f"Exception while processing request: {e}"}

    finally:
        semaphore.release()


@app.post("/generate-test")
async def stream_data_test(req: GenerateRequest):
    while True:
        try:
            # Attempt to acquire the semaphore without waiting, in a loop...
            await asyncio.wait_for(semaphore.acquire(), timeout=0.1)
            break
        except asyncio.TimeoutError:
            print("Server is busy")
            await asyncio.sleep(1)

    try:
        # Test endpoint - returns empty response
        return {"response": "Test endpoint - not implemented"}
    except Exception as e:
        print("Exception", e)
        return {"response": f"Exception while processing request: {e}"}

    finally:
        semaphore.release()


# -------


if __name__ == "__main__":
    _PORT = 7862
    uvicorn.run(app, host="0.0.0.0", port=_PORT)
