"""API tests with an in-memory fake of SupabaseRest (no network, no real DB)."""

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app import main
from app.main import app, get_db

SESSION_ID = "00000000-0000-4000-8000-000000000001"


class FakeDb:
    def __init__(self):
        self.tables = {
            "CLIENT_APPS": [],
            "CHAT_SESSIONS": [
                {"SESSION_ID": SESSION_ID, "TITLE": "公開大廳", "IS_PUBLIC": True,
                 "LAST_MESSAGE_AT": None, "CREATED_AT": "2026-11-08T00:00:00+00:00"},
            ],
            "CHAT_MESSAGES": [],
            "MESSAGE_FEEDBACK": [],
            "DEPLOY_LOGS": [],
        }

    @staticmethod
    def _match(row, params):
        for key, cond in params.items():
            if key in ("select", "order", "limit"):
                continue
            op, _, val = cond.partition(".")
            cell = row.get(key)
            if op == "eq" and str(cell) != val:
                return False
            if op == "is" and cell is not (val == "true"):
                return False
            if op == "lt" and not (cell < val):
                return False
        return True

    async def select(self, table, params):
        rows = [r for r in self.tables[table] if self._match(r, params)]
        if params.get("order", "").startswith("CREATED_AT.desc"):
            rows.sort(key=lambda r: r["CREATED_AT"], reverse=True)
        if "limit" in params:
            rows = rows[: int(params["limit"])]
        return rows

    async def insert(self, table, row, on_conflict=None, resolution=None):
        rows = self.tables[table]
        if on_conflict:
            keys = on_conflict.split(",")
            existing = next((r for r in rows if all(r.get(k) == row.get(k) for k in keys)), None)
            if existing:
                if resolution == "ignore-duplicates":
                    return []
                existing.update(row)
                return [existing]
        new = dict(row)
        if table == "CHAT_MESSAGES":
            new.setdefault("MESSAGE_ID", str(uuid.uuid4()))
            new.setdefault("IS_DELETED", False)
            new.setdefault("CREATED_AT", datetime.now(timezone.utc).isoformat())
        rows.append(new)
        return [new]


@pytest.fixture
def client():
    db = FakeDb()
    main._hits.clear()
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app), db
    app.dependency_overrides.clear()


def test_health(client):
    c, _ = client
    assert c.get("/health").json()["status"] == "ok"


def test_post_then_list_messages(client):
    c, _ = client
    r = c.post(f"/api/sessions/{SESSION_ID}/messages",
               json={"sender_name": "小明", "content": "哈囉", "app_id": 5})
    assert r.status_code == 201
    assert r.json()["content"] == "哈囉"

    msgs = c.get(f"/api/sessions/{SESSION_ID}/messages").json()
    assert [m["content"] for m in msgs] == ["哈囉"]


def test_client_message_id_is_idempotent(client):
    c, db = client
    body = {"sender_name": "A", "content": "x", "app_id": 1, "client_message_id": "abc"}
    first = c.post(f"/api/sessions/{SESSION_ID}/messages", json=body)
    second = c.post(f"/api/sessions/{SESSION_ID}/messages", json=body)
    assert first.status_code == 201
    assert second.status_code == 200
    assert first.json()["message_id"] == second.json()["message_id"]
    assert len(db.tables["CHAT_MESSAGES"]) == 1


def test_rejects_blank_and_unknown_app(client):
    c, _ = client
    url = f"/api/sessions/{SESSION_ID}/messages"
    assert c.post(url, json={"sender_name": "A", "content": "   ", "app_id": 1}).status_code == 422
    assert c.post(url, json={"sender_name": "A", "content": "x", "app_id": 8}).status_code == 422


def test_unknown_session_404(client):
    c, _ = client
    r = c.post(f"/api/sessions/{uuid.uuid4()}/messages", json={"sender_name": "A", "content": "x", "app_id": 1})
    assert r.status_code == 404


def test_feedback_upsert_counts_once_per_voter(client):
    c, _ = client
    mid = c.post(f"/api/sessions/{SESSION_ID}/messages",
                 json={"sender_name": "A", "content": "x", "app_id": 1}).json()["message_id"]
    c.post(f"/api/messages/{mid}/feedback", json={"voter_key": "dev-1", "rating": 1})
    r = c.post(f"/api/messages/{mid}/feedback", json={"voter_key": "dev-1", "rating": -1})
    assert r.json() == {"message_id": mid, "up": 0, "down": 1}


def test_rate_limit(client):
    c, _ = client
    url = f"/api/sessions/{SESSION_ID}/messages"
    codes = [c.post(url, json={"sender_name": "A", "content": str(i), "app_id": 1}).status_code
             for i in range(main.settings.write_rate_limit_per_minute + 1)]
    assert codes[-1] == 429
