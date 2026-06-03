/**
 * Supabase Edge Function: generate-cuts
 * Vercel의 10초 함수 제한을 피하기 위해 컷 이미지 생성을 여기서 처리.
 * Next.js API는 job 생성 후 이 함수를 fire-and-forget으로 호출.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const GEMINI_IMAGE_MODEL_STANDARD = Deno.env.get("GEMINI_IMAGE_MODEL_STANDARD") ?? "gemini-2.0-flash-preview-image-generation";
const GEMINI_IMAGE_MODEL_PRO = Deno.env.get("GEMINI_IMAGE_MODEL_PRO") ?? "gemini-2.5-pro-preview-06-05";
const OPENAI_IMAGE_MODEL = Deno.env.get("OPENAI_IMAGE_MODEL") ?? "gpt-image-2";
const CREDIT_COST_PER_CUT = 10;

interface Cut {
  cut_id: string;
  panel_type: string;
  visual_prompt: string;
  camera: string;
  emotion: string;
  character_keys: string[];
  location_key: string;
  prop_keys?: string[];
  dialogue?: { character: string; text: string; bubble_position?: string }[];
  narration?: { text: string }[];
  sfx?: { text: string }[];
}

interface Scene {
  scene_id: string;
  location_key: string;
  description: string;
  cuts: Cut[];
}

interface StyleGuide {
  art_style: string;
  color_palette: string;
  line_weight: string;
  mood: string;
  global_negative_prompt: string;
}

interface CharacterBible {
  char_key: string;
  name: string;
  visual_core: string;
  wardrobe: string;
  expression: string;
}

interface StoryJson {
  project_title: string;
  episode: string;
  style_guide: StyleGuide;
  character_bible: CharacterBible[];
  scenes: Scene[];
}

// ── 이미지 생성 ────────────────────────────────────────────────────

async function urlToBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const data = btoa(binary);
  const mimeType = res.headers.get("content-type") ?? "image/png";
  return { data, mimeType };
}

interface ReferenceImage {
  url: string;
  label: string;
}

type ImageSize = "1024x1024" | "1536x1024" | "1024x1536";

async function generateWithGemini(prompt: string, references: ReferenceImage[], usePro: boolean): Promise<{ base64: string; mimeType: string }> {
  const modelId = usePro ? GEMINI_IMAGE_MODEL_PRO : GEMINI_IMAGE_MODEL_STANDARD;
  const parts: unknown[] = [];

  for (const ref of references) {
    parts.push({ text: ref.label });
    const { data, mimeType } = await urlToBase64(ref.url);
    parts.push({ inlineData: { mimeType, data } });
  }
  parts.push({ text: prompt });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
  const json = await res.json() as { candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[] };
  const imagePart = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.mimeType?.startsWith("image/"));
  if (!imagePart?.inlineData) throw new Error("Gemini가 이미지를 반환하지 않았습니다.");
  return { base64: imagePart.inlineData.data, mimeType: imagePart.inlineData.mimeType };
}

async function generateWithOpenAI(prompt: string, references: ReferenceImage[], size: ImageSize): Promise<{ base64: string; mimeType: string }> {
  if (references.length > 0) {
    const refSection = references.map((r, i) => `Reference image ${i + 1}: ${r.label}`).join("\n");
    const fullPrompt = `Reference images provided:\n${refSection}\n\n${prompt}`;

    const formData = new FormData();
    formData.append("model", OPENAI_IMAGE_MODEL);
    formData.append("prompt", fullPrompt);
    formData.append("n", "1");
    formData.append("response_format", "b64_json");
    formData.append("size", size);

    for (let i = 0; i < Math.min(references.length, 16); i++) {
      const { data, mimeType } = await urlToBase64(references[i].url);
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: mimeType });
      formData.append("image[]", blob, `ref_${i}.png`);
    }

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });
    if (!res.ok) throw new Error(`OpenAI images.edit error: ${res.status} ${await res.text()}`);
    const json = await res.json() as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI images.edit 응답이 비어 있습니다.");
    return { base64: b64, mimeType: "image/png" };
  } else {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: OPENAI_IMAGE_MODEL, prompt, n: 1, response_format: "b64_json", size }),
    });
    if (!res.ok) throw new Error(`OpenAI images.generate error: ${res.status} ${await res.text()}`);
    const json = await res.json() as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error("OpenAI images.generate 응답이 비어 있습니다.");
    return { base64: b64, mimeType: "image/png" };
  }
}

function panelTypeToSize(panelType: string): ImageSize {
  if (panelType === "wide") return "1536x1024";
  if (panelType === "insert" || panelType === "close") return "1024x1024";
  return "1024x1536"; // splash, medium, default
}

// ── 스토리지 업로드 ──────────────────────────────────────────────

async function uploadBase64Image(base64: string, mimeType: string, storagePath: string): Promise<string> {
  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const { error } = await svc.storage
    .from("webtoon-images")
    .upload(storagePath, bytes, { contentType: mimeType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data: urlData } = svc.storage.from("webtoon-images").getPublicUrl(storagePath);
  return urlData.publicUrl;
}

// ── 프롬프트 빌더 (Next.js prompt.ts 포팅) ────────────────────────

function buildCutPrompt(cut: Cut, scene: Scene, storyJson: StoryJson): string {
  const hasText = ((cut.dialogue?.length ?? 0) + (cut.narration?.length ?? 0) + (cut.sfx?.length ?? 0)) > 0;

  const characterBible = (storyJson.character_bible ?? [])
    .map((c) => `- ${c.name} (${c.char_key}): ${c.visual_core}. Wardrobe: ${c.wardrobe}. Expression: ${c.expression}.`)
    .join("\n");

  const dialogue = (cut.dialogue ?? [])
    .map((d) => `- Speaker: ${d.character || "Narrator"}\n  Text: ${d.text}\n  Bubble position: ${d.bubble_position ?? "auto"}`)
    .join("\n");

  const narration = (cut.narration ?? []).map((n) => `- ${n.text}`).join("\n");
  const sfx = (cut.sfx ?? []).map((s) => `- ${s.text}`).join("\n");

  const textRules = hasText
    ? `Text rendering mode:
- Render speech bubbles directly inside the image.
- Render all Korean dialogue exactly as provided.
- Render narration as clean rectangular narration boxes.
- Render SFX as Korean comic sound effect text.
- Follow bubble_position as closely as possible.
- Korean text must be readable, clean, and correctly spelled.
- Use natural Korean webtoon typography.
- Keep speech bubbles from covering important faces.
- If there is too much text, use smaller but readable bubbles.
- Do not invent new dialogue.
- Do not translate Korean text into English.`
    : `Clean artwork mode:
- Do not draw speech bubbles.
- Do not render Korean text inside the image.
- Leave clean empty space for speech bubbles.`;

  const panelType = cut.panel_type;
  const sizeHint = panelType === "wide"
    ? "Landscape orientation (wider than tall). "
    : panelType === "insert" || panelType === "close"
    ? "Square composition. "
    : "Vertical portrait orientation (taller than wide). ";

  return `Create one Korean webtoon panel.

Title: ${storyJson.project_title}
Episode: ${storyJson.episode}
Scene: ${scene.scene_id} - ${scene.description}
Cut: ${cut.cut_id}
Panel type: ${panelType} — ${sizeHint}

Visual prompt (follow exactly):
${cut.visual_prompt}

Camera: ${cut.camera}
Emotion: ${cut.emotion}

Character bible:
${characterBible || "- none"}

Style:
${storyJson.style_guide.art_style}
Color palette: ${storyJson.style_guide.color_palette}
Line weight: ${storyJson.style_guide.line_weight}
Mood: ${storyJson.style_guide.mood}

Panel rules:
- Polished Korean webtoon style.
- Clean line art, soft shading, cinematic composition.
- Keep characters visually consistent across all panels.
- Make this look like a finished Korean webtoon cut.
- Preserve character outfits, props, location details, mood, and lighting.

${textRules}

Dialogue to render:
${dialogue || "- none"}

Narration to render:
${narration || "- none"}

SFX to render:
${sfx || "- none"}

Negative prompt:
${storyJson.style_guide.global_negative_prompt}`.trim();
}

// ── 크레딧 처리 ───────────────────────────────────────────────────

async function deductCredits(svc: ReturnType<typeof createClient>, userId: string, amount: number): Promise<void> {
  const { error } = await svc.rpc("deduct_credits", { p_user_id: userId, p_amount: amount });
  if (error) throw new Error(`크레딧 차감 실패: ${error.message}`);
}

async function refundCredits(svc: ReturnType<typeof createClient>, userId: string, amount: number): Promise<void> {
  await svc.rpc("refund_credits", { p_user_id: userId, p_amount: amount }).catch(() => {});
}

// ── 메인 처리 ─────────────────────────────────────────────────────

async function processCuts(opts: {
  jobId: string;
  episodeId: string;
  webtoonId: string;
  provider: string;
  userId: string;
}) {
  const { jobId, episodeId, webtoonId, provider, userId } = opts;
  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: ep } = await svc.from("episodes").select("story_json").eq("id", episodeId).single();
  if (!ep) throw new Error("에피소드를 찾을 수 없습니다.");
  const storyJson = (ep as { story_json: StoryJson }).story_json;
  const allCuts = storyJson.scenes.flatMap((s) => s.cuts);

  const [
    { data: charRows },
    { data: locRows },
    { data: propRows },
    { data: existingCutRows },
  ] = await Promise.all([
    svc.from("characters").select("char_key, reference_image_url").eq("webtoon_id", webtoonId),
    svc.from("locations").select("loc_key, reference_image_url").eq("webtoon_id", webtoonId),
    svc.from("props").select("prop_key, reference_image_url").eq("webtoon_id", webtoonId),
    svc.from("cuts").select("cut_id_key, status, image_url").eq("episode_id", episodeId),
  ]);

  const charMap: Record<string, string> = {};
  for (const c of (charRows ?? []) as { char_key: string; reference_image_url: string | null }[]) {
    if (c.reference_image_url) charMap[c.char_key] = c.reference_image_url;
  }
  const locMap: Record<string, string> = {};
  for (const l of (locRows ?? []) as { loc_key: string; reference_image_url: string | null }[]) {
    if (l.reference_image_url) locMap[l.loc_key] = l.reference_image_url;
  }
  const propMap: Record<string, string> = {};
  for (const p of (propRows ?? []) as { prop_key: string; reference_image_url: string | null }[]) {
    if (p.reference_image_url) propMap[p.prop_key] = p.reference_image_url;
  }

  const existingMap = new Map<string, { status: string; image_url: string | null }>();
  for (const c of (existingCutRows ?? []) as { cut_id_key: string; status: string; image_url: string | null }[]) {
    existingMap.set(c.cut_id_key, { status: c.status, image_url: c.image_url });
  }

  let done = 0;

  await Promise.allSettled(
    storyJson.scenes.map(async (scene) => {
      let prevImageUrl: string | null = null;

      for (const cut of scene.cuts) {
        const existing = existingMap.get(cut.cut_id);
        if (existing?.status === "done") {
          prevImageUrl = existing.image_url;
          done++;
          await svc.from("generation_jobs")
            .update({ progress: Math.round((done / allCuts.length) * 100) })
            .eq("id", jobId);
          continue;
        }

        const { data: jobRow } = await svc
          .from("generation_jobs").select("status").eq("id", jobId).single();
        if ((jobRow as { status: string } | null)?.status === "cancelled") return;

        await svc.from("cuts")
          .update({ status: "generating" })
          .eq("episode_id", episodeId).eq("cut_id_key", cut.cut_id);

        try {
          await deductCredits(svc, userId, CREDIT_COST_PER_CUT);

          const references: ReferenceImage[] = [
            ...(cut.character_keys ?? []).filter((k) => charMap[k])
              .map((k) => ({ url: charMap[k], label: `Character reference (${k}): maintain this character's appearance` })),
            ...(locMap[cut.location_key]
              ? [{ url: locMap[cut.location_key], label: `Location reference (${cut.location_key}): maintain background/environment` }]
              : []),
            ...((cut.prop_keys ?? []).filter((k) => propMap[k])
              .map((k) => ({ url: propMap[k], label: `Prop reference (${k}): this object appears in the panel` }))),
            ...(prevImageUrl
              ? [{ url: prevImageUrl, label: "Previous panel in scene: maintain visual continuity, same characters/setting/lighting/style" }]
              : []),
          ];

          const prompt = buildCutPrompt(cut, scene, storyJson);
          const size = panelTypeToSize(cut.panel_type);
          const usePro = references.length >= 3;

          const result = provider === "gemini"
            ? await generateWithGemini(prompt, references, usePro)
            : await generateWithOpenAI(prompt, references, size);

          const storagePath = `${webtoonId}/cuts/${episodeId}_${cut.cut_id}.png`;
          const imageUrl = await uploadBase64Image(result.base64, result.mimeType, storagePath);

          await svc.from("cuts")
            .update({ status: "done", image_url: imageUrl })
            .eq("episode_id", episodeId).eq("cut_id_key", cut.cut_id);

          prevImageUrl = imageUrl;
        } catch (e) {
          await refundCredits(svc, userId, CREDIT_COST_PER_CUT);
          await svc.from("cuts")
            .update({ status: "failed" })
            .eq("episode_id", episodeId).eq("cut_id_key", cut.cut_id);
          console.error(`컷 ${cut.cut_id} 생성 실패:`, e);
          prevImageUrl = null;
        }

        done++;
        await svc.from("generation_jobs")
          .update({ progress: Math.round((done / allCuts.length) * 100) })
          .eq("id", jobId);
      }
    })
  );

  const { data: finalJob } = await svc.from("generation_jobs")
    .select("status").eq("id", jobId).single();
  if ((finalJob as { status: string } | null)?.status === "cancelled") return;

  const { data: failedCuts } = await svc.from("cuts")
    .select("id").eq("episode_id", episodeId).eq("status", "failed");
  const finalStatus = (failedCuts?.length ?? 0) === 0 ? "ready" : "failed";
  await svc.from("episodes").update({ status: finalStatus }).eq("id", episodeId);
  await svc.from("generation_jobs")
    .update({ status: "done", progress: 100 }).eq("id", jobId);
}

// ── HTTP 핸들러 ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // 인증 (service role만 허용)
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ") || auth.slice(7) !== SUPABASE_SERVICE_ROLE_KEY) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.jobId || !body?.episodeId || !body?.webtoonId || !body?.userId) {
    return new Response("jobId, episodeId, webtoonId, userId 필요", { status: 400 });
  }

  // 즉시 200 반환, 처리는 백그라운드에서
  (async () => {
    await processCuts(body).catch(async (e) => {
      console.error("processCuts 실패:", e);
      const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await svc.from("generation_jobs")
        .update({ status: "failed", error: String(e) })
        .eq("id", body.jobId);
    });
  })();

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
