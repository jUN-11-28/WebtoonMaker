/**
 * 컷 이미지 일괄 생성 처리기 — 서버 전용.
 * generate-cuts Route Handler의 after() 콜백에서 호출.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { generateImage, panelTypeToSize, type ReferenceImage } from "./image";
import { uploadBase64Image } from "./storage";
import { buildCutPrompt } from "./prompt";
import { CREDIT_COST } from "@/lib/credits";
import type { StoryJson } from "./story-schema";

const CREDIT_COST_PER_CUT = CREDIT_COST.generateCut;

async function adjustCredits(userId: string, delta: number): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.rpc("adjust_credits", { target_user_id: userId, delta });
  if (error && delta < 0) throw new Error(`크레딧 차감 실패: ${error.message}`);
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

  // 이미 완료된 컷은 미리 집계해 progress를 한 번만 기록 — 스킵 분기마다 DB 쓰기 방지
  let done = allCuts.filter((c) => existingMap.get(c.cut_id)?.status === "done").length;
  if (done > 0) {
    await svc.from("generation_jobs")
      .update({ progress: Math.round((done / allCuts.length) * 100) })
      .eq("id", jobId);
  }

  await Promise.allSettled(
    storyJson.scenes.map(async (scene) => {
      let prevImageUrl: string | null = null;

      for (const cut of scene.cuts) {
        const existing = existingMap.get(cut.cut_id);
        if (existing?.status === "done") {
          prevImageUrl = existing.image_url;
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
