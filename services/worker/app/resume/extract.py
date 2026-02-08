from __future__ import annotations

import io

import pdfplumber


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract plain text from a PDF file. Raises ValueError if PDF is invalid or empty."""
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        parts = []
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                parts.append(text.strip())
        if not parts:
            raise ValueError("No text could be extracted from the PDF. It may be scanned or empty.")
        return "\n\n".join(parts)
