/**
 * AI 모델 ID는 여기서만 읽는다 — 코드에 하드코딩 금지.
 * 모델명이 자주 바뀌므로 환경변수로 분리.
 */
export const AI_CONFIG = {
  openai: {
    imageModel: process.env.OPENAI_IMAGE_MODEL!,
    textModel: process.env.OPENAI_TEXT_MODEL!,
  },
  gemini: {
    textModel: process.env.GEMINI_TEXT_MODEL!,
    imageModelStandard: process.env.GEMINI_IMAGE_MODEL_STANDARD!,
    imageModelPro: process.env.GEMINI_IMAGE_MODEL_PRO!,
  },
  /** JSON 스토리보드 생성에 사용할 텍스트 모델 provider */
  textProvider: (process.env.TEXT_PROVIDER ?? "gemini") as "gemini" | "openai",
} as const;

export type ImageProvider = "gemini" | "openai";
export type TextProvider = "gemini" | "openai";
