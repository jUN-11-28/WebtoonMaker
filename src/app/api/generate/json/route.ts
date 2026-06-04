import { NextRequest, NextResponse, after } from "next/server";
import { requireCreator } from "@/lib/auth-guard";
import { checkGenerationLimit } from "@/lib/rate-limit";
import { CREDIT_COST } from "@/lib/credits";
import { createServiceClient } from "@/lib/supabase/server";
import { processJson } from "@/lib/ai/json-processor";
import type { Json } from "@/lib/supabase/types";

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireCreator(CREDIT_COST.generateJson);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    const status = err.code === "UNAUTHENTICATED" ? 401
      : err.code === "NOT_APPROVED" ? 403
      : err.code === "INSUFFICIENT_CREDITS" ? 402 : 500;
    return NextResponse.json({ error: err.message }, { status });
  }

  const limit = checkGenerationLimit(ctx.userId);
  if (!limit.allowed) {
    return NextResponse.json({ error: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const { script, webtoonId, episodeId, selectedCharKeys } = body ?? {};

  if (typeof script !== "string" || script.trim().length < 10) {
    return NextResponse.json({ error: "스크립트가 너무 짧습니다." }, { status: 400 });
  }
  if (!webtoonId || !episodeId) {
    return NextResponse.json({ error: "webtoonId, episodeId가 필요합니다." }, { status: 400 });
  }

  const svc = createServiceClient();

  const { data: webtoon } = await svc
    .from("webtoons")
    .select("author_id, title, brief, style, description")
    .eq("id", webtoonId)
    .single();

  if (!webtoon || (webtoon as { author_id: string }).author_id !== ctx.userId) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const { data: episode } = await svc
    .from("episodes")
    .select("id")
    .eq("id", episodeId)
    .eq("webtoon_id", webtoonId)
    .single();

  if (!episode) {
    return NextResponse.json({ error: "에피소드를 찾을 수 없습니다." }, { status: 404 });
  }

  const [{ data: existingChars }, { data: existingLocs }] = await Promise.all([
    svc.from("characters").select("char_key, name, bible").eq("webtoon_id", webtoonId),
    svc.from("locations").select("loc_key, name").eq("webtoon_id", webtoonId),
  ]);

  const charFilter = Array.isArray(selectedCharKeys) && selectedCharKeys.length > 0
    ? new Set<string>(selectedCharKeys)
    : null;

  const existingCharsBible = (existingChars ?? [])
    .filter((c) => !charFilter || charFilter.has((c as { char_key: string }).char_key))
    .map((c) => {
      const b = (c as { char_key: string; name: string; bible: Json }).bible as Record<string, string> | null;
      return {
        char_key: (c as { char_key: string }).char_key,
        name: (c as { name: string }).name,
        visual_core: b?.visual_core ?? "",
        wardrobe: b?.wardrobe ?? "",
        personality: b?.personality ?? "",
        expression: b?.expression ?? "",
      };
    });

  const existingLocsList = (existingLocs ?? []).map((l) => ({
    loc_key: (l as { loc_key: string }).loc_key,
    name: (l as { name: string }).name,
  }));

  const wt = webtoon as { author_id: string; title: string; brief: string | null; style: string | null; description: string | null };
  const briefBlock = wt.brief ? `\n\n## 프로젝트 기획안 (이 세계관과 캐릭터 설정을 반드시 따르세요):\n${wt.brief}` : "";
  const styleBlock = wt.style ? `\n\n## 화풍/스타일: ${wt.style}` : "";
  const contextBlock = existingCharsBible.length > 0
    ? `\n\n## 이미 등록된 캐릭터 (동일한 char_key와 설정 사용 필수):\n${JSON.stringify(existingCharsBible, null, 2)}\n\n## 이미 등록된 장소 (동일한 loc_key 사용):\n${JSON.stringify(existingLocsList, null, 2)}\n\n위 캐릭터/장소를 우선 사용하고, 이 화에 새로 등장하는 것만 추가하세요.`
    : "";

  const prompt = `다음 소설/스크립트를 웹툰 스토리보드 JSON으로 변환해 주세요.${briefBlock}${styleBlock}${contextBlock}\n\n## 이번 화 스크립트:\n${script}`;

  // job 생성
  const { data: job, error: jobError } = await svc
    .from("generation_jobs")
    .insert({ episode_id: episodeId, kind: "json", status: "running", progress: 0, provider: "gemini" as const })
    .select("id")
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "Job 생성 실패" }, { status: 500 });
  }

  const jobId = (job as { id: string }).id;

  after(async () => {
    try {
      await processJson({ jobId, episodeId, webtoonId, userId: ctx.userId, prompt });
    } catch (e) {
      await svc.from("generation_jobs")
        .update({ status: "failed", error: String(e) })
        .eq("id", jobId);
    }
  });

  return NextResponse.json({ jobId });
}
