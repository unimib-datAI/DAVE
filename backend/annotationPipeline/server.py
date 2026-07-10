from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pipeline import PipelineInformationExtractorRefined

app = FastAPI(title="Annotation Pipeline")

# instantiate once (may be heavy)
try:
    extractor = PipelineInformationExtractorRefined()
except Exception as e:
    # keep extractor as None and raise on request if model fails to load
    extractor = None
    _load_error = e


async def _extract_text(request: Request) -> str:
    """Accept either a raw `text/plain` body (manual/curl testing) or a JSON
    body with a `text` field (the format the Next.js annotation pipeline
    sends when chaining this service with other pipeline steps - each step
    receives/returns the evolving gatenlp-style document as JSON, not plain
    text)."""
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        payload = await request.json()
        if isinstance(payload, dict):
            text = payload.get("text")
            if not isinstance(text, str):
                raise HTTPException(
                    status_code=422,
                    detail="JSON body must contain a string 'text' field",
                )
            return text
        if isinstance(payload, str):
            return payload
        raise HTTPException(
            status_code=422,
            detail="JSON body must be a string or an object with a 'text' field",
        )
    body = await request.body()
    return body.decode("utf-8")


@app.post("/annotate")
async def annotate(request: Request):
    """Run the annotation pipeline and return annotated JSON."""
    if extractor is None:
        raise HTTPException(status_code=500, detail=f"Model failed to load: {_load_error}")

    text = await _extract_text(request)
    try:
        docs = {"input": text}
        result = extractor.process(docs, save=False)
        annotated = result.get("input") or result.get("input.txt") or result
        return JSONResponse(content=annotated)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/annotate/w3c")
async def annotate_w3c(request: Request):
    """Run the annotation pipeline and return the result as a W3C Web
    Annotation cell (TextPositionSelector spans), matching the SemTUI W3C
    table cell format."""
    if extractor is None:
        raise HTTPException(status_code=500, detail=f"Model failed to load: {_load_error}")

    text = await _extract_text(request)
    try:
        docs = {"input": text}
        result = extractor.process_w3c(docs)
        annotated = result.get("input") or result.get("input.txt") or result
        return JSONResponse(content=annotated)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="0.0.0.0", port=8000, log_level="info")
