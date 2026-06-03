import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function DELETE(
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
    .select("author_id, id")
    .eq("id", (ep as { webtoon_id: string }).webtoon_id)
    .single();
  if (!wt || (wt as { author_id: string }).author_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const webtoonId = (wt as { id: string }).id;

  // 컷 이미지 스토리지 파일 삭제 (best-effort)
  const { data: cuts } = await svc
    .from("cuts")
    .select("cut_id_key")
    .eq("episode_id", episodeId);

  if (cuts && cuts.length > 0) {
    // .png(구), .webp(신) 둘 다 시도 — 없는 파일은 무시됨
    const paths = (cuts as { cut_id_key: string }[]).flatMap((c) => [
      `${webtoonId}/cuts/${episodeId}_${c.cut_id_key}.png`,
      `${webtoonId}/cuts/${episodeId}_${c.cut_id_key}.webp`,
    ]);
    await svc.storage.from("webtoon-images").remove(paths).catch(() => {});
  }

  // DB 삭제 (cuts, generation_jobs는 ON DELETE CASCADE로 자동 삭제 기대,
  //  없는 경우 명시적으로 삭제)
  await svc.from("generation_jobs").delete().eq("episode_id", episodeId);
  await svc.from("cuts").delete().eq("episode_id", episodeId);

  const { error } = await svc.from("episodes").delete().eq("id", episodeId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
