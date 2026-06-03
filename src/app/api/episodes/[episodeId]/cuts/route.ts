import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireCreator, deductCredits, refundCredits } from "@/lib/auth-guard";
import { generateImage, panelTypeToSize, type ReferenceImage } from "@/lib/ai/image";
import { uploadBase64Image } from "@/lib/ai/storage";
import { buildCutPrompt } from "@/lib/ai/prompt";
import { CREDIT_COST } from "@/lib/credits";
import type { StoryJson, Cut, Scene, DialogueLine, NarrationLine, SfxLine } from "@/lib/ai/story-schema";
import type { Json } from "@/lib/supabase/types";

/** 에피소드의 현재 컷 상태 + 진행 중인 job 반환 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  const { episodeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();

  // 소유권 확인
  const { data: ep } = await svc
    .from("episodes")
    .select("webtoon_id")
    .eq("id", episodeId)
    .single();
  if (!ep) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: wt } = await svc
    .from("webtoons")
    .select("author_id")
    .eq("id", (ep as { webtoon_id: string }).webtoon_id)
    .single();
  if (!wt || (wt as { author_id: string }).author_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [{ data: cuts }, { data: jobs }] = await Promise.all([
    svc
      .from("cuts")
      .select("cut_id_key, status, image_url, character_keys, location_key")
      .eq("episode_id", episodeId)
      .order("order_index"),
    svc
      .from("generation_jobs")
      .select("id, status, progress")
      .eq("episode_id", episodeId)
      .eq("kind", "cuts")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const cutStatuses = (cuts ?? []).map((c) => {
    const cut = c as {
      cut_id_key: string; status: string; image_url: string | null;
      character_keys: string[] | null; location_key: string | null;
    };
    return {
      cutId: cut.cut_id_key,
      label: cut.cut_id_key,
      status: cut.status,
      imageUrl: cut.image_url,
      characterKeys: cut.character_keys ?? [],
      locationKey: cut.location_key ?? "",
    };
  });

  const latestJob = (jobs ?? [])[0] as { id: string; status: string; progress: number } | undefined;
  const activeJob = latestJob?.status === "running" ? latestJob : null;

  return NextResponse.json({ cutStatuses, activeJob });
}

/** 컷 삭제 — story_json + cuts 테이블에서 제거 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  const { episodeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const cutIdKey = searchParams.get("cutIdKey");
  const webtoonId = searchParams.get("webtoonId");
  if (!cutIdKey || !webtoonId) return NextResponse.json({ error: "cutIdKey, webtoonId 필요" }, { status: 400 });

  const svc = createServiceClient();
  const { data: wt } = await svc.from("webtoons").select("author_id").eq("id", webtoonId).single();
  if (!wt || (wt as { author_id: string }).author_id !== user.id) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const { data: ep } = await svc.from("episodes").select("story_json").eq("id", episodeId).single();
  if (!ep) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const storyJson = (ep as unknown as { story_json: StoryJson }).story_json;

  const updatedStoryJson: StoryJson = {
    ...storyJson,
    scenes: storyJson.scenes.map((scene) => ({
      ...scene,
      cuts: scene.cuts.filter((c) => c.cut_id !== cutIdKey),
    })).filter((scene) => scene.cuts.length > 0),
  };

  await Promise.all([
    svc.from("episodes").update({ story_json: updatedStoryJson as unknown as import("@/lib/supabase/types").Json }).eq("id", episodeId),
    svc.from("cuts").delete().eq("episode_id", episodeId).eq("cut_id_key", cutIdKey),
  ]);

  return NextResponse.json({ ok: true });
}

/** 단일 컷 내용만 저장 (이미지 재생성 없음) */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  const { episodeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { webtoonId, cutIdKey, visual_prompt, dialogue, narration, sfx, character_keys, location_key } = body ?? {};
  if (!webtoonId || !cutIdKey) return NextResponse.json({ error: "webtoonId, cutIdKey 필요" }, { status: 400 });

  const svc = createServiceClient();
  const { data: wt } = await svc.from("webtoons").select("author_id").eq("id", webtoonId).single();
  if (!wt || (wt as { author_id: string }).author_id !== user.id) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const { data: ep } = await svc.from("episodes").select("story_json").eq("id", episodeId).single();
  if (!ep) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const storyJson = (ep as unknown as { story_json: StoryJson }).story_json;

  const updatedStoryJson: StoryJson = {
    ...storyJson,
    scenes: storyJson.scenes.map((scene) => ({
      ...scene,
      cuts: scene.cuts.map((c) => {
        if (c.cut_id !== cutIdKey) return c;
        return {
          ...c,
          ...(visual_prompt !== undefined && { visual_prompt }),
          ...(dialogue !== undefined && { dialogue: dialogue as DialogueLine[] }),
          ...(narration !== undefined && { narration: narration as NarrationLine[] }),
          ...(sfx !== undefined && { sfx: sfx as SfxLine[] }),
          ...(character_keys !== undefined && { character_keys: character_keys as string[] }),
          ...(location_key !== undefined && { location_key: location_key as string }),
        };
      }),
    })),
  };

  await Promise.all([
    svc.from("episodes").update({ story_json: updatedStoryJson as unknown as Json }).eq("id", episodeId),
    svc.from("cuts").update({
      ...(visual_prompt !== undefined && { visual_prompt }),
      ...(dialogue !== undefined && { dialogue: dialogue as unknown as Json }),
      ...(narration !== undefined && { narration: narration as unknown as Json }),
      ...(sfx !== undefined && { sfx: sfx as unknown as Json }),
    }).eq("episode_id", episodeId).eq("cut_id_key", cutIdKey),
  ]);

  return NextResponse.json({ ok: true });
}

/** 단일 컷 내용 수정 + 재생성 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  const { episodeId } = await params;

  let ctx;
  try {
    ctx = await requireCreator(CREDIT_COST.generateCut);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    const status = err.code === "UNAUTHENTICATED" ? 401 : err.code === "NOT_APPROVED" ? 403 : 402;
    return NextResponse.json({ error: err.message }, { status });
  }

  const body = await req.json().catch(() => null);
  const { webtoonId, cutIdKey, visual_prompt, dialogue, narration, sfx, character_keys, location_key, provider = "openai" } = body ?? {};

  if (!webtoonId || !cutIdKey) {
    return NextResponse.json({ error: "webtoonId, cutIdKey 필요" }, { status: 400 });
  }

  const svc = createServiceClient();

  const { data: wt } = await svc.from("webtoons").select("author_id").eq("id", webtoonId).single();
  if (!wt || (wt as { author_id: string }).author_id !== ctx.userId) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const { data: ep } = await svc.from("episodes").select("story_json, webtoon_id").eq("id", episodeId).single();
  if (!ep || (ep as { webtoon_id: string }).webtoon_id !== webtoonId) {
    return NextResponse.json({ error: "에피소드를 찾을 수 없습니다." }, { status: 404 });
  }

  const storyJson = (ep as unknown as { story_json: StoryJson }).story_json;

  // 해당 컷이 속한 씬 탐색
  let foundCut: Cut | null = null;
  let foundScene: Scene | null = null;
  for (const scene of storyJson.scenes) {
    const cut = scene.cuts.find((c) => c.cut_id === cutIdKey);
    if (cut) { foundCut = cut; foundScene = scene; break; }
  }
  if (!foundCut || !foundScene) {
    return NextResponse.json({ error: "컷을 찾을 수 없습니다." }, { status: 404 });
  }

  // 수정된 필드로 cut 객체 구성
  const updatedCut: Cut = {
    ...foundCut,
    ...(visual_prompt !== undefined && { visual_prompt }),
    ...(dialogue !== undefined && { dialogue: dialogue as DialogueLine[] }),
    ...(narration !== undefined && { narration: narration as NarrationLine[] }),
    ...(sfx !== undefined && { sfx: sfx as SfxLine[] }),
    ...(character_keys !== undefined && { character_keys: character_keys as string[] }),
    ...(location_key !== undefined && { location_key: location_key as string }),
  };

  // story_json 업데이트
  const updatedStoryJson: StoryJson = {
    ...storyJson,
    scenes: storyJson.scenes.map((scene) => ({
      ...scene,
      cuts: scene.cuts.map((c) => (c.cut_id === cutIdKey ? updatedCut : c)),
    })),
  };

  await deductCredits(ctx.userId, CREDIT_COST.generateCut);

  try {
    // 직전 컷 이미지 조회 (씬 내 순서 기준)
    const cutIndex = foundScene.cuts.findIndex((c) => c.cut_id === cutIdKey);
    let prevCutImageUrl: string | null = null;
    if (cutIndex > 0) {
      const prevCutId = foundScene.cuts[cutIndex - 1].cut_id;
      const { data: prevCutRow } = await svc
        .from("cuts")
        .select("image_url")
        .eq("episode_id", episodeId)
        .eq("cut_id_key", prevCutId)
        .single();
      prevCutImageUrl =
        (prevCutRow as { image_url: string | null } | null)?.image_url ?? null;
    }

    const [{ data: charRows }, { data: locRows }, { data: propRows }] = await Promise.all([
      svc.from("characters").select("char_key, reference_image_url").eq("webtoon_id", webtoonId),
      svc.from("locations").select("loc_key, reference_image_url").eq("webtoon_id", webtoonId),
      svc.from("props").select("prop_key, reference_image_url").eq("webtoon_id", webtoonId),
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

    const references: ReferenceImage[] = [
      ...updatedCut.character_keys
        .filter((k) => charMap[k])
        .map((k) => ({ url: charMap[k], label: `Character reference (${k}): use this image to maintain the character's appearance` })),
      ...(locMap[updatedCut.location_key]
        ? [{ url: locMap[updatedCut.location_key], label: `Location reference (${updatedCut.location_key}): use this for background/environment consistency` }]
        : []),
      ...(updatedCut.prop_keys ?? [])
        .filter((k) => propMap[k])
        .map((k) => ({ url: propMap[k], label: `Prop reference (${k}): this object appears in the panel` })),
      ...(prevCutImageUrl
        ? [{ url: prevCutImageUrl, label: "Previous panel in the same scene: maintain visual continuity — same characters, setting, lighting, and style as this panel" }]
        : []),
    ];

    const prompt = buildCutPrompt(updatedCut, foundScene, updatedStoryJson);
    const size = panelTypeToSize(updatedCut.panel_type ?? "medium");
    const result = await generateImage({ provider: provider as "gemini" | "openai", prompt, references, usePro: references.length >= 3, size });
    const storagePath = `${webtoonId}/cuts/${episodeId}_${cutIdKey}.png`;
    const imageUrl = await uploadBase64Image(result.base64, result.mimeType, storagePath);

    // DB 동기화
    await Promise.all([
      svc.from("cuts").update({
        status: "done",
        image_url: imageUrl,
        visual_prompt: updatedCut.visual_prompt,
        dialogue: updatedCut.dialogue as unknown as Json,
        narration: updatedCut.narration as unknown as Json,
        sfx: updatedCut.sfx as unknown as Json,
      }).eq("episode_id", episodeId).eq("cut_id_key", cutIdKey),
      svc.from("episodes").update({ story_json: updatedStoryJson as unknown as Json }).eq("id", episodeId),
    ]);

    return NextResponse.json({ imageUrl });
  } catch (e) {
    await refundCredits(ctx.userId, CREDIT_COST.generateCut);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
