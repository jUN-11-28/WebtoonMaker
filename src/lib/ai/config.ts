/**
 * AI 모델 ID는 여기서만 읽는다 — 코드에 하드코딩 금지.
 * 모델명이 자주 바뀌므로 환경변수로 분리.
 */
export const AI_CONFIG = {
  openai: {
    imageModel: process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2",
  },
  gemini: {
    textModel: process.env.GEMINI_TEXT_MODEL ?? "gemini-3-flash-preview",
    imageModelStandard:
      process.env.GEMINI_IMAGE_MODEL_STANDARD ?? "gemini-3.1-flash-image",
    imageModelPro:
      process.env.GEMINI_IMAGE_MODEL_PRO ?? "gemini-3.1-flash-image",
  },
} as const;

export type ImageProvider = "gemini" | "openai";
