/**
 * Convert plain tailored resume text (with **bold**, - bullets, ALL CAPS section headers)
 * into simple HTML for the rich editor (p, h2, ul/li, strong).
 */
export function resumeTextToHtml(plain: string): string {
  const lines = plain.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }
    // Section header: short, all caps
    if (trimmed.length < 50 && trimmed === trimmed.toUpperCase() && trimmed.length > 2) {
      const title = trimmed.charAt(0) + trimmed.slice(1).toLowerCase();
      out.push(`<h2>${escapeHtml(title)}</h2>`);
      i++;
      continue;
    }
    // Bullet line: starts with - or • etc.
    if (/^[-•–—*]\s/.test(trimmed) || /^\s*[-•–—*]\s/.test(trimmed)) {
      const bulletContent = trimmed.replace(/^[\s\-•–—*]+/, "").trim();
      const bullets: string[] = [];
      while (i < lines.length) {
        const ln = lines[i].trim();
        if (!ln) break;
        if (/^[-•–—*]\s/.test(ln) || /^\s*[-•–—*]\s/.test(ln)) {
          bullets.push(inlineToHtml(ln.replace(/^[\s\-•–—*]+/, "").trim()));
          i++;
        } else {
          break;
        }
      }
      if (bullets.length) {
        out.push("<ul>" + bullets.map((b) => `<li>${b}</li>`).join("") + "</ul>");
      }
      continue;
    }
    // Paragraph: convert **x** to <strong>
    out.push("<p>" + inlineToHtml(trimmed) + "</p>");
    i++;
  }

  return out.join("\n");
}

function inlineToHtml(text: string): string {
  const escaped = escapeHtml(text);
  return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
