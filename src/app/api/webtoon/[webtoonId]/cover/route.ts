import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { uploadBase64Image } from "@/lib/ai/storage";

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
  const { base64, mimeType } = body ?? {};
  if (!base64 || !mimeType) {
    return NextResponse.json({ error: "base64, mimeType 필요" }, { status: 400 });
  }

  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const storagePath = `${webtoonId}/cover.${ext}`;

  try {
    const imageUrl = await uploadBase64Image(base64, mimeType, storagePath);
    await svc.from("webtoons").update({ cover_image_url: imageUrl }).eq("id", webtoonId);
    return NextResponse.json({ imageUrl });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
