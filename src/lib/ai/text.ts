/**
 * 텍스트 생성 (LLM) — 서버 전용.
 * TEXT_PROVIDER=openai 이면 OpenAI, 기본값은 Gemini.
 */
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import { AI_CONFIG } from "./config";

let _gemini: GoogleGenAI | null = null;
let _openai: OpenAI | null = null;

function getGemini() {
  if (!_gemini) _gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  return _gemini;
}
function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return _openai;
}

export interface TextGenerateOptions {
  system?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export async function generateText(opts: TextGenerateOptions): Promise<string> {
  if (AI_CONFIG.textProvider === "openai") {
    return generateTextWithOpenAI(opts);
  }
  return generateTextWithGemini(opts);
}

async function generateTextWithGemini(opts: TextGenerateOptions): Promise<string> {
  const ai = getGemini();
  const response = await ai.models.generateContent({
    model: AI_CONFIG.gemini.textModel,
    contents: opts.system
      ? [{ role: "user", parts: [{ text: `${opts.system}\n\n${opts.prompt}` }] }]
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

async function generateTextWithOpenAI(opts: TextGenerateOptions): Promise<string> {
  const openai = getOpenAI();
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = opts.system
    ? [
        { role: "system", content: opts.system },
        { role: "user", content: opts.prompt },
      ]
    : [{ role: "user", content: opts.prompt }];

  const response = await openai.chat.completions.create({
    model: AI_CONFIG.openai.textModel,
    messages,
    max_completion_tokens: opts.maxOutputTokens ?? 8192,
  });

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error("OpenAI가 빈 응답을 반환했습니다.");
  return text;
}

/** JSON 응답 강제 — Gemini는 responseMimeType, OpenAI는 json_object 모드 사용 */
export async function generateJSON<T = unknown>(opts: TextGenerateOptions): Promise<T> {
  if (AI_CONFIG.textProvider === "openai") {
    const openai = getOpenAI();
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = opts.system
      ? [{ role: "system", content: opts.system }, { role: "user", content: opts.prompt }]
      : [{ role: "user", content: opts.prompt }];
    const response = await openai.chat.completions.create({
      model: AI_CONFIG.openai.textModel,
      messages,
      max_completion_tokens: opts.maxOutputTokens ?? 65536,
      response_format: { type: "json_object" },
    });
    const choice = response.choices[0];
    if (choice.finish_reason === "length") {
      throw new Error("출력이 너무 깁니다. 스크립트를 짧게 나눠 주세요.");
    }
    const raw = choice?.message?.content;
    if (!raw) throw new Error("OpenAI가 빈 응답을 반환했습니다.");
    return JSON.parse(raw) as T;
  }

  // Gemini — responseMimeType으로 JSON 모드 강제
  const ai = getGemini();
  const response = await ai.models.generateContent({
    model: AI_CONFIG.gemini.textModel,
    contents: opts.system
      ? [{ role: "user", parts: [{ text: `${opts.system}\n\n${opts.prompt}` }] }]
      : [{ role: "user", parts: [{ text: opts.prompt }] }],
    config: {
      temperature: opts.temperature ?? 0.5,
      maxOutputTokens: opts.maxOutputTokens ?? 65536,
      responseMimeType: "application/json",
    },
  });

  const candidate = response.candidates?.[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((candidate as any)?.finishReason === "MAX_TOKENS") {
    throw new Error("출력이 너무 깁니다. 스크립트를 짧게 나눠 주세요.");
  }
  const raw = candidate?.content?.parts?.[0]?.text;
  if (!raw) throw new Error("Gemini가 빈 응답을 반환했습니다.");
  return JSON.parse(raw) as T;
}
