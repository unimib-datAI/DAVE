from fastapi import FastAPI, Body, HTTPException
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


@app.post("/annotate")
async def annotate(text: str = Body(..., media_type="text/plain")):
    """Accept plain text body, run annotation pipeline and return annotated JSON."""
    if extractor is None:
        raise HTTPException(status_code=500, detail=f"Model failed to load: {_load_error}")

    try:
        docs = {"input": text}
        result = extractor.process(docs, save=False)
        annotated = result.get("input") or result.get("input.txt") or result
        return JSONResponse(content=annotated)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="0.0.0.0", port=8000, log_level="info")
