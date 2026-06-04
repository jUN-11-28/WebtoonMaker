import { createServiceClient } from "@/lib/supabase/server";
import { generateImage } from "@/lib/ai/image";
import { uploadBase64Image } from "@/lib/ai/storage";
import type { ImageProvider } from "@/lib/ai/config";
import type { Json } from "@/lib/supabase/types";

const CREDIT_COST = 1;

export interface ProcessReferenceOptions {
  jobId: string;
  episodeId: string | null;
  webtoonId: string;
  userId: string;
  key: string;
  type: "character" | "location" | "prop";
  prompt: string;
  provider: ImageProvider;
}

export async function processReference(opts: ProcessReferenceOptions): Promise<void> {
  const { jobId, episodeId, webtoonId, userId, key, type, prompt, provider } = opts;
  const svc = createServiceClient();

  const { error: creditErr } = await svc.rpc("adjust_credits", {
    target_user_id: userId,
    delta: -CREDIT_COST,
  });
  if (creditErr) throw new Error(`크레딧 차감 실패: ${creditErr.message}`);

  let result: { base64: string; mimeType: string };
  try {
    result = await generateImage({ provider, prompt, usePro: true });
  } catch (e) {
    try { await svc.rpc("adjust_credits", { target_user_id: userId, delta: CREDIT_COST }); } catch { /* 환불 실패 무시 */ }
    throw e;
  }

  const folder = type === "character" ? "chars" : type === "location" ? "locations" : "props";
  const storagePath = `${webtoonId}/${folder}/${key}.png`;
  const imageUrl = await uploadBase64Image(result.base64, result.mimeType, storagePath);

  if (type === "character") {
    const { data: existing } = await svc.from("characters").select("id").eq("webtoon_id", webtoonId).eq("char_key", key).single();
    if (existing) {
      await svc.from("characters").update({ reference_image_url: imageUrl }).eq("id", (existing as { id: string }).id);
    } else {
      await svc.from("characters").insert({
        webtoon_id: webtoonId,
        episode_id: episodeId ?? null,
        char_key: key,
        name: key,
        bible: {} as unknown as Json,
        reference_image_url: imageUrl,
        locked: false,
      });
    }
  } else if (type === "location") {
    const { data: existing } = await svc.from("locations").select("id").eq("webtoon_id", webtoonId).eq("loc_key", key).single();
    if (existing) {
      await svc.from("locations").update({ reference_image_url: imageUrl }).eq("id", (existing as { id: string }).id);
    } else {
      await svc.from("locations").insert({
        webtoon_id: webtoonId,
        episode_id: episodeId ?? null,
        loc_key: key,
        name: key,
        reference_image_url: imageUrl,
        locked: false,
      });
    }
  } else {
    const { data: existing } = await svc.from("props").select("id").eq("webtoon_id", webtoonId).eq("prop_key", key).single();
    if (existing) {
      await svc.from("props").update({ reference_image_url: imageUrl }).eq("id", (existing as { id: string }).id);
    } else {
      await svc.from("props").insert({
        webtoon_id: webtoonId,
        episode_id: episodeId ?? null,
        prop_key: key,
        name: key,
        reference_image_url: imageUrl,
        locked: false,
      });
    }
  }

  await svc.from("generation_jobs")
    .update({ status: "done", progress: 100, metadata: { imageUrl } as unknown as Json })
    .eq("id", jobId);
}
