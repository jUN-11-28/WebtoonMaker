import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

async function assertOwner(webtoonId: string, userId: string) {
  const svc = createServiceClient();
  const { data: wt } = await svc.from("webtoons").select("author_id").eq("id", webtoonId).single();
  if (!wt || (wt as { author_id: string }).author_id !== userId) return null;
  return svc;
}

/** 캐릭터 추가 또는 업데이트 (char_key 기준 upsert) */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ webtoonId: string }> }
) {
  const { webtoonId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = await assertOwner(webtoonId, user.id);
  if (!svc) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const { char_key, name, visual_core, wardrobe, personality, expression } = body ?? {};

  if (!char_key || !name || !visual_core) {
    return NextResponse.json({ error: "char_key, name, visual_core 필수" }, { status: 400 });
  }

  const bible: Json = { char_key, name, visual_core, wardrobe, personality, expression };

  const { data, error } = await svc
    .from("characters")
    .upsert(
      { webtoon_id: webtoonId, char_key, name, bible, locked: false },
      { onConflict: "webtoon_id,char_key" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ character: data });
}
