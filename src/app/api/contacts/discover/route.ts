import type { DiscoverResponse } from "@/lib/types/contacts";

const WORKER_BASE_URL = process.env.CONTACTS_WORKER_URL || "http://localhost:8001";

export async function POST(request: Request) {
  const payload = await request.json();

  const res = await fetch(`${WORKER_BASE_URL}/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text();
    return new Response(detail, { status: res.status });
  }

  const data = (await res.json()) as DiscoverResponse;
  return Response.json(data);
}
