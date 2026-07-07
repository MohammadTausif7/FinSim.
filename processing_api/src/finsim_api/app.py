"""FastAPI routes for temporary statement processing jobs."""

from __future__ import annotations

from contextlib import asynccontextmanager
import os
from typing import Annotated

from fastapi import BackgroundTasks, FastAPI, File, Form, Header, HTTPException, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field

from .accounts import AccountError, AccountService, AuthError, bearer_token
from .service import (
    JobNotFoundError,
    JobStateError,
    JobRecord,
    ProcessingService,
    UploadSource,
)
from .storage import UserDataStore
from .user_analytics import account_analytics_payload


class FeedbackBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transaction_ids: list[str] = Field(min_length=1)
    category: str
    remember_merchant: bool = False


class SignupBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str = Field(min_length=2)
    email: str
    password: str = Field(min_length=8)


class SigninBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str
    password: str


class VerifySigninCodeBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    login_challenge_id: str = Field(min_length=1)
    code: str = Field(min_length=6, max_length=12)


class VerifyEmailBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=1)


class AccountSettingsBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str | None = None
    theme: str | None = None
    monthly_email: bool | None = None


def create_app(
    service: ProcessingService | None = None,
    account_service: AccountService | None = None,
    data_store: UserDataStore | None = None,
) -> FastAPI:
    accounts = account_service or AccountService()
    store = data_store or UserDataStore(accounts.db_path)
    processing = service or ProcessingService(data_store=store)
    if processing.data_store is None:
        processing.data_store = store

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        yield
        processing.clear()

    api = FastAPI(title="FinSim Processing API", version="0.1.0", lifespan=lifespan)
    api.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins(),
        allow_credentials=False,
        allow_methods=["GET", "PATCH", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @api.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @api.post("/api/accounts/signup", status_code=status.HTTP_201_CREATED)
    def signup(body: SignupBody) -> dict[str, object]:
        try:
            return accounts.signup(body.full_name, body.email, body.password)
        except AccountError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @api.post("/api/accounts/verify-email")
    def verify_email(body: VerifyEmailBody) -> dict[str, object]:
        try:
            return {"user": accounts.verify_email(body.token).as_dict()}
        except AccountError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

    @api.post("/api/accounts/signin")
    def signin(body: SigninBody) -> dict[str, object]:
        try:
            return accounts.signin(body.email, body.password)
        except (AccountError, AuthError) as error:
            raise HTTPException(status_code=401, detail=str(error)) from error

    @api.post("/api/accounts/signin/request-code")
    def request_signin_code(body: SigninBody) -> dict[str, object]:
        try:
            return accounts.request_signin_code(body.email, body.password)
        except (AccountError, AuthError) as error:
            raise HTTPException(status_code=401, detail=str(error)) from error

    @api.post("/api/accounts/signin/verify-code")
    def verify_signin_code(body: VerifySigninCodeBody) -> dict[str, object]:
        try:
            return accounts.verify_signin_code(body.login_challenge_id, body.code)
        except (AccountError, AuthError) as error:
            raise HTTPException(status_code=401, detail=str(error)) from error

    @api.post("/api/accounts/signout", status_code=status.HTTP_204_NO_CONTENT)
    def signout(authorization: Annotated[str | None, Header()] = None) -> Response:
        try:
            accounts.signout(bearer_token(authorization))
        except AuthError as error:
            raise HTTPException(status_code=401, detail=str(error)) from error
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @api.get("/api/accounts/me")
    def current_account(authorization: Annotated[str | None, Header()] = None) -> dict[str, object]:
        try:
            return {"user": accounts.get_user_for_session(bearer_token(authorization)).as_dict()}
        except AuthError as error:
            raise HTTPException(status_code=401, detail=str(error)) from error

    @api.patch("/api/accounts/settings")
    def update_account_settings(
        body: AccountSettingsBody,
        authorization: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        try:
            return {
                "user": accounts.update_settings(
                    bearer_token(authorization),
                    full_name=body.full_name,
                    theme=body.theme,
                    monthly_email=body.monthly_email,
                ).as_dict()
            }
        except AccountError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except AuthError as error:
            raise HTTPException(status_code=401, detail=str(error)) from error

    @api.get("/api/accounts/statement-batches")
    def account_statement_batches(
        authorization: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        user = _require_user(accounts, authorization)
        return {"items": processing.statement_batches_for_user(user.user_id)}

    @api.get("/api/accounts/transactions")
    def account_transactions(
        authorization: Annotated[str | None, Header()] = None,
        limit: int = 500,
    ) -> dict[str, object]:
        user = _require_user(accounts, authorization)
        return {"items": processing.transactions_for_user(user.user_id, limit)}

    @api.get("/api/accounts/analytics")
    def account_analytics(
        authorization: Annotated[str | None, Header()] = None,
        limit: int = 2_000,
    ) -> dict[str, object]:
        user = _require_user(accounts, authorization)
        batches = processing.statement_batches_for_user(user.user_id)
        return account_analytics_payload(
            processing.transactions_for_user(user.user_id, limit),
            latest_batch=batches[0] if batches else None,
        )

    @api.post("/api/processing-jobs", status_code=status.HTTP_202_ACCEPTED)
    def create_processing_job(
        background_tasks: BackgroundTasks,
        files: Annotated[list[UploadFile], File(description="Three to twelve PDF statements")],
        upload_mode: Annotated[str, Form()] = "multiple",
        authorization: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        user = _require_user(accounts, authorization)
        uploads = [
            UploadSource(file.filename or "", file.content_type, file.file)
            for file in files
        ]
        try:
            job = processing.create_job(
                uploads,
                user_id=user.user_id,
                merchant_rules=processing.saved_merchant_rules(user.user_id),
                upload_mode=upload_mode,
            )
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        background_tasks.add_task(processing.process_job, job.job_id)
        return processing.job_view(job)

    @api.get("/api/processing-jobs/{job_id}")
    def get_processing_job(
        job_id: str,
        authorization: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        return processing.job_view(_get_owned_job(processing, accounts, job_id, authorization))

    @api.get("/api/processing-jobs/{job_id}/review")
    def get_review_items(
        job_id: str,
        authorization: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        job = _get_owned_job(processing, accounts, job_id, authorization)
        if job.status not in {"review", "complete"}:
            raise HTTPException(status_code=409, detail="Review items are not ready")
        return processing.review_view(job)

    @api.post("/api/processing-jobs/{job_id}/feedback")
    def submit_feedback(
        job_id: str,
        decisions: list[FeedbackBody],
        authorization: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        _get_owned_job(processing, accounts, job_id, authorization)
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
    def get_result(
        job_id: str,
        authorization: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        job = _get_owned_job(processing, accounts, job_id, authorization)
        try:
            return processing.result_view(job)
        except JobStateError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    @api.delete("/api/processing-jobs/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_processing_job(
        job_id: str,
        authorization: Annotated[str | None, Header()] = None,
    ) -> Response:
        _get_owned_job(processing, accounts, job_id, authorization)
        try:
            processing.delete_job(job_id)
        except JobNotFoundError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return api


def _require_user(accounts: AccountService, authorization: str | None):
    try:
        return accounts.get_user_for_session(bearer_token(authorization))
    except AuthError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error


def _get_owned_job(
    processing: ProcessingService,
    accounts: AccountService,
    job_id: str,
    authorization: str | None,
) -> JobRecord:
    user = _require_user(accounts, authorization)
    job = _get_job(processing, job_id)
    if job.user_id != user.user_id:
        raise HTTPException(status_code=404, detail=f"Processing job {job_id!r} was not found")
    return job


def _get_job(processing: ProcessingService, job_id: str):
    try:
        return processing.get_job(job_id)
    except JobNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


def _cors_origins() -> list[str]:
    configured = os.environ.get("FINSIM_CORS_ORIGINS", "")
    origins = [origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()]
    if origins:
        return origins
    return ["http://localhost:5173", "http://127.0.0.1:5173"]


app = create_app()
