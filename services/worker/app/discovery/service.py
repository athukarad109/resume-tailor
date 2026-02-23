from __future__ import annotations

import os

from fastapi import HTTPException

from app.discovery.providers.base import ContactDiscoveryProvider
from app.discovery.providers.gemini import GeminiProvider
from app.discovery.providers.manual import ManualProvider


def get_provider() -> ContactDiscoveryProvider:
    provider_name = os.getenv("CONTACT_DISCOVERY_PROVIDER", "manual").lower()

    if provider_name == "manual":
        return ManualProvider()

    if provider_name == "gemini":
        return GeminiProvider(api_key=os.getenv("GEMINI_API_KEY"))

    if provider_name == "tavily":
        try:
            from app.discovery.providers.tavily import TavilyProvider
        except ModuleNotFoundError as e:
            if "tavily" in str(e).lower():
                raise HTTPException(
                    status_code=500,
                    detail="Tavily provider requires the 'tavily-python' package. Install it with: pip install tavily-python",
                ) from e
            raise
        return TavilyProvider()

    raise HTTPException(status_code=400, detail=f"Unknown discovery provider: {provider_name}")
