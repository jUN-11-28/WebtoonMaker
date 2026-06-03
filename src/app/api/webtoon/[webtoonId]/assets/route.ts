import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

/** 프로젝트의 캐릭터 + 장소 전체 조회 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ webtoonId: string }> }
) {
  const { webtoonId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { data: wt } = await svc.from("webtoons").select("author_id").eq("id", webtoonId).single();
  if (!wt || (wt as { author_id: string }).author_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [{ data: characters }, { data: locations }, { data: props }] = await Promise.all([
    svc.from("characters").select("*").eq("webtoon_id", webtoonId).order("created_at"),
    svc.from("locations").select("*").eq("webtoon_id", webtoonId).order("created_at"),
    svc.from("props").select("*").eq("webtoon_id", webtoonId).order("created_at"),
  ]);

  return NextResponse.json({
    characters: characters ?? [],
    locations: locations ?? [],
    props: props ?? [],
  });
}
