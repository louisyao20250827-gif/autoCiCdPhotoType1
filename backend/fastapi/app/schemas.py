"""API models use lowercase snake_case; DB uses UPPERCASE. Mapping lives here."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class ClientApp(BaseModel):
    app_id: int
    app_code: str
    app_name: str
    platform: str
    framework: str
    deploy_target: str
    public_url: str | None
    is_active: bool

    @classmethod
    def from_row(cls, r: dict[str, Any]) -> "ClientApp":
        return cls(
            app_id=r["APP_ID"],
            app_code=r["APP_CODE"],
            app_name=r["APP_NAME"],
            platform=r["PLATFORM"],
            framework=r["FRAMEWORK"],
            deploy_target=r["DEPLOY_TARGET"],
            public_url=r.get("PUBLIC_URL"),
            is_active=r["IS_ACTIVE"],
        )


class ChatSession(BaseModel):
    session_id: UUID
    title: str
    last_message_at: datetime | None
    created_at: datetime

    @classmethod
    def from_row(cls, r: dict[str, Any]) -> "ChatSession":
        return cls(
            session_id=r["SESSION_ID"],
            title=r["TITLE"],
            last_message_at=r.get("LAST_MESSAGE_AT"),
            created_at=r["CREATED_AT"],
        )


class ChatMessage(BaseModel):
    message_id: UUID
    session_id: UUID
    parent_message_id: UUID | None
    sender_name: str
    sender_role: str
    content: str
    app_id: int | None
    client_message_id: str | None
    created_at: datetime

    @classmethod
    def from_row(cls, r: dict[str, Any]) -> "ChatMessage":
        return cls(
            message_id=r["MESSAGE_ID"],
            session_id=r["SESSION_ID"],
            parent_message_id=r.get("PARENT_MESSAGE_ID"),
            sender_name=r["SENDER_NAME"],
            sender_role=r["SENDER_ROLE"],
            content=r["CONTENT"],
            app_id=r.get("APP_ID"),
            client_message_id=r.get("CLIENT_MESSAGE_ID"),
            created_at=r["CREATED_AT"],
        )


class MessageCreate(BaseModel):
    sender_name: str = Field(min_length=1, max_length=50)
    content: str = Field(min_length=1, max_length=4000)
    app_id: Literal[1, 2, 3, 4, 5]
    client_message_id: str | None = Field(default=None, max_length=100)
    parent_message_id: UUID | None = None

    @field_validator("sender_name", "content")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("must not be blank")
        return v


class FeedbackCreate(BaseModel):
    voter_key: str = Field(min_length=1, max_length=100)
    rating: Literal[-1, 1]


class Feedback(BaseModel):
    message_id: UUID
    voter_key: str
    rating: int

    @classmethod
    def from_row(cls, r: dict[str, Any]) -> "Feedback":
        return cls(message_id=r["MESSAGE_ID"], voter_key=r["VOTER_KEY"], rating=r["RATING"])


class DeployLog(BaseModel):
    deploy_id: int
    app_id: int
    status: str
    git_sha: str | None
    git_ref: str | None
    workflow_run_url: str | None
    artifact_url: str | None
    message: str | None
    created_at: datetime

    @classmethod
    def from_row(cls, r: dict[str, Any]) -> "DeployLog":
        return cls(
            deploy_id=r["DEPLOY_ID"],
            app_id=r["APP_ID"],
            status=r["STATUS"],
            git_sha=r.get("GIT_SHA"),
            git_ref=r.get("GIT_REF"),
            workflow_run_url=r.get("WORKFLOW_RUN_URL"),
            artifact_url=r.get("ARTIFACT_URL"),
            message=r.get("MESSAGE"),
            created_at=r["CREATED_AT"],
        )
