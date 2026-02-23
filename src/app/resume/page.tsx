"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AnswerQuestionResponse, CoverLetterResponse, TailorResumeResponse } from "@/lib/types/resume";
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

/**
 * Save a blob to disk. When the File System Access API is supported (Chrome, Edge),
 * opens a "Save as" dialog so the user can choose location and filename.
 * Otherwise falls back to programmatic download to the default folder.
 */
async function saveBlobWithPicker(blob: Blob, suggestedName: string, mimeType: string): Promise<void> {
  if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
    const accept: Record<string, string[]> =
      mimeType === "application/pdf"
        ? { "application/pdf": [".pdf"] }
        : { "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"] };
    const ext = suggestedName.endsWith(".pdf") ? ".pdf" : ".docx";
    const handle = await (window as Window & { showSaveFilePicker?(options: unknown): Promise<FileSystemFileHandle> })
      .showSaveFilePicker!({
        suggestedName,
        types: [{ description: ext.toUpperCase().replace(".", ""), accept }],
      });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}

const STORAGE_KEY = "resume-tailor-application-count";

function getStoredCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    const n = v ? parseInt(v, 10) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function setStoredCount(n: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Math.max(0, n)));
  } catch {
    /* ignore */
  }
}

export default function ResumeTailorPage() {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [editorHtml, setEditorHtml] = useState<string>("");
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [applicationCount, setApplicationCount] = useState(0);
  const [tailoredResumeText, setTailoredResumeText] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [isAnswerLoading, setIsAnswerLoading] = useState(false);
  const [coverLetter, setCoverLetter] = useState("");
  const [isCoverLetterLoading, setIsCoverLetterLoading] = useState(false);
  const [isCoverLetterExportLoading, setIsCoverLetterExportLoading] = useState(false);
  const editorRef = useRef<ResumeEditorHandle>(null);

  useEffect(() => {
    setApplicationCount(getStoredCount());
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!resumeFile) return;
    setIsLoading(true);
    setError(null);
    setEditorHtml("");
    setTailoredResumeText("");
    setAnswer(null);
    setCoverLetter("");
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
    setTailoredResumeText(data.tailored_resume);
    if (data.pdf_base64) {
      setPdfBlobUrl(base64ToBlobUrl(data.pdf_base64, "application/pdf"));
    }
    const nextCount = getStoredCount() + 1;
    setStoredCount(nextCount);
    setApplicationCount(nextCount);
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
      await saveBlobWithPicker(blob, "tailored-resume.pdf", "application/pdf");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return; // user cancelled Save As
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
  const canAnswerQuestion =
    hasResult && tailoredResumeText.length >= 50 && jobDescription.trim().length >= 50;
  const canGenerateCoverLetter = canAnswerQuestion;

  /** Current resume as plain text from the editor (for refresh after edits). */
  const getCurrentResumePlainText = (): string => {
    const html = editorRef.current?.getHtml() ?? "";
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  };

  const canRefreshCoverLetter =
    canGenerateCoverLetter && getCurrentResumePlainText().length >= 50;

  const handleGenerateCoverLetter = async () => {
    if (!canGenerateCoverLetter) return;
    setIsCoverLetterLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/resume/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_text: tailoredResumeText,
          job_description: jobDescription.trim(),
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        setError(detail || "Failed to generate cover letter");
        return;
      }
      const data = (await res.json()) as CoverLetterResponse;
      setCoverLetter(data.cover_letter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate cover letter");
    } finally {
      setIsCoverLetterLoading(false);
    }
  };

  const handleRefreshCoverLetter = async () => {
    const resumeText = getCurrentResumePlainText();
    if (resumeText.length < 50 || jobDescription.trim().length < 50) return;
    setIsCoverLetterLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/resume/cover-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume_text: resumeText,
          job_description: jobDescription.trim(),
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        setError(detail || "Failed to refresh cover letter");
        return;
      }
      const data = (await res.json()) as CoverLetterResponse;
      setCoverLetter(data.cover_letter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh cover letter");
    } finally {
      setIsCoverLetterLoading(false);
    }
  };

  const handleDownloadCoverLetter = async (format: "pdf" | "doc") => {
    const text = coverLetter.trim();
    if (text.length < 10) return;
    setIsCoverLetterExportLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/resume/cover-letter/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cover_letter_text: text, format }),
      });
      if (!res.ok) {
        const detail = await res.text();
        setError(detail || `Failed to export ${format}`);
        return;
      }
      const blob = await res.blob();
      const suggestedName = format === "pdf" ? "cover-letter.pdf" : "cover-letter.docx";
      const mimeType =
        format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      await saveBlobWithPicker(blob, suggestedName, mimeType);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return; // user cancelled Save As
      setError(e instanceof Error ? e.message : `Failed to export ${format}`);
    } finally {
      setIsCoverLetterExportLoading(false);
    }
  };

  const handleGetAnswer = async () => {
    const q = question.trim();
    if (q.length < 5 || !canAnswerQuestion) return;
    setIsAnswerLoading(true);
    setError(null);
    setAnswer(null);
    try {
      const res = await fetch("/api/resume/answer-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          resume_text: tailoredResumeText,
          job_description: jobDescription.trim(),
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        setError(detail || "Failed to get answer");
        return;
      }
      const data = (await res.json()) as AnswerQuestionResponse;
      setAnswer(data.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to get answer");
    } finally {
      setIsAnswerLoading(false);
    }
  };

  const resetCount = () => {
    setStoredCount(0);
    setApplicationCount(0);
  };

  const addOne = () => {
    const next = applicationCount + 1;
    setStoredCount(next);
    setApplicationCount(next);
  };

  const subtractOne = () => {
    const next = Math.max(0, applicationCount - 1);
    setStoredCount(next);
    setApplicationCount(next);
  };

  const counterBtnStyle = {
    padding: "0.4rem 0.65rem",
    fontSize: "1.25rem",
    fontWeight: 600 as const,
    cursor: "pointer" as const,
    minWidth: 36,
    border: "1px solid #64748b",
    borderRadius: 6,
    background: "#334155",
    color: "#f8fafc",
  };

  return (
    <main style={{ padding: "2rem", maxWidth: 1200, margin: "0 auto", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: "1.5rem",
          right: "1.5rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          padding: "0.75rem 1rem",
          background: "#1e293b",
          color: "#f8fafc",
          borderRadius: 10,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}
      >
        <button type="button" onClick={subtractOne} style={counterBtnStyle} title="Subtract one">
          −
        </button>
        <span style={{ fontSize: "1.1rem", fontWeight: 600, minWidth: "8ch", textAlign: "center" }}>
          Applications: <strong style={{ fontSize: "1.35rem" }}>{applicationCount}</strong>
        </span>
        <button type="button" onClick={addOne} style={counterBtnStyle} title="Add one">
          +
        </button>
        <button
          type="button"
          onClick={resetCount}
          style={{
            padding: "0.4rem 0.75rem",
            fontSize: "0.9rem",
            fontWeight: 600,
            cursor: "pointer",
            border: "1px solid #94a3b8",
            borderRadius: 6,
            background: "#334155",
            color: "#e2e8f0",
          }}
          title="Reset counter"
        >
          Reset
        </button>
      </div>
      <h1 style={{ fontSize: "2rem", marginBottom: "2.5rem" }}>Resume Tailor</h1>
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
                  height: "65vh",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <iframe
                  src={pdfBlobUrl}
                  title="Resume PDF preview"
                  style={{ width: "100%", height: "100%", border: "none", flex: 1 }}
                />
              </div>
            )}
          </div>

          {canAnswerQuestion && (
            <section
              style={{
                marginTop: "2.5rem",
                padding: "1.25rem",
                background: "#f8fafc",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
              }}
            >
              <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.15rem" }}>Application question</h3>
              <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "#64748b" }}>
                Paste a question from the job application form (the one you answer when submitting your resume) and get a short answer based on your tailored resume and the job description.
              </p>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Why do you want to work for this company?"
                rows={2}
                minLength={5}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "0.75rem",
                  marginBottom: "0.75rem",
                  resize: "vertical",
                  fontFamily: "inherit",
                  borderRadius: 6,
                  border: "1px solid #cbd5e1",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={handleGetAnswer}
                  disabled={question.trim().length < 5 || isAnswerLoading}
                  style={{ padding: "0.5rem 1rem" }}
                >
                  {isAnswerLoading ? "Generating…" : "Get answer"}
                </button>
                {answer !== null && (
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(answer)}
                    style={{ padding: "0.5rem 1rem" }}
                  >
                    Copy to clipboard
                  </button>
                )}
              </div>
              {answer !== null && (
                <>
                  <p style={{ margin: "1rem 0 0.25rem", fontSize: "0.8rem", color: "#64748b" }}>
                    Word count: {answer.trim().split(/\s+/).filter(Boolean).length}
                  </p>
                  <div
                    style={{
                      marginTop: "0.25rem",
                      padding: "1rem",
                      background: "#fff",
                      color: "#1e293b",
                      borderRadius: 8,
                      border: "1px solid #e2e8f0",
                      whiteSpace: "pre-wrap",
                      fontSize: "0.95rem",
                      lineHeight: 1.5,
                    }}
                  >
                    {answer}
                  </div>
                </>
              )}
            </section>
          )}

          {canGenerateCoverLetter && (
            <section
              style={{
                marginTop: "2.5rem",
                padding: "1.25rem",
                background: "#f0fdf4",
                borderRadius: 10,
                border: "1px solid #bbf7d0",
              }}
            >
              <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.15rem" }}>Cover letter</h3>
              <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "#166534" }}>
                Generate a cover letter for this role from your tailored resume and job description. If you edit the resume above, use Refresh to regenerate the letter from the updated text. Edit below if needed, then download as PDF or Word.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                <button
                  type="button"
                  onClick={handleGenerateCoverLetter}
                  disabled={isCoverLetterLoading}
                  style={{ padding: "0.5rem 1rem" }}
                >
                  {isCoverLetterLoading ? "Generating…" : "Generate cover letter"}
                </button>
                <button
                  type="button"
                  onClick={handleRefreshCoverLetter}
                  disabled={isCoverLetterLoading || !canRefreshCoverLetter}
                  style={{ padding: "0.5rem 1rem" }}
                  title="Regenerate cover letter using the current resume text from the editor"
                >
                  Refresh cover letter
                </button>
                {coverLetter.trim().length >= 10 && (
                  <>
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(coverLetter.trim())}
                      style={{ padding: "0.5rem 1rem" }}
                      title="Copy cover letter text to clipboard"
                    >
                      Copy Text
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadCoverLetter("pdf")}
                      disabled={isCoverLetterExportLoading}
                      style={{ padding: "0.5rem 1rem" }}
                    >
                      {isCoverLetterExportLoading ? "Exporting…" : "Download PDF"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadCoverLetter("doc")}
                      disabled={isCoverLetterExportLoading}
                      style={{ padding: "0.5rem 1rem" }}
                    >
                      Download DOC
                    </button>
                  </>
                )}
              </div>
              {coverLetter && (
                <textarea
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  placeholder="Cover letter will appear here after you generate it."
                  rows={14}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "0.75rem",
                    resize: "vertical",
                    fontFamily: "inherit",
                    fontSize: "0.95rem",
                    lineHeight: 1.5,
                    borderRadius: 6,
                    border: "1px solid #86efac",
                  }}
                />
              )}
            </section>
          )}
        </section>
      )}
    </main>
  );
}
