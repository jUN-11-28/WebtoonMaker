import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ webtoonId: string }> }
) {
  const { webtoonId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const { title, description, visibility, cover_image_url, brief, style } = body ?? {};

  // 허용된 값만 업데이트
  if (visibility && !["public", "private"].includes(visibility)) {
    return NextResponse.json({ error: "invalid visibility" }, { status: 400 });
  }
  if (title !== undefined && (typeof title !== "string" || title.trim().length === 0)) {
    return NextResponse.json({ error: "제목이 필요합니다." }, { status: 400 });
  }

  const svc = createServiceClient();

  // 소유권 확인 — 서버에서만
  const { data: wt } = await svc
    .from("webtoons")
    .select("author_id")
    .eq("id", webtoonId)
    .single();

  if (!wt || (wt as { author_id: string }).author_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updateData: Record<string, unknown> = {};
  if (title !== undefined) updateData.title = title.trim();
  if (description !== undefined) updateData.description = description || null;
  if (visibility !== undefined) updateData.visibility = visibility;
  if (cover_image_url !== undefined) updateData.cover_image_url = cover_image_url;
  if (brief !== undefined) updateData.brief = brief || null;
  if (style !== undefined) updateData.style = style || null;

  const { error } = await svc
    .from("webtoons")
    .update(updateData as import("@/lib/supabase/types").Database["public"]["Tables"]["webtoons"]["Update"])
    .eq("id", webtoonId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
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

  const { error } = await svc.from("webtoons").delete().eq("id", webtoonId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
