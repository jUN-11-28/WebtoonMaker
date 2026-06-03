import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isAllowedReferenceUrl } from "@/lib/validate-url";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ webtoonId: string; locId: string }> }
) {
  const { webtoonId, locId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { data: wt } = await svc.from("webtoons").select("author_id").eq("id", webtoonId).single();
  if (!wt || (wt as { author_id: string }).author_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);

  if (body?.reference_image_url !== undefined && !isAllowedReferenceUrl(body.reference_image_url)) {
    return NextResponse.json({ error: "Invalid reference_image_url" }, { status: 400 });
  }

  const update: import("@/lib/supabase/types").Database["public"]["Tables"]["locations"]["Update"] = {};
  if (body?.name !== undefined) update.name = body.name;
  if (body?.locked !== undefined) update.locked = body.locked;
  if (body?.reference_image_url !== undefined) update.reference_image_url = body.reference_image_url;

  const { data, error } = await svc.from("locations").update(update).eq("id", locId).eq("webtoon_id", webtoonId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ location: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ webtoonId: string; locId: string }> }
) {
  const { webtoonId, locId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { data: wt } = await svc.from("webtoons").select("author_id").eq("id", webtoonId).single();
  if (!wt || (wt as { author_id: string }).author_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await svc.from("locations").delete().eq("id", locId).eq("webtoon_id", webtoonId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
