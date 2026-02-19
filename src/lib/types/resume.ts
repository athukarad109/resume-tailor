export type TailorResumeResponse = {
  tailored_resume: string;
  pdf_base64: string;
};

export type AnswerQuestionRequest = {
  question: string;
  resume_text: string;
  job_description: string;
};

export type AnswerQuestionResponse = {
  answer: string;
};
