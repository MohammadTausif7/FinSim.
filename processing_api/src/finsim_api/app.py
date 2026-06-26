"""FastAPI routes for temporary statement processing jobs."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from .service import (
    JobNotFoundError,
    JobStateError,
    ProcessingService,
    UploadSource,
)


class FeedbackBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transaction_ids: list[str] = Field(min_length=1)
    category: str
    remember_merchant: bool = False


def create_app(service: ProcessingService | None = None) -> FastAPI:
    processing = service or ProcessingService()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
        processing.clear()

    api = FastAPI(title="FinSim Processing API", version="0.1.0", lifespan=lifespan)
    api.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @api.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @api.post("/api/processing-jobs", status_code=status.HTTP_202_ACCEPTED)
    def create_processing_job(
        background_tasks: BackgroundTasks,
        files: Annotated[list[UploadFile], File(description="Three to twelve PDF statements")],
    ) -> dict[str, object]:
        uploads = [
            UploadSource(file.filename or "", file.content_type, file.file)
            for file in files
        ]
        try:
            job = processing.create_job(uploads)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        background_tasks.add_task(processing.process_job, job.job_id)
        return processing.job_view(job)

    @api.get("/api/processing-jobs/{job_id}")
    def get_processing_job(job_id: str) -> dict[str, object]:
        return processing.job_view(_get_job(processing, job_id))

    @api.get("/api/processing-jobs/{job_id}/review")
    def get_review_items(job_id: str) -> dict[str, object]:
        job = _get_job(processing, job_id)
        if job.status not in {"review", "complete"}:
            raise HTTPException(status_code=409, detail="Review items are not ready")
        return processing.review_view(job)

    @api.post("/api/processing-jobs/{job_id}/feedback")
    def submit_feedback(job_id: str, decisions: list[FeedbackBody]) -> dict[str, object]:
        payload = [decision.model_dump() for decision in decisions]
        try:
            job = processing.apply_job_feedback(job_id, payload)
        except JobNotFoundError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except JobStateError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        return processing.job_view(job)

    @api.get("/api/processing-jobs/{job_id}/result")
    def get_result(job_id: str) -> dict[str, object]:
        try:
            return processing.result_view(_get_job(processing, job_id))
        except JobStateError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    @api.delete("/api/processing-jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_processing_job(job_id: str) -> Response:
        try:
            processing.delete_job(job_id)
        except JobNotFoundError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return api


def _get_job(processing: ProcessingService, job_id: str):
    try:
        return processing.get_job(job_id)
    except JobNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


app = create_app()
