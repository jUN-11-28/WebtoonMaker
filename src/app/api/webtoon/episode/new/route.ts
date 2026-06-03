import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { webtoonId, episodeNumber, title } = body ?? {};

  if (!webtoonId || !episodeNumber || !title) {
    return NextResponse.json({ error: "webtoonId, episodeNumber, title 필수" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: wt } = await svc.from("webtoons").select("author_id").eq("id", webtoonId).single();
  if (!wt || (wt as { author_id: string }).author_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: ep, error } = await svc
    .from("episodes")
    .insert({ webtoon_id: webtoonId, episode_number: episodeNumber, title, status: "draft" })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ episodeId: (ep as { id: string }).id });
}
