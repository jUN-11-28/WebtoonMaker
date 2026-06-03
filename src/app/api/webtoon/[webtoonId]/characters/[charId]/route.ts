import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { isAllowedReferenceUrl } from "@/lib/validate-url";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ webtoonId: string; charId: string }> }
) {
  const { webtoonId, charId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { data: wt } = await svc.from("webtoons").select("author_id").eq("id", webtoonId).single();
  if (!wt || (wt as { author_id: string }).author_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { name, visual_core, wardrobe, personality, expression, locked, reference_image_url } = body ?? {};

  if (reference_image_url !== undefined && !isAllowedReferenceUrl(reference_image_url)) {
    return NextResponse.json({ error: "Invalid reference_image_url" }, { status: 400 });
  }

  const update: import("@/lib/supabase/types").Database["public"]["Tables"]["characters"]["Update"] = {};
  if (name !== undefined) update.name = name;
  if (locked !== undefined) update.locked = locked;
  if (reference_image_url !== undefined) update.reference_image_url = reference_image_url;
  if (visual_core !== undefined || wardrobe !== undefined || personality !== undefined || expression !== undefined) {
    const { data: existing } = await svc.from("characters").select("bible, char_key, name").eq("id", charId).single();
    const prev = (existing as { bible: Json; char_key: string; name: string } | null);
    update.bible = {
      ...(prev?.bible as object ?? {}),
      ...(visual_core !== undefined && { visual_core }),
      ...(wardrobe !== undefined && { wardrobe }),
      ...(personality !== undefined && { personality }),
      ...(expression !== undefined && { expression }),
      ...(name !== undefined && { name }),
    } as Json;
  }

  const { data, error } = await svc.from("characters").update(update).eq("id", charId).eq("webtoon_id", webtoonId).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ character: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ webtoonId: string; charId: string }> }
) {
  const { webtoonId, charId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { data: wt } = await svc.from("webtoons").select("author_id").eq("id", webtoonId).single();
  if (!wt || (wt as { author_id: string }).author_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await svc.from("characters").delete().eq("id", charId).eq("webtoon_id", webtoonId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
