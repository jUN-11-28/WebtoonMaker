import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_approved")
    .eq("id", user.id)
    .single();

  if (!(profile as { is_approved: boolean } | null)?.is_approved) {
    return NextResponse.json({ error: "관리자 승인이 필요합니다." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { title, description, artStyle, brief } = body ?? {};

  if (!title || typeof title !== "string") {
    return NextResponse.json({ error: "제목이 필요합니다." }, { status: 400 });
  }

  const svc = createServiceClient();

  const { data: webtoon, error: webtoonError } = await svc
    .from("webtoons")
    .insert({
      author_id: user.id,
      title: title.trim(),
      description: description ?? null,
      style: artStyle ?? null,
      brief: brief ?? null,
      visibility: "private",
    })
    .select("id")
    .single();

  if (webtoonError || !webtoon) {
    return NextResponse.json({ error: webtoonError?.message ?? "웹툰 생성 실패" }, { status: 500 });
  }

  const webtoonId = (webtoon as { id: string }).id;
  return NextResponse.json({ webtoonId });
}
