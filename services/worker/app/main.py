from __future__ import annotations

import base64
import os
from datetime import datetime

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from starlette.responses import Response

load_dotenv()
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import Column, DateTime, Integer, String, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.discovery.providers.base import DiscoveredContact
from app.discovery.service import get_provider
from app.resume.extract import extract_text_from_pdf
from app.resume.pdf_gen import html_to_pdf_bytes, text_to_pdf_bytes
from app.resume.tailor import tailor_resume

DATABASE_URL = os.getenv("CONTACTS_DATABASE_URL", "sqlite:///./contacts.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Contact(Base):
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(200), nullable=False)
    title = Column(String(200), nullable=True)
    company = Column(String(200), nullable=False)
    email = Column(String(320), nullable=True)
    source = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class ContactCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    title: str | None = Field(default=None, max_length=200)
    company: str = Field(min_length=2, max_length=200)
    email: EmailStr | None = None
    source: str | None = Field(default=None, max_length=100)


class ContactOut(BaseModel):
    id: int
    full_name: str
    title: str | None
    company: str
    email: EmailStr | None
    source: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DiscoverRequest(BaseModel):
    company: str = Field(min_length=2, max_length=200)
    role: str | None = Field(default=None, max_length=200)
    location: str | None = Field(default=None, max_length=200)


class DiscoverResponse(BaseModel):
    requested_company: str
    contacts: list[ContactOut]


Base.metadata.create_all(bind=engine)

app = FastAPI(title="Contact Discovery Worker")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/contacts", response_model=ContactOut)
def create_contact(payload: ContactCreate) -> ContactOut:
    with SessionLocal() as db:
        contact = Contact(
            full_name=payload.full_name,
            title=payload.title,
            company=payload.company,
            email=str(payload.email) if payload.email else None,
            source=payload.source,
        )
        db.add(contact)
        db.commit()
        db.refresh(contact)
        return ContactOut.model_validate(contact)


@app.get("/contacts", response_model=list[ContactOut])
def list_contacts(company: str | None = None) -> list[ContactOut]:
    with SessionLocal() as db:
        query = db.query(Contact)
        if company:
            query = query.filter(Contact.company.ilike(f"%{company}%"))
        return [ContactOut.model_validate(row) for row in query.order_by(Contact.created_at.desc()).all()]


def upsert_contact(db: sessionmaker, candidate: DiscoveredContact) -> Contact:
    if candidate.email:
        existing = db.query(Contact).filter(Contact.email == str(candidate.email)).first()
    else:
        existing = (
            db.query(Contact)
            .filter(Contact.full_name == candidate.full_name, Contact.company == candidate.company)
            .first()
        )

    if existing:
        if candidate.title and not existing.title:
            existing.title = candidate.title
        if candidate.source and not existing.source:
            existing.source = candidate.source
        if candidate.email and not existing.email:
            existing.email = str(candidate.email)
        db.commit()
        db.refresh(existing)
        return existing

    contact = Contact(
        full_name=candidate.full_name,
        title=candidate.title,
        company=candidate.company,
        email=str(candidate.email) if candidate.email else None,
        source=candidate.source,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@app.post("/discover", response_model=DiscoverResponse)
def discover_contacts(payload: DiscoverRequest) -> DiscoverResponse:
    provider = get_provider()
    candidates = provider.discover(payload.company, payload.role, payload.location)

    if not candidates:
        raise HTTPException(status_code=404, detail="No contacts found yet for this company")

    with SessionLocal() as db:
        saved_contacts = [upsert_contact(db, candidate) for candidate in candidates]
        contacts = [ContactOut.model_validate(row) for row in saved_contacts]

    return DiscoverResponse(requested_company=payload.company, contacts=contacts)


class TailorResumeResponse(BaseModel):
    tailored_resume: str
    pdf_base64: str


@app.post("/resume/tailor", response_model=TailorResumeResponse)
async def resume_tailor(
    resume: UploadFile = File(..., description="Resume PDF file"),
    job_description: str = Form(..., min_length=50, description="Job description to tailor for"),
) -> TailorResumeResponse:
    if not resume.filename or not resume.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Resume must be a PDF file")
    try:
        raw = await resume.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read resume file: {e}") from e
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Resume file must be under 10 MB")
    try:
        resume_text = extract_text_from_pdf(raw)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    try:
        tailored = tailor_resume(resume_text, job_description)
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    pdf_bytes = text_to_pdf_bytes(tailored)
    pdf_base64 = base64.b64encode(pdf_bytes).decode("ascii")
    return TailorResumeResponse(tailored_resume=tailored, pdf_base64=pdf_base64)


class ResumeToPdfRequest(BaseModel):
    resume_text: str | None = Field(default=None, description="Plain resume text")
    resume_html: str | None = Field(default=None, description="Resume as HTML (p, h2, ul/li, b, i, u)")


@app.post("/resume/to-pdf")
async def resume_to_pdf(payload: ResumeToPdfRequest) -> Response:
    """Generate a PDF from resume text or HTML (for editing + download)."""
    if payload.resume_html:
        try:
            pdf_bytes = html_to_pdf_bytes(payload.resume_html)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
    elif payload.resume_text:
        try:
            pdf_bytes = text_to_pdf_bytes(payload.resume_text)
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
    else:
        raise HTTPException(status_code=400, detail="Provide resume_text or resume_html")
    return Response(content=pdf_bytes, media_type="application/pdf")
