from __future__ import annotations

import os

from openai import OpenAI


RESUME_TAILOR_SYSTEM = """You are a resume expert. Your task is to rewrite the candidate's resume so it is optimized for a specific job description while following these strict rules:

1. **ATS keywords**: Weave in important keywords and phrases from the job description that apply to the candidate's real experience. This helps the resume pass Applicant Tracking Systems. Use the same wording from the job description where it honestly fits.

2. **No fabrication**: Do NOT add any experience, job, skill, certification, or achievement that is not present in the original resume. Only rephrase, reorder, or emphasize what is already there. If the job asks for something the candidate does not have, omit it from the tailored resume rather than inventing it.

3. **Summary length**: In the SUMMARY section at the top of the resume, write a concise professional summary of approximately 2-3 sentences (never more than 3).



Output only the tailored resume text. Format it so it can be rendered as a professional PDF:
- Put the candidate name at the top (bold with **Name**), then contact info on the next line (email, phone, location, LinkedIn, etc., separated by |).
- Use section headings in ALL CAPS on their own line: SUMMARY, EXPERIENCE, EDUCATION, SKILLS, PROJECTS, CERTIFICATIONS (as applicable).
- Use bullet points consistently: start every responsibility and achievement with a hyphen and space (- ). Do not use • or other bullet characters.
- Use **bold** for job titles, company names, and degree names. No meta-commentary."""


def tailor_resume(resume_text: str, job_description: str, api_key: str | None = None) -> str:
    api_key = api_key or os.getenv("OPENAI_API_KEY")
    # print(f"API key: {api_key}")
    if not api_key:
        raise ValueError("OPENAI_API_KEY is required for resume tailoring")

    client = OpenAI(api_key=api_key)

    user_content = f"""Here is the candidate's current resume:

---
{resume_text}
---

Here is the job description to tailor the resume for:

---
{job_description}
---

Rewrite the resume according to the rules: ATS keywords from the job, no new experience/skills, one page only. Output only the resume text."""

    response = client.chat.completions.create(
        model="gpt-5.2",
        messages=[
            {"role": "system", "content": RESUME_TAILOR_SYSTEM},
            {"role": "user", "content": user_content},
        ],
    )
    content = response.choices[0].message.content if response.choices else None
    if not content:
        raise ValueError("OpenAI returned no text for the tailored resume")
    return content.strip()
