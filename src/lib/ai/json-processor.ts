import { createServiceClient } from "@/lib/supabase/server";
import { generateJSON } from "@/lib/ai/text";
import { STORY_JSON_SYSTEM_PROMPT } from "@/lib/ai/story-schema";
import type { StoryJson } from "@/lib/ai/story-schema";
import type { Json } from "@/lib/supabase/types";

const CREDIT_COST = 1;

export interface ProcessJsonOptions {
  jobId: string;
  episodeId: string;
  webtoonId: string;
  userId: string;
  prompt: string;
}

export async function processJson(opts: ProcessJsonOptions): Promise<void> {
  const { jobId, episodeId, webtoonId, userId, prompt } = opts;
  const svc = createServiceClient();

  const { error: creditErr } = await svc.rpc("adjust_credits", {
    target_user_id: userId,
    delta: -CREDIT_COST,
  });
  if (creditErr) throw new Error(`크레딧 차감 실패: ${creditErr.message}`);

  let storyJson: StoryJson;
  try {
    storyJson = await generateJSON<StoryJson>({
      system: STORY_JSON_SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: 65536,
    });
  } catch (e) {
    try { await svc.rpc("adjust_credits", { target_user_id: userId, delta: CREDIT_COST }); } catch { /* 환불 실패 무시 */ }
    throw e;
  }

  await svc
    .from("episodes")
    .update({ story_json: storyJson as unknown as Json, script_source: null, status: "draft" })
    .eq("id", episodeId);

  for (const char of storyJson.character_bible ?? []) {
    await svc.from("characters").upsert(
      {
        webtoon_id: webtoonId,
        char_key: char.char_key,
        name: char.name,
        bible: char as unknown as Json,
        locked: false,
      },
      { onConflict: "webtoon_id,char_key", ignoreDuplicates: true }
    );
  }

  for (const loc of storyJson.locations ?? []) {
    await svc.from("locations").upsert(
      { webtoon_id: webtoonId, loc_key: loc.loc_key, name: loc.name, locked: false },
      { onConflict: "webtoon_id,loc_key", ignoreDuplicates: true }
    );
  }

  for (const prop of storyJson.props ?? []) {
    await svc.from("props").upsert(
      {
        webtoon_id: webtoonId,
        episode_id: episodeId,
        prop_key: prop.prop_key,
        name: prop.name,
        description: prop.description ?? null,
        visual_core: prop.visual_core ?? null,
        locked: false,
      },
      { onConflict: "webtoon_id,prop_key" }
    );
  }

  await svc.from("generation_jobs").update({ status: "done", progress: 100 }).eq("id", jobId);
}
