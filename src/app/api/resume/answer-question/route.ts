import type { AnswerQuestionResponse } from "@/lib/types/resume";

const WORKER_BASE_URL = process.env.CONTACTS_WORKER_URL || "http://localhost:8001";

export async function POST(request: Request) {
  let body: { question?: string; resume_text?: string; job_description?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { question, resume_text, job_description } = body;
  if (!question || typeof question !== "string" || question.trim().length < 5) {
    return new Response("question is required (at least 5 characters)", { status: 400 });
  }
  if (!resume_text || typeof resume_text !== "string" || resume_text.trim().length < 50) {
    return new Response("resume_text is required (at least 50 characters)", { status: 400 });
  }
  if (!job_description || typeof job_description !== "string" || job_description.trim().length < 50) {
    return new Response("job_description is required (at least 50 characters)", { status: 400 });
  }

  const res = await fetch(`${WORKER_BASE_URL}/resume/answer-question`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: question.trim(),
      resume_text: resume_text.trim(),
      job_description: job_description.trim(),
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return new Response(detail, { status: res.status });
  }

  const data = (await res.json()) as AnswerQuestionResponse;
  return Response.json(data);
}
