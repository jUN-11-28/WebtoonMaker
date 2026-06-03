import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const BUCKET = "webtoon-images";

/**
 * POST /api/episodes/{episodeId}/cuts/recover
 *
 * Storage에 이미지가 있지만 DB에 image_url이 없는 컷을 탐지하고
 * image_url + status=done 으로 복구한다.
 *
 * Body: { webtoonId: string }
 * Response: { recovered: number; details: { cutId: string; url: string }[] }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  const { episodeId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { webtoonId } = body ?? {};
  if (!webtoonId) return NextResponse.json({ error: "webtoonId 필요" }, { status: 400 });

  const svc = createServiceClient();

  // 소유권 확인
  const { data: wt } = await svc
    .from("webtoons")
    .select("author_id")
    .eq("id", webtoonId)
    .single();
  if (!wt || (wt as { author_id: string }).author_id !== user.id) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  // 이 에피소드의 모든 컷 조회
  const { data: cutRows } = await svc
    .from("cuts")
    .select("cut_id_key, status, image_url")
    .eq("episode_id", episodeId);

  const cutMap = new Map<string, { status: string; image_url: string | null }>();
  for (const c of (cutRows ?? []) as { cut_id_key: string; status: string; image_url: string | null }[]) {
    cutMap.set(c.cut_id_key, { status: c.status, image_url: c.image_url });
  }

  // Storage에서 해당 경로의 파일 목록 조회
  const prefix = `${webtoonId}/cuts/`;
  const { data: storageFiles, error: listError } = await svc.storage
    .from(BUCKET)
    .list(`${webtoonId}/cuts`, { limit: 1000 });

  if (listError) {
    return NextResponse.json({ error: `Storage 조회 실패: ${listError.message}` }, { status: 500 });
  }

  const recovered: { cutId: string; url: string }[] = [];

  for (const file of storageFiles ?? []) {
    const filename = file.name; // e.g. "{episodeId}_{cut_id}.png" or ".webp"

    // 이 에피소드에 속하는 파일인지 확인
    const episodePrefix = `${episodeId}_`;
    if (!filename.startsWith(episodePrefix)) continue;

    // cut_id 추출 (확장자 제거)
    const withoutExt = filename.replace(/\.(png|jpg|jpeg|gif|webp)$/i, "");
    const cutIdKey = withoutExt.slice(episodePrefix.length);
    if (!cutIdKey) continue;

    // DB에 없거나 image_url이 없는 경우만 복구
    const existing = cutMap.get(cutIdKey);
    if (existing?.image_url) continue; // 이미 연결됨

    // 공개 URL 생성
    const storagePath = `${prefix}${filename}`;
    const { data: urlData } = svc.storage.from(BUCKET).getPublicUrl(storagePath);
    const imageUrl = urlData.publicUrl;

    if (existing) {
      // cuts 레코드는 있지만 image_url이 없는 경우 → 복구
      await svc
        .from("cuts")
        .update({ status: "done", image_url: imageUrl })
        .eq("episode_id", episodeId)
        .eq("cut_id_key", cutIdKey);
    } else {
      // cuts 레코드 자체가 없는 경우 → 삽입 (order_index는 0으로 임시 설정)
      await svc.from("cuts").insert({
        episode_id: episodeId,
        cut_id_key: cutIdKey,
        order_index: 0,
        status: "done",
        image_url: imageUrl,
      });
    }

    recovered.push({ cutId: cutIdKey, url: imageUrl });
  }

  return NextResponse.json({ recovered: recovered.length, details: recovered });
}
