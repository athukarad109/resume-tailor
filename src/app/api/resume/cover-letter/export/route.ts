const WORKER_BASE_URL = process.env.CONTACTS_WORKER_URL || "http://localhost:8001";

export async function POST(request: Request) {
  let body: { cover_letter_text?: string; format?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { cover_letter_text, format } = body;
  if (!cover_letter_text || typeof cover_letter_text !== "string" || cover_letter_text.trim().length < 10) {
    return new Response("cover_letter_text is required (at least 10 characters)", { status: 400 });
  }
  if (format !== "pdf" && format !== "doc") {
    return new Response("format must be pdf or doc", { status: 400 });
  }

  const res = await fetch(`${WORKER_BASE_URL}/resume/cover-letter/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cover_letter_text: cover_letter_text.trim(),
      format,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return new Response(detail, { status: res.status });
  }

  const blob = await res.blob();
  const contentType = res.headers.get("Content-Type") ?? (format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const contentDisposition = res.headers.get("Content-Disposition") ?? (format === "pdf" ? 'attachment; filename="cover-letter.pdf"' : 'attachment; filename="cover-letter.docx"');

  return new Response(blob, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition,
    },
  });
}
