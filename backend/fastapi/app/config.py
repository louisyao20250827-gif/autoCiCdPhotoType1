import os
from dataclasses import dataclass, field


def _split(value: str) -> list[str]:
    return [v.strip() for v in value.split(",") if v.strip()]


@dataclass(frozen=True)
class Settings:
    supabase_url: str = field(default_factory=lambda: os.environ.get("SUPABASE_URL", "").rstrip("/"))
    # service_role key: server-side only, never ship to web/APK
    supabase_service_role_key: str = field(default_factory=lambda: os.environ.get("SUPABASE_SERVICE_ROLE_KEY", ""))
    # exact origins, e.g. https://chat-react.vercel.app,https://chat-webview.vercel.app
    cors_origins: list[str] = field(default_factory=lambda: _split(os.environ.get("CORS_ORIGINS", "")))
    # regex for Vercel preview URLs, e.g. ^https://chat-.*\.vercel\.app$
    cors_origin_regex: str | None = field(default_factory=lambda: os.environ.get("CORS_ORIGIN_REGEX") or None)
    # max POSTs per client IP per minute (in-memory; resets on restart)
    write_rate_limit_per_minute: int = field(
        default_factory=lambda: int(os.environ.get("WRITE_RATE_LIMIT_PER_MINUTE", "20"))
    )


def get_settings() -> Settings:
    return Settings()
