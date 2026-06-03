import { NextRequest, NextResponse } from "next/server";
import { requireCreator, deductCredits, refundCredits } from "@/lib/auth-guard";
import { checkGenerationLimit } from "@/lib/rate-limit";
import { CREDIT_COST } from "@/lib/credits";
import { generateJSON } from "@/lib/ai/text";
import { STORY_JSON_SYSTEM_PROMPT, type StoryJson } from "@/lib/ai/story-schema";
import { createServiceClient } from "@/lib/supabase/server";
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

  // 소유권 확인 + 기획안 로드
  const { data: webtoon } = await svc
    .from("webtoons")
    .select("author_id, title, brief, style, description")
    .eq("id", webtoonId)
    .single();

  if (!webtoon || (webtoon as { author_id: string }).author_id !== ctx.userId) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  // 에피소드 소유권 확인
  const { data: episode } = await svc
    .from("episodes")
    .select("id")
    .eq("id", episodeId)
    .eq("webtoon_id", webtoonId)
    .single();

  if (!episode) {
    return NextResponse.json({ error: "에피소드를 찾을 수 없습니다." }, { status: 404 });
  }

  // 프로젝트에 이미 구축된 캐릭터/장소 불러오기
  const [{ data: existingChars }, { data: existingLocs }] = await Promise.all([
    svc.from("characters").select("char_key, name, bible").eq("webtoon_id", webtoonId),
    svc.from("locations").select("loc_key, name").eq("webtoon_id", webtoonId),
  ]);

  // 선택된 캐릭터만 필터링 (selectedCharKeys가 있으면)
  const charFilter = Array.isArray(selectedCharKeys) && selectedCharKeys.length > 0
    ? new Set<string>(selectedCharKeys)
    : null;

  // 기존 캐릭터/장소를 프롬프트에 주입
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

  // 크레딧 선차감
  await deductCredits(ctx.userId, CREDIT_COST.generateJson);

  // 기획안 및 프로젝트 컨텍스트 블록 구성
  const wt = webtoon as { author_id: string; title: string; brief: string | null; style: string | null; description: string | null };

  const briefBlock = wt.brief
    ? `\n\n## 프로젝트 기획안 (이 세계관과 캐릭터 설정을 반드시 따르세요):\n${wt.brief}`
    : "";

  const styleBlock = wt.style
    ? `\n\n## 화풍/스타일: ${wt.style}`
    : "";

  const contextBlock = existingCharsBible.length > 0
    ? `\n\n## 이미 등록된 캐릭터 (동일한 char_key와 설정 사용 필수):
${JSON.stringify(existingCharsBible, null, 2)}

## 이미 등록된 장소 (동일한 loc_key 사용):
${JSON.stringify(existingLocsList, null, 2)}

위 캐릭터/장소를 우선 사용하고, 이 화에 새로 등장하는 것만 추가하세요.`
    : "";

  let storyJson: StoryJson;
  try {
    storyJson = await generateJSON<StoryJson>({
      system: STORY_JSON_SYSTEM_PROMPT,
      prompt: `다음 소설/스크립트를 웹툰 스토리보드 JSON으로 변환해 주세요.${briefBlock}${styleBlock}${contextBlock}\n\n## 이번 화 스크립트:\n${script}`,
      temperature: 0.5,
      maxOutputTokens: 16384,
    });
  } catch (e) {
    await refundCredits(ctx.userId, CREDIT_COST.generateJson);
    return NextResponse.json({ error: `LLM 생성 실패: ${(e as Error).message}` }, { status: 500 });
  }

  // story_json 저장
  const { error: updateError } = await svc
    .from("episodes")
    .update({
      story_json: storyJson as unknown as Json,
      script_source: script,
      status: "draft",
    })
    .eq("id", episodeId);

  if (updateError) {
    await refundCredits(ctx.userId, CREDIT_COST.generateJson);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // story_json의 새 캐릭터/장소를 프로젝트에 동기화
  for (const char of storyJson.character_bible ?? []) {
    const exists = existingCharsBible.find((c) => c.char_key === char.char_key);
    if (!exists) {
      await svc.from("characters").upsert(
        {
          webtoon_id: webtoonId,
          char_key: char.char_key,
          name: char.name,
          bible: char as unknown as Json,
          locked: false,
        },
        { onConflict: "webtoon_id,char_key" }
      );
    }
  }
  for (const loc of storyJson.locations ?? []) {
    const exists = existingLocsList.find((l) => l.loc_key === loc.loc_key);
    if (!exists) {
      await svc.from("locations").upsert(
        { webtoon_id: webtoonId, loc_key: loc.loc_key, name: loc.name, locked: false },
        { onConflict: "webtoon_id,loc_key" }
      );
    }
  }

  // 소품 동기화 (중복 제외)
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

  return NextResponse.json({ storyJson });
}
