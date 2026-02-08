from __future__ import annotations

from fastapi import HTTPException

from app.discovery.providers.base import ContactDiscoveryProvider, DiscoveredContact


class GeminiProvider(ContactDiscoveryProvider):
    def __init__(self, api_key: str | None) -> None:
        self.api_key = api_key

    def discover(self, company: str, role: str | None, location: str | None) -> list[DiscoveredContact]:
        if not self.api_key:
            raise HTTPException(
                status_code=501,
                detail="Gemini provider not configured. Set GEMINI_API_KEY to enable discovery.",
            )

        raise HTTPException(
            status_code=501,
            detail="Gemini discovery provider wiring is pending. We'll implement search + parsing next.",
        )
