from __future__ import annotations

from app.discovery.providers.base import ContactDiscoveryProvider, DiscoveredContact


class ManualProvider(ContactDiscoveryProvider):
    def discover(self, company: str, role: str | None, location: str | None) -> list[DiscoveredContact]:
        return []
