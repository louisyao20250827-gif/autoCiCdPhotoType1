"""Thin async client for Supabase PostgREST using the service_role key.

Table and column names are all-uppercase in the DB; PostgREST quotes identifiers,
so they must be passed with exact casing (e.g. "CHAT_MESSAGES", "CREATED_AT").
"""

from typing import Any

import httpx


class SupabaseError(Exception):
    def __init__(self, status_code: int, detail: Any):
        super().__init__(f"Supabase error {status_code}: {detail}")
        self.status_code = status_code
        self.detail = detail


class SupabaseRest:
    def __init__(self, url: str, service_role_key: str, client: httpx.AsyncClient | None = None):
        if not url or not service_role_key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        self._client = client or httpx.AsyncClient(
            base_url=f"{url}/rest/v1",
            headers={
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
            },
            timeout=10.0,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        resp = await self._client.get(f"/{table}", params=params)
        return self._json(resp)

    async def insert(
        self,
        table: str,
        row: dict[str, Any],
        on_conflict: str | None = None,
        resolution: str | None = None,  # "merge-duplicates" | "ignore-duplicates"
    ) -> list[dict[str, Any]]:
        prefer = ["return=representation"]
        if resolution:
            prefer.append(f"resolution={resolution}")
        params = {"on_conflict": on_conflict} if on_conflict else None
        resp = await self._client.post(f"/{table}", json=row, params=params, headers={"Prefer": ",".join(prefer)})
        return self._json(resp)

    @staticmethod
    def _json(resp: httpx.Response) -> list[dict[str, Any]]:
        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except ValueError:
                detail = resp.text
            raise SupabaseError(resp.status_code, detail)
        if not resp.content:
            return []
        return resp.json()
