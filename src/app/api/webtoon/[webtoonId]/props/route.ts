import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(
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

  const body = await req.json().catch(() => null);
  const { prop_key, name, description, visual_core } = body ?? {};
  if (!prop_key || !name) return NextResponse.json({ error: "prop_key, name 필수" }, { status: 400 });

  const { data, error } = await svc
    .from("props")
    .upsert(
      { webtoon_id: webtoonId, prop_key, name, description: description ?? null, visual_core: visual_core ?? null, locked: false },
      { onConflict: "webtoon_id,prop_key" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ prop: data });
}
