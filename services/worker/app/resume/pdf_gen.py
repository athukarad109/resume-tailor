from __future__ import annotations

import io
import re
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)


def _escape_amp_for_reportlab(s: str) -> str:
    """Escape & for ReportLab XML only when not already an entity (avoid double-escaping &amp;)."""
    return re.sub(r"&(?!amp;|lt;|gt;|quot;|#\d+;|#x[0-9a-f]+;)", "&amp;", s, flags=re.IGNORECASE)


def _bold_to_xml(text: str) -> str:
    """Convert **bold** to ReportLab <b> tags; escape & for XML."""
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text, flags=re.DOTALL)
    text = _escape_amp_for_reportlab(text)
    return text


# Bullet markers we normalize to a single list style (hyphen in PDF)
_BULLET_PREFIXES = "-•–—*"  # hyphen, bullet, en-dash, em-dash, asterisk
_LIST_MARKER = "-   "  # hyphen + spaces for each point
# Unicode dash variants that should be treated as bullet (hyphen-minus, hyphen, en-dash, em-dash, etc.)
_UNICODE_DASHES = "\u002d\u2010\u2011\u2012\u2013\u2014\u2015\u2212\ufeff"
# Unicode bullet variants (• U+2022, ‣ U+2023, ∙ U+2219, etc.) – normalize to hyphen for detection
_UNICODE_BULLETS = "\u2022\u2023\u2219\u2043\u00b7"


def _normalize_bullet_line(line: str) -> str:
    """Strip and normalize dash-like and bullet-like characters so we reliably detect and strip them."""
    s = line.strip().replace("\xa0", " ")
    for u in _UNICODE_DASHES:
        s = s.replace(u, "-")
    for u in _UNICODE_BULLETS:
        s = s.replace(u, "-")
    return s.strip()


def _is_bullet_line(line: str) -> bool:
    """True if line looks like a bullet point (starts with - • – — * after normalize)."""
    s = _normalize_bullet_line(line)
    return len(s) > 0 and s[0] in _BULLET_PREFIXES


def _strip_bullet_prefix(line: str) -> str:
    """Remove leading bullet marker and spaces; return content only (no leading dash/bullet)."""
    s = _normalize_bullet_line(line)
    if not s or s[0] not in _BULLET_PREFIXES:
        return s if s else ""
    return s[1:].lstrip()


def _is_section_header(line: str) -> bool:
    line = line.strip()
    if not line:
        return False
    # Single line, all caps (e.g. SUMMARY, EXPERIENCE) or **Section Name**
    if re.match(r"^\*\*.+\*\*$", line):
        return True
    if len(line) < 50 and line.isupper() and len(line) > 2:
        return True
    return False


def _looks_like_job_or_project_title(line: str) -> bool:
    """True if line is likely a job/project title (bolded or has Company | Date), not a bullet."""
    s = line.strip()
    if not s or _is_bullet_line(line):
        return False
    if s.startswith("**") or "**" in s:
        return True
    if " | " in s and len(s) > 20:
        return True
    return False


def _build_styles(base: Any) -> dict[str, ParagraphStyle]:
    return {
        "title": ParagraphStyle(
            "Title",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=15,
            alignment=1,  # center
            spaceAfter=2,
        ),
        "contact": ParagraphStyle(
            "Contact",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=11,
            alignment=1,
            spaceAfter=6,
        ),
        "section": ParagraphStyle(
            "Section",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=12,
            spaceBefore=6,
            spaceAfter=2,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=11,
            spaceAfter=4,
            leftIndent=0,
            rightIndent=0,
        ),
        "job_title": ParagraphStyle(
            "JobTitle",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=9.5,
            leading=11,
            spaceBefore=0,
            spaceAfter=4,
            leftIndent=0,
            rightIndent=0,
        ),
        "bullet_text": ParagraphStyle(
            "BulletText",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=11,
            leftIndent=28,
            firstLineIndent=-8,
            spaceAfter=4,
        ),
    }


def _parse_blocks(text: str) -> list[tuple[str, str]]:
    """Parse resume text into (block_type, content) pairs. Types: title, contact, section, body, bullets."""
    blocks: list[tuple[str, str]] = []
    # Split by double newline first
    raw_blocks = [b.strip() for b in text.split("\n\n") if b.strip()]
    first = True
    for raw in raw_blocks:
        lines = [ln.strip() for ln in raw.split("\n") if ln.strip()]
        if not lines:
            continue
        # First block: often name (first line) + contact (second line)
        if first and len(raw_blocks) > 0:
            first = False
            if len(lines) == 1:
                if _is_section_header(lines[0]):
                    blocks.append(("section", lines[0]))
                else:
                    blocks.append(("title", lines[0]))
                continue
            if len(lines) >= 2 and not _is_section_header(lines[0]):
                blocks.append(("title", lines[0]))
                blocks.append(("contact", " | ".join(lines[1:]) if len(lines) > 1 else lines[1]))
                continue
        # Single line that looks like a section header
        if len(lines) == 1 and _is_section_header(lines[0]):
            blocks.append(("section", lines[0]))
            continue
        # First line is section header, rest is content (e.g. EDUCATION then first entry on next line)
        if len(lines) >= 2 and _is_section_header(lines[0]):
            blocks.append(("section", lines[0]))
            for rest in lines[1:]:
                if rest.strip():
                    blocks.append(("body", rest))
            continue
        # Bullet block: first line with bullet char starts the list; split on new job/project titles so each gets its own heading + bullets
        bullet_start = next((i for i, ln in enumerate(lines) if _is_bullet_line(ln)), None)
        if bullet_start is not None and bullet_start < len(lines):
            non_bullet = lines[:bullet_start]
            bullet_lines: list[str] = []
            i = bullet_start
            while i < len(lines):
                ln = lines[i]
                if not ln.strip():
                    i += 1
                    continue
                if _looks_like_job_or_project_title(ln):
                    if non_bullet or bullet_lines:
                        if non_bullet:
                            blocks.append(("job_title", " ".join(non_bullet)))
                        for bl in bullet_lines:
                            blocks.append(("bullet", bl))
                    non_bullet = [ln.strip()]
                    bullet_lines = []
                    i += 1
                    continue
                if _is_bullet_line(ln):
                    bullet_lines.append(_strip_bullet_prefix(ln))
                else:
                    bullet_lines.append(ln.strip())
                i += 1
            if non_bullet or bullet_lines:
                if non_bullet:
                    blocks.append(("job_title", " ".join(non_bullet)))
                for bl in bullet_lines:
                    blocks.append(("bullet", bl))
            continue
        # Otherwise body paragraph(s)
        content = " ".join(lines)
        if content:
            blocks.append(("body", content))
    return blocks


def _block_to_flowables(
    block_type: str,
    content: str,
    styles: dict[str, ParagraphStyle],
) -> list:
    content = _bold_to_xml(content)
    if block_type == "title":
        return [Paragraph(content, styles["title"])]
    if block_type == "contact":
        return [Paragraph(content, styles["contact"])]
    if block_type == "section":
        head = content.replace("**", "").strip()
        if head.isupper():
            head = head.title()
        return [
            Paragraph(f"<b>{head}</b>", styles["section"]),
            HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#333333")),
            Spacer(1, 4),
        ]
    if block_type == "bullet":
        content = _strip_bullet_prefix(content)
        return [Paragraph(_LIST_MARKER + content, styles["bullet_text"])]
    if block_type == "job_title":
        return [Paragraph(content, styles["job_title"]), Spacer(1, 4)]
    if block_type == "body":
        content = _strip_bullet_prefix(content)  # never show • or leading - in body
        return [Paragraph(content, styles["body"])]
    return []


def text_to_pdf_bytes(resume_text: str) -> bytes:
    """Render resume text as a professional one-page PDF with sections, headers, and bullets."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=0.5 * inch,
        rightMargin=0.5 * inch,
        topMargin=0.2 * inch,
        bottomMargin=0.2 * inch,
    )
    base = getSampleStyleSheet()
    styles = _build_styles(base)

    blocks = _parse_blocks(resume_text)
    flowables: list = []

    i = 0
    while i < len(blocks):
        block_type, content = blocks[i]
        if block_type == "bullet":
            flowables.append(Spacer(1, 4))
            while i < len(blocks) and blocks[i][0] == "bullet":
                raw = blocks[i][1]
                content = _strip_bullet_prefix(raw)  # ensure no leading - or • in PDF
                flowables.append(
                    Paragraph(_LIST_MARKER + _bold_to_xml(content), styles["bullet_text"])
                )
                i += 1
            # Add a line under this entry when the next block is another job/project (so every entry has a line)
            if i < len(blocks) and blocks[i][0] == "job_title":
                flowables.append(Spacer(1, 4))
                flowables.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cccccc")))
                flowables.append(Spacer(1, 4))
            continue
        flowables.extend(_block_to_flowables(block_type, content, styles))
        i += 1

    doc.build(flowables)
    buffer.seek(0)
    return buffer.read()


def _find_ul_ranges(s: str) -> list[tuple[int, int]]:
    """Return (start, end) of each top-level <ul>...</ul> block; inner <ul> skips to matching </ul>."""
    ranges: list[tuple[int, int]] = []
    i = 0
    while i < len(s):
        ul_open = re.search(r"<ul[^>]*>", s[i:], re.IGNORECASE)
        if not ul_open:
            break
        start = i + ul_open.start()
        j = i + ul_open.end()
        depth = 1
        while depth > 0 and j < len(s):
            next_ul = re.search(r"<ul[^>]*>", s[j:], re.IGNORECASE)
            next_end = re.search(r"</ul>", s[j:], re.IGNORECASE)
            pos_ul = next_ul.start() if next_ul else len(s) + 1
            pos_end = next_end.start() if next_end else len(s) + 1
            if pos_end < pos_ul:
                depth -= 1
                j += next_end.end()
                if depth == 0:
                    ranges.append((start, j))
                    break
            else:
                depth += 1
                j += next_ul.end()
        i = j
    return ranges


def _parse_simple_html_to_blocks(html_content: str) -> list[tuple[str, str | dict[str, str | None] | list[str]]]:
    """Extract block-level elements (p, h2, ul/li) in document order.

    - Captures text-align from TipTap (`style="text-align: ..."` or `data-text-align="..."`)
      for <p> and <h2> so alignment can be reflected in the PDF.
    - Skips <p>/<h2> inside <ul> to avoid duplicate text.
    """
    s = html_content.strip()
    for tag in ("<div>", "</div>", "<body>", "</body>"):
        s = s.replace(tag, "")
    ul_ranges = _find_ul_ranges(s)

    def inside_ul(pos: int) -> bool:
        return any(start <= pos < end for start, end in ul_ranges)

    ordered: list[tuple[int, str, str | dict[str, str | None] | list[str]]] = []
    for m in re.finditer(r"<p([^>]*)>(.*?)</p>", s, re.DOTALL | re.IGNORECASE):
        if inside_ul(m.start()):
            continue
        attrs = m.group(1) or ""
        inner = m.group(2).strip()
        align: str | None = None
        m_align = re.search(r"text-align\s*:\s*(left|center|right|justify)", attrs, re.IGNORECASE)
        if not m_align:
            m_align = re.search(r'data-text-align=["\'](left|center|right|justify)["\']', attrs, re.IGNORECASE)
        if m_align:
            align = m_align.group(1).lower()
        if inner:
            ordered.append((m.start(), "p", {"text": inner, "align": align}))
    for m in re.finditer(r"<h2([^>]*)>(.*?)</h2>", s, re.DOTALL | re.IGNORECASE):
        if inside_ul(m.start()):
            continue
        attrs = m.group(1) or ""
        inner = m.group(2).strip()
        align: str | None = None
        m_align = re.search(r"text-align\s*:\s*(left|center|right|justify)", attrs, re.IGNORECASE)
        if not m_align:
            m_align = re.search(r'data-text-align=["\'](left|center|right|justify)["\']', attrs, re.IGNORECASE)
        if m_align:
            align = m_align.group(1).lower()
        if inner:
            ordered.append((m.start(), "h2", {"text": inner, "align": align}))
    for start, end in ul_ranges:
        ul_inner = s[start:end]
        ul_inner = re.sub(r"^<ul[^>]*>", "", ul_inner, count=1, flags=re.IGNORECASE)
        ul_inner = re.sub(r"</ul>\s*$", "", ul_inner, flags=re.IGNORECASE)
        li_items = []
        for m in re.finditer(r"<li[^>]*>(.*?)</li>", ul_inner, re.DOTALL | re.IGNORECASE):
            raw = m.group(1).strip()
            if not raw:
                continue
            raw = re.sub(r"^<p[^>]*>", "", raw, flags=re.IGNORECASE)
            raw = re.sub(r"</p>\s*$", "", raw, flags=re.IGNORECASE)
            li_items.append(raw.strip())
        if li_items:
            ordered.append((start, "ul", li_items))
    ordered.sort(key=lambda x: x[0])
    blocks = [(k, v) for _, k, v in ordered]
    if not blocks and s:
        blocks = [("p", {"text": s, "align": None})]
    return blocks


def _html_inline_to_reportlab(html: str) -> str:
    """Convert to ReportLab Paragraph XML: ** to bold, preserve <b>/<i>/<u>, fix & escaping."""
    s = html
    # Convert literal **...** to <b> so titles/names from plain text or editor render bold
    s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s, flags=re.DOTALL)
    s = _escape_amp_for_reportlab(s)
    s = re.sub(r"</?strong>", "", s)
    s = re.sub(r"<strong>", "<b>", s)
    s = re.sub(r"</strong>", "</b>", s)
    s = re.sub(r"</?em>", "", s)
    s = re.sub(r"<em>", "<i>", s)
    s = re.sub(r"</em>", "</i>", s)
    return s


def html_to_pdf_bytes(html_content: str) -> bytes:
    """Render simple resume HTML (p, h2, ul/li, with b/i/u inside) to a one-page PDF."""
    blocks = _parse_simple_html_to_blocks(html_content)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=0.5 * inch,
        rightMargin=0.5 * inch,
        topMargin=0.2 * inch,
        bottomMargin=0.2 * inch,
    )
    base = getSampleStyleSheet()
    styles = _build_styles(base)
    flowables: list = []

    def _style_with_alignment(base_style: ParagraphStyle, align: str | None) -> ParagraphStyle:
        """Return a ParagraphStyle based on base_style but with the given text alignment."""
        if not align:
            return base_style
        align_lower = align.lower()
        alignment_value = base_style.alignment
        if align_lower == "left":
            alignment_value = 0
        elif align_lower == "center":
            alignment_value = 1
        elif align_lower == "right":
            alignment_value = 2
        elif align_lower == "justify":
            alignment_value = 4
        # Create a lightweight derived style so we don't mutate shared styles
        return ParagraphStyle(
            f"{base_style.name}-{align_lower}",
            parent=base_style,
            alignment=alignment_value,
        )

    for i, (kind, payload) in enumerate(blocks):
        if kind == "p":
            if isinstance(payload, dict):
                raw_text = str(payload.get("text", "") or "")
                align = payload.get("align")
            else:
                raw_text = str(payload or "")
                align = None
            text = _html_inline_to_reportlab(raw_text)
            # First paragraph is typically the name — use title style (13pt)
            base_style = styles["title"] if i == 0 else styles["body"]
            style = _style_with_alignment(base_style, align)
            flowables.append(Paragraph(text or " ", style))
        elif kind == "h2":
            if isinstance(payload, dict):
                raw_text = str(payload.get("text", "") or "")
                align = payload.get("align")
            else:
                raw_text = str(payload or "")
                align = None
            text = _html_inline_to_reportlab(raw_text)
            base_style = styles["section"]
            style = _style_with_alignment(base_style, align)
            flowables.append(Paragraph(f"<b>{text}</b>", style))
            flowables.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#333333")))
            flowables.append(Spacer(1, 4))
        elif kind == "ul":
            for item in payload:
                text = _html_inline_to_reportlab(item)
                flowables.append(Paragraph(_LIST_MARKER + text, styles["bullet_text"]))
    doc.build(flowables)
    buffer.seek(0)
    return buffer.read()
