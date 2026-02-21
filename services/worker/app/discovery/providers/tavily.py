from __future__ import annotations

import json
import os
import re
from typing import Any

from fastapi import HTTPException
from openai import OpenAI
from tavily import TavilyClient

from app.discovery.providers.base import ContactDiscoveryProvider, DiscoveredContact

# Default company for LLM when we only have search snippets (no explicit company in text)
DISCOVERY_SYSTEM = """You are a research assistant that finds real people to contact for job outreach at a specific company.
You will receive web search results. Extract any named people who are good contacts for job seeking: recruiters, talent acquisition, hiring managers, or engineering/team leads at the given company.
Output a JSON object with a single key "contacts" whose value is an array of contact objects. Each contact must have:
- full_name (string, required): person's full name
- title (string or null): job title if visible
- company (string, required): the company we are targeting (use the company name provided below)
- email (string or null): only if clearly visible in the snippet; otherwise null
- source (string or null): e.g. "LinkedIn", "company page", "news article"
- linkedin_url (string or null): LinkedIn profile URL if the result URL is linkedin.com/in/... or if a profile URL appears in the content
- relevance_notes (string or null): one short line on why they are a good contact (e.g. "Technical recruiter at company")

Rules:
- Only include people who appear to work at or recruit for the target company.
- If no clear contacts are found in the search results, return {"contacts": []}.
- Do not invent names or URLs. Only extract what is present in the search results.
- Output only valid JSON, no markdown or extra text."""


def _build_search_queries(company: str, role: str | None, location: str | None) -> list[str]:
    """Build Tavily search queries to find recruiters and relevant roles at the company."""
    base = f"{company}"
    if location:
        base = f"{company} {location}"
    queries = [
        f"recruiters talent acquisition {company}",
        f"LinkedIn people {company}",
    ]
    if role:
        queries.append(f"{role} {base}")
    return queries


def _search_results_to_context(response: dict[str, Any]) -> str:
    """Turn Tavily search response into a single text block for the LLM."""
    parts = []
    for i, r in enumerate(response.get("results") or [], 1):
        title = r.get("title") or ""
        url = r.get("url") or ""
        content = r.get("content") or ""
        parts.append(f"[Result {i}] Title: {title}\nURL: {url}\nContent: {content}")
    return "\n\n".join(parts) if parts else ""


def _parse_contacts_from_completion(content: str, company: str) -> list[DiscoveredContact]:
    """Parse OpenAI completion into list of DiscoveredContact. Skips invalid entries."""
    # Strip markdown code block if present
    raw = content.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    data = json.loads(raw)
    contacts_data = data.get("contacts") if isinstance(data, dict) else []
    if not isinstance(contacts_data, list):
        return []

    out = []
    for item in contacts_data:
        if not isinstance(item, dict):
            continue
        # Ensure company is set
        item = dict(item)
        if not item.get("company"):
            item["company"] = company
        # Normalize email: set to None if missing or not a string; keep for validation
        email = item.get("email")
        if not isinstance(email, str) or "@" not in email:
            item["email"] = None
        try:
            out.append(DiscoveredContact.model_validate(item))
        except Exception:
            # If validation fails (e.g. invalid EmailStr), retry without email
            item["email"] = None
            try:
                out.append(DiscoveredContact.model_validate(item))
            except Exception:
                continue
    return out


class TavilyProvider(ContactDiscoveryProvider):
    """Discover contacts using Tavily web search + OpenAI to extract structured contacts."""

    def __init__(
        self,
        tavily_api_key: str | None = None,
        openai_api_key: str | None = None,
    ) -> None:
        self.tavily_api_key = tavily_api_key or os.getenv("TAVILY_API_KEY")
        self.openai_api_key = openai_api_key or os.getenv("OPENAI_API_KEY")

    def discover(self, company: str, role: str | None, location: str | None) -> list[DiscoveredContact]:
        if not self.tavily_api_key:
            raise HTTPException(
                status_code=501,
                detail="Tavily provider not configured. Set TAVILY_API_KEY to enable discovery.",
            )
        if not self.openai_api_key:
            raise HTTPException(
                status_code=501,
                detail="OpenAI API key required for contact extraction. Set OPENAI_API_KEY.",
            )

        client_tavily = TavilyClient(api_key=self.tavily_api_key)
        client_openai = OpenAI(api_key=self.openai_api_key)

        queries = _build_search_queries(company, role, location)
        all_results: list[dict[str, Any]] = []
        seen_urls: set[str] = set()

        for q in queries[:3]:  # cap at 3 queries to save credits
            try:
                response = client_tavily.search(q, max_results=5, search_depth="basic")
            except Exception as e:
                raise HTTPException(status_code=502, detail=f"Tavily search failed: {e}") from e
            for r in response.get("results") or []:
                url = r.get("url") or ""
                if url and url not in seen_urls:
                    seen_urls.add(url)
                    all_results.append(r)

        if not all_results:
            return []

        context = _search_results_to_context({"results": all_results})
        user_content = f"""Target company: {company}
Role filter (optional): {role or "any"}
Location (optional): {location or "any"}

Search results:

{context}

Extract contacts for job outreach at "{company}". Output JSON with "contacts" array."""

        try:
            completion = client_openai.chat.completions.create(
                model="gpt-5.2",
                messages=[
                    {"role": "system", "content": DISCOVERY_SYSTEM},
                    {"role": "user", "content": user_content},
                ],
                response_format={"type": "json_object"},
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"OpenAI completion failed: {e}") from e

        content = (completion.choices[0].message.content or "").strip()
        if not content:
            return []

        return _parse_contacts_from_completion(content, company)
