/**
 * 컷 이미지 일괄 생성 처리기 — 서버 전용.
 * generate-cuts Route Handler의 after() 콜백에서 호출.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { generateImage, panelTypeToSize, type ReferenceImage } from "./image";
import { uploadBase64Image } from "./storage";
import type { Cut, Scene, StoryJson } from "./story-schema";

const CREDIT_COST_PER_CUT = 10;

async function adjustCredits(userId: string, delta: number): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.rpc("adjust_credits", { target_user_id: userId, delta });
  if (error && delta < 0) throw new Error(`크레딧 차감 실패: ${error.message}`);
}

function buildCutPrompt(cut: Cut, scene: Scene, storyJson: StoryJson): string {
  const hasText =
    (cut.dialogue?.length ?? 0) + (cut.narration?.length ?? 0) + (cut.sfx?.length ?? 0) > 0;

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
  const sizeHint =
    panelType === "wide"
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

export interface ProcessCutsOptions {
  jobId: string;
  episodeId: string;
  webtoonId: string;
  provider: string;
  userId: string;
}

export async function processCuts(opts: ProcessCutsOptions): Promise<void> {
  const { jobId, episodeId, webtoonId, provider, userId } = opts;
  const svc = createServiceClient();

  const { data: ep } = await svc.from("episodes").select("story_json").eq("id", episodeId).single();
  if (!ep) throw new Error("에피소드를 찾을 수 없습니다.");
  const storyJson = (ep as unknown as { story_json: StoryJson }).story_json;
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
          await adjustCredits(userId, -CREDIT_COST_PER_CUT);

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

          const result = await generateImage({ provider: provider as "gemini" | "openai", prompt, references, size, usePro });

          const storagePath = `${webtoonId}/cuts/${episodeId}_${cut.cut_id}.png`;
          const imageUrl = await uploadBase64Image(result.base64, result.mimeType, storagePath);

          await svc.from("cuts")
            .update({ status: "done", image_url: imageUrl })
            .eq("episode_id", episodeId).eq("cut_id_key", cut.cut_id);

          prevImageUrl = imageUrl;
        } catch (e) {
          await adjustCredits(userId, CREDIT_COST_PER_CUT).catch(() => {});
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
