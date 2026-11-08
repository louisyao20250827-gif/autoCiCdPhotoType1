import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .db import SupabaseError, SupabaseRest
from .schemas import (
    ChatMessage,
    ChatSession,
    ClientApp,
    DeployLog,
    FeedbackCreate,
    MessageCreate,
)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = SupabaseRest(settings.supabase_url, settings.supabase_service_role_key)
    yield
    await app.state.db.aclose()


app = FastAPI(title="Chat Log API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


def get_db(request: Request) -> SupabaseRest:
    return request.app.state.db


@app.exception_handler(SupabaseError)
async def supabase_error_handler(_: Request, exc: SupabaseError) -> JSONResponse:
    return JSONResponse(status_code=502, content={"detail": "database error", "upstream": exc.detail})


# ---------------------------------------------------------------- rate limit
_hits: dict[str, deque[float]] = defaultdict(deque)


def write_rate_limit(request: Request) -> None:
    forwarded = request.headers.get("x-forwarded-for", "")
    ip = forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")
    now = time.monotonic()
    q = _hits[ip]
    while q and now - q[0] > 60:
        q.popleft()
    if len(q) >= settings.write_rate_limit_per_minute:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too many requests, slow down")
    q.append(now)


# ---------------------------------------------------------------- helpers
async def _require_public_session(db: SupabaseRest, session_id: UUID) -> None:
    rows = await db.select(
        "CHAT_SESSIONS",
        {"select": "SESSION_ID", "SESSION_ID": f"eq.{session_id}", "IS_PUBLIC": "is.true"},
    )
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "session not found")


async def _get_visible_message(db: SupabaseRest, message_id: UUID) -> dict | None:
    rows = await db.select(
        "CHAT_MESSAGES",
        {"select": "MESSAGE_ID,SESSION_ID", "MESSAGE_ID": f"eq.{message_id}", "IS_DELETED": "is.false"},
    )
    return rows[0] if rows else None


# ---------------------------------------------------------------- routes
@app.get("/health")
async def health() -> dict:
    # RENDER_GIT_COMMIT is injected by Render; CI waits until it equals the pushed SHA
    return {"status": "ok", "commit": os.environ.get("RENDER_GIT_COMMIT")}


@app.get("/api/apps", response_model=list[ClientApp])
async def list_apps(db: SupabaseRest = Depends(get_db)):
    rows = await db.select("CLIENT_APPS", {"select": "*", "order": "APP_ID.asc"})
    return [ClientApp.from_row(r) for r in rows]


@app.get("/api/sessions", response_model=list[ChatSession])
async def list_sessions(db: SupabaseRest = Depends(get_db)):
    rows = await db.select(
        "CHAT_SESSIONS",
        {"select": "*", "IS_PUBLIC": "is.true", "order": "LAST_MESSAGE_AT.desc.nullslast,CREATED_AT.desc"},
    )
    return [ChatSession.from_row(r) for r in rows]


@app.get("/api/sessions/{session_id}/messages", response_model=list[ChatMessage])
async def list_messages(
    session_id: UUID,
    limit: int = Query(50, ge=1, le=200),
    before: datetime | None = Query(None, description="ISO timestamp; returns messages older than this"),
    db: SupabaseRest = Depends(get_db),
):
    await _require_public_session(db, session_id)
    params = {
        "select": "*",
        "SESSION_ID": f"eq.{session_id}",
        "IS_DELETED": "is.false",
        "order": "CREATED_AT.desc",
        "limit": str(limit),
    }
    if before:
        params["CREATED_AT"] = f"lt.{before.isoformat()}"
    rows = await db.select("CHAT_MESSAGES", params)
    # newest page fetched, returned oldest-first for display
    return [ChatMessage.from_row(r) for r in reversed(rows)]


@app.post(
    "/api/sessions/{session_id}/messages",
    response_model=ChatMessage,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(write_rate_limit)],
)
async def create_message(
    session_id: UUID,
    body: MessageCreate,
    response: Response,
    db: SupabaseRest = Depends(get_db),
):
    await _require_public_session(db, session_id)
    if body.parent_message_id:
        parent = await _get_visible_message(db, body.parent_message_id)
        if not parent or parent["SESSION_ID"] != str(session_id):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "parent_message_id not in this session")

    row = {
        "SESSION_ID": str(session_id),
        "SENDER_NAME": body.sender_name,
        "SENDER_ROLE": "user",
        "CONTENT": body.content,
        "APP_ID": body.app_id,
        "CLIENT_MESSAGE_ID": body.client_message_id,
        "PARENT_MESSAGE_ID": str(body.parent_message_id) if body.parent_message_id else None,
    }
    if body.client_message_id:
        rows = await db.insert(
            "CHAT_MESSAGES", row, on_conflict="SESSION_ID,CLIENT_MESSAGE_ID", resolution="ignore-duplicates"
        )
        if not rows:  # retry of an already-stored message -> return the original
            rows = await db.select(
                "CHAT_MESSAGES",
                {
                    "select": "*",
                    "SESSION_ID": f"eq.{session_id}",
                    "CLIENT_MESSAGE_ID": f"eq.{body.client_message_id}",
                },
            )
            response.status_code = status.HTTP_200_OK
    else:
        rows = await db.insert("CHAT_MESSAGES", row)
    return ChatMessage.from_row(rows[0])


@app.post("/api/messages/{message_id}/feedback", dependencies=[Depends(write_rate_limit)])
async def upsert_feedback(message_id: UUID, body: FeedbackCreate, db: SupabaseRest = Depends(get_db)) -> dict:
    if not await _get_visible_message(db, message_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "message not found")
    await db.insert(
        "MESSAGE_FEEDBACK",
        {
            "MESSAGE_ID": str(message_id),
            "VOTER_KEY": body.voter_key,
            "RATING": body.rating,
            "UPDATED_AT": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="MESSAGE_ID,VOTER_KEY",
        resolution="merge-duplicates",
    )
    return await get_feedback_summary(message_id, db)


@app.get("/api/messages/{message_id}/feedback")
async def get_feedback_summary(message_id: UUID, db: SupabaseRest = Depends(get_db)) -> dict:
    rows = await db.select("MESSAGE_FEEDBACK", {"select": "RATING", "MESSAGE_ID": f"eq.{message_id}"})
    up = sum(1 for r in rows if r["RATING"] == 1)
    return {"message_id": str(message_id), "up": up, "down": len(rows) - up}


@app.get("/api/deploy-logs", response_model=list[DeployLog])
async def list_deploy_logs(
    app_id: int | None = None,
    limit: int = Query(20, ge=1, le=100),
    db: SupabaseRest = Depends(get_db),
):
    params = {"select": "*", "order": "CREATED_AT.desc", "limit": str(limit)}
    if app_id is not None:
        params["APP_ID"] = f"eq.{app_id}"
    rows = await db.select("DEPLOY_LOGS", params)
    return [DeployLog.from_row(r) for r in rows]
