from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel, EmailStr, Field


class DiscoveredContact(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    title: str | None = Field(default=None, max_length=200)
    company: str = Field(min_length=2, max_length=200)
    email: EmailStr | None = None
    source: str | None = Field(default=None, max_length=100)


class ContactDiscoveryProvider(Protocol):
    def discover(self, company: str, role: str | None, location: str | None) -> list[DiscoveredContact]:
        ...
