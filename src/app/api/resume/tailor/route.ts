import type { TailorResumeResponse } from "@/lib/types/resume";

const WORKER_BASE_URL = process.env.CONTACTS_WORKER_URL || "http://localhost:8001";

export async function POST(request: Request) {
  const formData = await request.formData();
  const resume = formData.get("resume") as File | null;
  const jobDescription = formData.get("job_description") as string | null;

  if (!resume || !(resume instanceof File)) {
    return new Response("Resume file is required", { status: 400 });
  }
  if (!jobDescription || typeof jobDescription !== "string" || jobDescription.trim().length < 50) {
    return new Response("Job description is required (at least 50 characters)", { status: 400 });
  }

  const body = new FormData();
  body.append("resume", resume);
  body.append("job_description", jobDescription.trim());

  const res = await fetch(`${WORKER_BASE_URL}/resume/tailor`, {
    method: "POST",
    body,
  });

  if (!res.ok) {
    const detail = await res.text();
    return new Response(detail, { status: res.status });
  }

  const data = (await res.json()) as TailorResumeResponse;
  return Response.json(data);
}
