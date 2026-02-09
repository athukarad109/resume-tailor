"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { TailorResumeResponse } from "@/lib/types/resume";
import { resumeTextToHtml } from "@/lib/resume-text-to-html";
import ResumeEditor, { type ResumeEditorHandle } from "./ResumeEditor";

function base64ToBlobUrl(base64: string, mime: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}

async function fetchPdfFromContent(resumeText: string | null, resumeHtml: string | null): Promise<Blob> {
  const body = resumeHtml && resumeHtml.trim().length >= 10
    ? { resume_html: resumeHtml.trim() }
    : resumeText && resumeText.trim().length >= 10
      ? { resume_text: resumeText.trim() }
      : null;
  if (!body) throw new Error("No content to convert");
  const res = await fetch("/api/resume/to-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.blob();
}

export default function ResumeTailorPage() {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [editorHtml, setEditorHtml] = useState<string>("");
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const editorRef = useRef<ResumeEditorHandle>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resumeFile) return;
    setIsLoading(true);
    setError(null);
    setEditorHtml("");
    if (pdfBlobUrl) {
      URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }

    const formData = new FormData();
    formData.append("resume", resumeFile);
    formData.append("job_description", jobDescription.trim());

    const res = await fetch("/api/resume/tailor", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      const detail = await res.text();
      setError(detail || "Something went wrong.");
      setIsLoading(false);
      return;
    }

    const data = (await res.json()) as TailorResumeResponse;
    const initialHtml = resumeTextToHtml(data.tailored_resume);
    setEditorHtml(initialHtml);
    if (data.pdf_base64) {
      setPdfBlobUrl(base64ToBlobUrl(data.pdf_base64, "application/pdf"));
    }
    setIsLoading(false);
  };

  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  const refreshPreview = useCallback(async () => {
    const html = editorRef.current?.getHtml() ?? "";
    if (html.trim().length < 10) return;
    setIsPdfLoading(true);
    setError(null);
    try {
      const blob = await fetchPdfFromContent(null, html);
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate PDF");
    } finally {
      setIsPdfLoading(false);
    }
  }, [pdfBlobUrl]);

  const downloadPdf = useCallback(async () => {
    const html = editorRef.current?.getHtml() ?? "";
    if (html.trim().length < 10) return;
    setIsPdfLoading(true);
    setError(null);
    try {
      const blob = await fetchPdfFromContent(null, html);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tailored-resume.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate PDF");
    } finally {
      setIsPdfLoading(false);
    }
  }, []);

  const copyToClipboard = () => {
    const html = editorRef.current?.getHtml() ?? "";
    if (!html) return;
    void navigator.clipboard.writeText(html.replace(/<[^>]+>/g, "").trim() || html);
  };

  const hasResult = editorHtml.length > 0;

  return (
    <main style={{ padding: "2rem", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Resume Tailor</h1>
      <p style={{ marginBottom: "2rem", color: "#444" }}>
        Upload your current resume (PDF) and paste the job description. We’ll return a one-page,
        ATS-friendly resume that only uses experience and skills from your resume.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
        <label>
          <span style={{ display: "block", marginBottom: "0.35rem", fontWeight: 600 }}>
            Current resume (PDF)
          </span>
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
            required
            style={{ display: "block", width: "100%", padding: "0.5rem" }}
          />
        </label>
        <label>
          <span style={{ display: "block", marginBottom: "0.35rem", fontWeight: 600 }}>
            Job description
          </span>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            required
            minLength={50}
            placeholder="Paste the full job description here (at least 50 characters)..."
            rows={10}
            style={{
              display: "block",
              width: "100%",
              padding: "0.75rem",
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        </label>
        <button
          type="submit"
          disabled={!resumeFile || jobDescription.trim().length < 50 || isLoading}
          style={{ justifySelf: "start", padding: "0.5rem 1rem" }}
        >
          {isLoading ? "Generating…" : "Create tailored resume"}
        </button>
      </form>

      {error && (
        <div style={{ marginTop: "1.5rem", padding: "1rem", background: "#fef2f2", color: "#b91c1c", borderRadius: 8 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {hasResult && (
        <section style={{ marginTop: "2rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>Tailored resume</h2>
            <button
              type="button"
              onClick={refreshPreview}
              disabled={editorHtml.length < 10 || isPdfLoading}
              style={{ padding: "0.35rem 0.75rem", fontSize: "0.9rem" }}
            >
              {isPdfLoading ? "Generating…" : "Refresh PDF preview"}
            </button>
            <button
              type="button"
              onClick={downloadPdf}
              disabled={editorHtml.length < 10 || isPdfLoading}
              style={{ padding: "0.35rem 0.75rem", fontSize: "0.9rem" }}
            >
              Download PDF
            </button>
            <button
              type="button"
              onClick={copyToClipboard}
              style={{ padding: "0.35rem 0.75rem", fontSize: "0.9rem" }}
            >
              Copy text
            </button>
          </div>
          <p style={{ marginBottom: "0.75rem", fontSize: "0.9rem", color: "#555" }}>
            Use the toolbar for <strong>bold</strong>, <em>italic</em>, <u>underline</u>, bullet and numbered lists, and section headings. You can also type <strong>**text**</strong> for bold and use &amp; normally—the PDF will render them correctly. Then &quot;Refresh PDF preview&quot; or &quot;Download PDF&quot;.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "1.5rem",
              alignItems: "flex-start",
              marginTop: "1rem",
            }}
          >
            <div style={{ flex: "1 1 380px", minWidth: 0 }}>
              <ResumeEditor
                ref={editorRef}
                initialHtml={editorHtml}
                minHeight="70vh"
              />
            </div>
            {pdfBlobUrl && (
              <div
                style={{
                  flex: "1 1 380px",
                  minWidth: 0,
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  overflow: "hidden",
                  background: "#f1f5f9",
                  minHeight: "70vh",
                }}
              >
                <iframe
                  src={pdfBlobUrl}
                  title="Resume PDF preview"
                  style={{ width: "100%", height: "80vh", border: "none" }}
                />
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
