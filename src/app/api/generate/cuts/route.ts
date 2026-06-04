import { NextRequest, NextResponse, after } from "next/server";
import { requireCreator } from "@/lib/auth-guard";
import { checkGenerationLimit } from "@/lib/rate-limit";
import { CREDIT_COST } from "@/lib/credits";
import { createServiceClient } from "@/lib/supabase/server";
import { processCuts } from "@/lib/ai/cuts-processor";
import type { StoryJson, Cut } from "@/lib/ai/story-schema";
import type { Json } from "@/lib/supabase/types";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { webtoonId, episodeId, provider = "openai" } = body ?? {};

  if (!webtoonId || !episodeId) {
    return NextResponse.json({ error: "webtoonId, episodeId 필요" }, { status: 400 });
  }

  let ctx;
  try {
    ctx = await requireCreator(1);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    const status = err.code === "UNAUTHENTICATED" ? 401 : err.code === "NOT_APPROVED" ? 403 : 402;
    return NextResponse.json({ error: err.message }, { status });
  }

  const limit = checkGenerationLimit(ctx.userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: "요청이 너무 많습니다." }, { status: 429 });
  }

  const svc = createServiceClient();

  const { data: wt } = await svc.from("webtoons").select("author_id").eq("id", webtoonId).single();
  if (!wt || (wt as { author_id: string }).author_id !== ctx.userId) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const { data: ep } = await svc.from("episodes").select("story_json").eq("id", episodeId).single();
  if (!ep || !(ep as { story_json: unknown }).story_json) {
    return NextResponse.json({ error: "story_json이 없습니다. Phase 1을 먼저 완료하세요." }, { status: 400 });
  }

  const storyJson = (ep as unknown as { story_json: StoryJson }).story_json;
  const allCuts = storyJson.scenes.flatMap((s) => s.cuts);

  // 이미 완료된 컷 조회 — 재생성 방지 + 크레딧 절약
  const { data: doneCutRows } = await svc
    .from("cuts")
    .select("cut_id_key")
    .eq("episode_id", episodeId)
    .eq("status", "done");
  const doneKeys = new Set(
    (doneCutRows ?? []).map((c) => (c as { cut_id_key: string }).cut_id_key)
  );

  const pendingCuts = allCuts.filter((c) => !doneKeys.has(c.cut_id));
  const totalCost = pendingCuts.length * CREDIT_COST.generateCut;

  if (ctx.credits < totalCost) {
    return NextResponse.json(
      { error: `크레딧 부족 (필요: ${totalCost}, 보유: ${ctx.credits})` },
      { status: 402 }
    );
  }

  const { data: job, error: jobError } = await svc
    .from("generation_jobs")
    .insert({ episode_id: episodeId, kind: "cuts", status: "running", progress: 0, provider })
    .select("id")
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job 생성 실패" }, { status: 500 });
  }

  const jobId = (job as { id: string }).id;

  // 완료되지 않은 컷만 pending으로 초기화 (done 컷은 건드리지 않음)
  if (pendingCuts.length > 0) {
    const cutInserts = pendingCuts.map((cut: Cut) => ({
      episode_id: episodeId,
      cut_id_key: cut.cut_id,
      order_index: allCuts.indexOf(cut),
      panel_type: cut.panel_type,
      visual_prompt: cut.visual_prompt,
      camera: cut.camera,
      dialogue: cut.dialogue as unknown as Json,
      narration: cut.narration as unknown as Json,
      sfx: cut.sfx as unknown as Json,
      emotion: cut.emotion,
      character_keys: cut.character_keys,
      location_key: cut.location_key,
      status: "pending" as const,
    }));
    await svc.from("cuts").upsert(cutInserts, { onConflict: "episode_id,cut_id_key" });
  }

  after(async () => {
    try {
      await processCuts({ jobId, episodeId, webtoonId, provider, userId: ctx.userId });
    } catch (e) {
      await svc.from("generation_jobs")
        .update({ status: "failed", error: String(e) })
        .eq("id", jobId);
    }
  });

  return NextResponse.json({ jobId });
}
