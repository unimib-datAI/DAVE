import uuid
import logging
import time
from pydantic import BaseModel, Field
from typing import Literal, Dict, List, Optional
from fastapi import BackgroundTasks, APIRouter, HTTPException

from similarity import compute_string_similarity

# Jobs are cleaned after this amount of time in seconds
# when a new job is started
MAX_JOB_LIFETIME_SECONDS = 600

logger = logging.getLogger(__name__)


class SimilarityRequest(BaseModel):
    items: List[str]
    threshold: float  # should be [0, 1]


class SimilarityPair(BaseModel):
    firstIndex: int
    secondIndex: int
    score: float


class SimilarityJob(BaseModel):
    # Important: these values are to be kept in sync with the Next.js side
    # in frontend/lib/similarityClient.ts
    status: Literal["pending", "processing", "completed", "failed"] = "pending"
    result: Optional[List[SimilarityPair]] = None

    # Current time by default and ignored in the API response
    created_at: float = Field(default_factory=time.time, exclude=True)


router = APIRouter(prefix="/similarity", tags=["String Similarity"])

similarity_jobs: Dict[str, SimilarityJob] = {}


@router.post(
    "/jobs",
    summary="Start a similarity job that computes the similarity score of pairs of strings in a collection",
    response_description="ID of the job computing the string similarity",
)
def start_job(req: SimilarityRequest, background_tasks: BackgroundTasks):
    remove_expired_jobs()

    job_id = uuid.uuid4().hex
    similarity_jobs[job_id] = SimilarityJob()
    background_tasks.add_task(run_job, job_id, req.items, req.threshold)
    return {"jobId": job_id}


@router.get(
    "/jobs/{job_id}",
    summary="Get the status of the job with the specified ID",
    response_description="""
    A status message that describes the progress of the computation,
    A result object that holds the pairs of indeces of matching strings
    in the list of items, with the relative similarity score
    """,
    response_model=SimilarityJob,
    response_model_exclude_none=True,
)
def get_job(job_id: str):
    job = similarity_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    else:
        return job


def run_job(jobId: str, items: List[str], threshold: float):
    job = similarity_jobs[jobId]
    job.status = "processing"
    try:
        result = compute_string_similarity(items, threshold)
        job.result = result
        job.status = "completed"
    except Exception as e:
        logger.exception(f"Similarity job {jobId} has failed")
        job.status = "failed"


# Remove jobs that have been in the list for longer than the set value
# This is temporary solution to prevent the job dictionary
# from growing indefinitely until the server is reset
def remove_expired_jobs():
    cutoff_time = time.time() - MAX_JOB_LIFETIME_SECONDS
    for job_id, job in list(similarity_jobs.items()):
        if job.created_at < cutoff_time and (
            job.status == "completed" or job.status == "failed"
        ):
            del similarity_jobs[job_id]
