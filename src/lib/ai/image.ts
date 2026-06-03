/**
 * 이미지 생성 — 서버 전용. 클라이언트에서 절대 호출 금지.
 * provider: "gemini" | "openai"
 * 레퍼런스 이미지를 입력으로 첨부해 캐릭터 일관성을 유지한다.
 */
import { GoogleGenAI, Modality } from "@google/genai";
import OpenAI from "openai";
import { AI_CONFIG, type ImageProvider } from "./config";
import * as fs from "fs";
import * as path from "path";

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

export interface ReferenceImage {
  url: string;
  /** 모델에 전달할 이 이미지의 역할 설명 */
  label: string;
}

export type ImageSize = "1024x1024" | "1536x1024" | "1024x1536";

export function panelTypeToSize(panelType: string): ImageSize {
  if (panelType === "wide") return "1536x1024";
  if (panelType === "insert" || panelType === "close") return "1024x1024";
  return "1024x1536"; // splash, medium, default
}

export interface ImageGenerateOptions {
  provider: ImageProvider;
  prompt: string;
  /** 레이블이 있는 레퍼런스 이미지 목록 */
  references?: ReferenceImage[];
  /** pro 모델 사용 여부 (레퍼런스 많을 때) */
  usePro?: boolean;
  /** 출력 이미지 사이즈 (OpenAI) */
  size?: ImageSize;
  /** mock 모드: 실제 API 호출 없이 placeholder 반환 */
  mock?: boolean;
}

export interface ImageGenerateResult {
  /** base64 PNG */
  base64: string;
  mimeType: string;
}

/** URL → base64 변환 (서버 사이드) */
async function urlToBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("https URL만 허용됩니다.");
  const res = await fetch(url);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get("content-type") ?? "image/png";
  return { data: buffer.toString("base64"), mimeType };
}

export async function generateImage(
  opts: ImageGenerateOptions
): Promise<ImageGenerateResult> {
  // mock 모드: 실제 API 없이 placeholder 이미지 반환
  if (opts.mock || process.env.NODE_ENV === "test") {
    return {
      base64: PLACEHOLDER_BASE64,
      mimeType: "image/png",
    };
  }

  if (opts.provider === "gemini") {
    return generateWithGemini(opts);
  } else {
    return generateWithOpenAI(opts);
  }
}

async function generateWithGemini(
  opts: ImageGenerateOptions
): Promise<ImageGenerateResult> {
  const ai = getGemini();
  const modelId = opts.usePro
    ? AI_CONFIG.gemini.imageModelPro
    : AI_CONFIG.gemini.imageModelStandard;

  // 멀티파트 contents 구성: 레이블 텍스트 → 이미지 교차 삽입
  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [];

  if (opts.references && opts.references.length > 0) {
    for (const ref of opts.references) {
      parts.push({ text: ref.label });
      const { data, mimeType } = await urlToBase64(ref.url);
      parts.push({ inlineData: { mimeType, data } });
    }
  }
  parts.push({ text: opts.prompt });

  const response = await ai.models.generateContent({
    model: modelId,
    contents: [{ role: "user", parts }],
    config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
  });

  const imagePart = response.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData?.mimeType?.startsWith("image/")
  );
  if (!imagePart?.inlineData) {
    throw new Error("Gemini가 이미지를 반환하지 않았습니다.");
  }

  return {
    base64: imagePart.inlineData.data!,
    mimeType: imagePart.inlineData.mimeType!,
  };
}

async function generateWithOpenAI(
  opts: ImageGenerateOptions
): Promise<ImageGenerateResult> {
  const openai = getOpenAI();
  const size = opts.size ?? "1024x1536";

  if (opts.references && opts.references.length > 0) {
    const refSection = opts.references
      .map((r, i) => `Reference image ${i + 1}: ${r.label}`)
      .join("\n");
    const fullPrompt = `Reference images provided:\n${refSection}\n\n${opts.prompt}`;

    const files = await Promise.all(
      opts.references.slice(0, 16).map(async (ref, i) => {
        const { data, mimeType } = await urlToBase64(ref.url);
        const buffer = Buffer.from(data, "base64");
        return OpenAI.toFile(buffer, `ref_${i}.png`, { type: mimeType });
      })
    );

    const response = await openai.images.edit({
      model: AI_CONFIG.openai.imageModel,
      image: files as Parameters<typeof openai.images.edit>[0]["image"],
      prompt: fullPrompt,
      n: 1,
      size,
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI images.edit 응답이 비어 있습니다.");
    return { base64: b64, mimeType: "image/png" };
  } else {
    const response = await openai.images.generate({
      model: AI_CONFIG.openai.imageModel,
      prompt: opts.prompt,
      n: 1,
      size,
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI images.generate 응답이 비어 있습니다.");
    return { base64: b64, mimeType: "image/png" };
  }
}

// 1x1 투명 PNG — mock/fallback용
const PLACEHOLDER_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
