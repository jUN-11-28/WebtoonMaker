import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ episodeId: string }> }
) {
  const { episodeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();

  // 에피소드 존재 및 소유권 확인
  const { data: ep } = await svc.from("episodes").select("webtoon_id, status").eq("id", episodeId).single();
  if (!ep) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: wt } = await svc.from("webtoons").select("author_id").eq("id", (ep as { webtoon_id: string }).webtoon_id).single();
  if (!wt || (wt as { author_id: string }).author_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 강제 발행: 상태를 ready로 설정
  const { error } = await svc.from("episodes").update({ status: "ready" }).eq("id", episodeId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ status: "ready" });
}
