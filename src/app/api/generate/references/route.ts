import { NextRequest, NextResponse, after } from "next/server";
import { requireCreator, deductCredits, refundCredits } from "@/lib/auth-guard";
import { checkGenerationLimit } from "@/lib/rate-limit";
import { CREDIT_COST } from "@/lib/credits";
import { createServiceClient } from "@/lib/supabase/server";
import { generateImage } from "@/lib/ai/image";
import { uploadBase64Image } from "@/lib/ai/storage";
import { processReference } from "@/lib/ai/reference-processor";
import type { StoryJson, CharacterBible, LocationEntry } from "@/lib/ai/story-schema";

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireCreator(CREDIT_COST.generateReference);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    const status = err.code === "UNAUTHENTICATED" ? 401 : err.code === "NOT_APPROVED" ? 403 : 402;
    return NextResponse.json({ error: err.message }, { status });
  }

  const limit = checkGenerationLimit(ctx.userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: "요청이 너무 많습니다." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const { webtoonId, episodeId, key, type, storyJson, provider = "openai" } = body ?? {};

  if (!webtoonId || !key || !type || !storyJson) {
    return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: wt } = await svc.from("webtoons").select("author_id").eq("id", webtoonId).single();
  if (!wt || (wt as { author_id: string }).author_id !== ctx.userId) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const sj = storyJson as StoryJson;
  let prompt = "";

  if (type === "character") {
    const char = sj.character_bible.find((c: CharacterBible) => c.char_key === key);
    if (!char) return NextResponse.json({ error: "캐릭터를 찾을 수 없습니다." }, { status: 404 });
    prompt = [
      `Character reference sheet for webtoon character.`,
      `Name: ${char.name}.`,
      `Visual: ${char.visual_core}.`,
      `Wardrobe: ${char.wardrobe}.`,
      `Expression: ${char.expression}.`,
      `Art style: ${sj.style_guide.art_style}.`,
      `Full body, front view, clean white background, neutral pose.`,
      `Negative: ${sj.style_guide.global_negative_prompt}`,
    ].join(" ");
  } else if (type === "location") {
    const loc = sj.locations?.find((l: LocationEntry) => l.loc_key === key);
    if (!loc) return NextResponse.json({ error: "장소를 찾을 수 없습니다." }, { status: 404 });
    prompt = [
      `Background establishing shot for webtoon location.`,
      `Location: ${loc.name}. ${loc.description}.`,
      `Art style: ${sj.style_guide.art_style}.`,
      `Color palette: ${sj.style_guide.color_palette}.`,
      `No characters, wide establishing shot.`,
      `Negative: ${sj.style_guide.global_negative_prompt}`,
    ].join(" ");
  } else if (type === "prop") {
    const prop = sj.props?.find((p: import("@/lib/ai/story-schema").PropEntry) => p.prop_key === key);
    if (!prop) return NextResponse.json({ error: "소품을 찾을 수 없습니다." }, { status: 404 });
    prompt = [
      `Prop reference sheet for webtoon illustration.`,
      `Name: ${prop.name}.`,
      `Visual: ${prop.visual_core ?? prop.description}.`,
      `Art style: ${sj.style_guide.art_style}.`,
      `Clean white background, centered, detailed view.`,
      `Negative: ${sj.style_guide.global_negative_prompt}`,
    ].join(" ");
  } else {
    return NextResponse.json({ error: "type은 character | location | prop 중 하나여야 합니다." }, { status: 400 });
  }

  // ── episodeId 없음: setup 페이지 등 동기 호출 → 직접 생성 후 { imageUrl } 반환 ──
  if (!episodeId) {
    await deductCredits(ctx.userId, CREDIT_COST.generateReference);
    try {
      const result = await generateImage({ provider, prompt, usePro: true });
      const folder = type === "character" ? "chars" : type === "location" ? "locations" : "props";
      const imageUrl = await uploadBase64Image(result.base64, result.mimeType, `${webtoonId}/${folder}/${key}.png`);

      if (type === "character") {
        const { data: existing } = await svc.from("characters").select("id").eq("webtoon_id", webtoonId).eq("char_key", key).single();
        if (existing) {
          await svc.from("characters").update({ reference_image_url: imageUrl }).eq("id", (existing as { id: string }).id);
        }
      } else if (type === "location") {
        const { data: existing } = await svc.from("locations").select("id").eq("webtoon_id", webtoonId).eq("loc_key", key).single();
        if (existing) {
          await svc.from("locations").update({ reference_image_url: imageUrl }).eq("id", (existing as { id: string }).id);
        }
      } else {
        const { data: existing } = await svc.from("props").select("id").eq("webtoon_id", webtoonId).eq("prop_key", key).single();
        if (existing) {
          await svc.from("props").update({ reference_image_url: imageUrl }).eq("id", (existing as { id: string }).id);
        }
      }

      return NextResponse.json({ imageUrl });
    } catch (e) {
      await refundCredits(ctx.userId, CREDIT_COST.generateReference);
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  // ── episodeId 있음: 에피소드 워크플로우 → Edge Function으로 async 처리 ──
  const { data: job, error: jobError } = await svc
    .from("generation_jobs")
    .insert({ episode_id: episodeId, kind: "references", status: "running", progress: 0, provider })
    .select("id")
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job 생성 실패" }, { status: 500 });
  }

  const jobId = (job as { id: string }).id;

  after(async () => {
    try {
      await processReference({
        jobId,
        episodeId,
        webtoonId,
        userId: ctx.userId,
        key,
        type: type as "character" | "location" | "prop",
        prompt,
        provider,
      });
    } catch (e) {
      await svc.from("generation_jobs")
        .update({ status: "failed", error: String(e) })
        .eq("id", jobId);
    }
  });

  return NextResponse.json({ jobId });
}

export async function PATCH(req: NextRequest) {
  const supabase = await (await import("@/lib/supabase/server")).createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { webtoonId, key, type, locked } = body ?? {};
  if (!webtoonId || !key || !type) {
    return NextResponse.json({ error: "필수 파라미터 누락" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: wt } = await svc.from("webtoons").select("author_id").eq("id", webtoonId).single();
  if (!wt || (wt as { author_id: string }).author_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (type === "character") {
    await svc.from("characters").update({ locked }).eq("webtoon_id", webtoonId).eq("char_key", key);
  } else {
    await svc.from("locations").update({ locked }).eq("webtoon_id", webtoonId).eq("loc_key", key);
  }

  return NextResponse.json({ ok: true });
}
