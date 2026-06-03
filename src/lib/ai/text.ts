/**
 * 텍스트 생성 (LLM) — 서버 전용.
 * 현재 Gemini만 사용. 모델 ID는 AI_CONFIG에서.
 */
import { GoogleGenAI } from "@google/genai";
import { AI_CONFIG } from "./config";

let _gemini: GoogleGenAI | null = null;
function getGemini() {
  if (!_gemini) {
    _gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }
  return _gemini;
}

export interface TextGenerateOptions {
  system?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export async function generateText(opts: TextGenerateOptions): Promise<string> {
  const ai = getGemini();
  const response = await ai.models.generateContent({
    model: AI_CONFIG.gemini.textModel,
    contents: opts.system
      ? [
          { role: "user", parts: [{ text: `${opts.system}\n\n${opts.prompt}` }] },
        ]
      : [{ role: "user", parts: [{ text: opts.prompt }] }],
    config: {
      temperature: opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxOutputTokens ?? 8192,
    },
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("LLM이 빈 응답을 반환했습니다.");
  return text;
}

/** JSON 응답 강제 — LLM이 마크다운 코드블록으로 감싸는 경우도 처리 */
export async function generateJSON<T = unknown>(opts: TextGenerateOptions): Promise<T> {
  const raw = await generateText({
    ...opts,
    prompt: opts.prompt + "\n\n반드시 순수 JSON만 반환하세요. 마크다운 코드블록 없이.",
  });

  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  return JSON.parse(cleaned) as T;
}
