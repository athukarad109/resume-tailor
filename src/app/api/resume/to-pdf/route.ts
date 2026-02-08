const WORKER_BASE_URL = process.env.CONTACTS_WORKER_URL || "http://localhost:8001";

export async function POST(request: Request) {
  let body: { resume_text?: string; resume_html?: string };
  try {
    body = (await request.json()) as { resume_text?: string; resume_html?: string };
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }
  const resumeText = body?.resume_text;
  const resumeHtml = body?.resume_html;
  const hasText = typeof resumeText === "string" && resumeText.trim().length >= 10;
  const hasHtml = typeof resumeHtml === "string" && resumeHtml.trim().length >= 10;
  if (!hasText && !hasHtml) {
    return new Response("resume_text or resume_html is required (at least 10 characters)", { status: 400 });
  }

  const payload = hasHtml ? { resume_html: resumeHtml!.trim() } : { resume_text: resumeText!.trim() };
  const res = await fetch(`${WORKER_BASE_URL}/resume/to-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text();
    return new Response(detail, { status: res.status });
  }

  const pdfBytes = await res.arrayBuffer();
  return new Response(pdfBytes, {
    headers: { "Content-Type": "application/pdf" },
  });
}
