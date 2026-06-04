import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  // select("*") works whether or not the `metadata` column exists yet (migration 007)
  const { data: job } = await svc
    .from("generation_jobs")
    .select("*")
    .eq("id", jobId)
    .single();

  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const j = job as unknown as {
    id: string;
    episode_id: string;
    kind: string;
    status: string;
    progress: number;
    error: string | null;
    metadata?: Record<string, unknown> | null;
  };

  // 소유권 확인
  const { data: ep } = await svc.from("episodes").select("webtoon_id").eq("id", j.episode_id).single();
  const { data: wt } = await svc.from("webtoons").select("author_id").eq("id", (ep as { webtoon_id: string })?.webtoon_id).single();
  if (!wt || (wt as { author_id: string }).author_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // kind별 추가 데이터
  if (j.kind === "cuts") {
    const { data: cuts } = await svc
      .from("cuts")
      .select("cut_id_key, status, image_url, panel_type, character_keys, location_key")
      .eq("episode_id", j.episode_id)
      .order("order_index");

    const cutStatuses = (cuts ?? []).map((c) => {
      const cut = c as {
        cut_id_key: string; status: string; image_url: string | null;
        panel_type: string | null; character_keys: string[] | null; location_key: string | null;
      };
      return {
        cutId: cut.cut_id_key,
        label: cut.cut_id_key,
        status: cut.status,
        imageUrl: cut.image_url,
        panelType: cut.panel_type ?? undefined,
        characterKeys: cut.character_keys ?? [],
        locationKey: cut.location_key ?? "",
      };
    });

    return NextResponse.json({ ...j, cutStatuses });
  }

  if (j.kind === "json" && j.status === "done") {
    const { data: epData } = await svc.from("episodes").select("story_json").eq("id", j.episode_id).single();
    return NextResponse.json({ ...j, storyJson: (epData as { story_json: unknown } | null)?.story_json ?? null });
  }

  if (j.kind === "references") {
    const imageUrl = (j.metadata as { imageUrl?: string } | null)?.imageUrl ?? null;
    return NextResponse.json({ ...j, imageUrl });
  }

  return NextResponse.json(j);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (body?.action !== "cancel") {
    return NextResponse.json({ error: "action은 'cancel'만 지원합니다." }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: job } = await svc
    .from("generation_jobs")
    .select("id, episode_id, status")
    .eq("id", jobId)
    .single();

  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const j = job as { id: string; episode_id: string; status: string };

  const { data: ep } = await svc.from("episodes").select("webtoon_id").eq("id", j.episode_id).single();
  const { data: wt } = await svc.from("webtoons").select("author_id").eq("id", (ep as { webtoon_id: string })?.webtoon_id).single();
  if (!wt || (wt as { author_id: string }).author_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (j.status !== "running") {
    return NextResponse.json({ error: "실행 중인 작업이 아닙니다." }, { status: 400 });
  }

  await svc.from("generation_jobs").update({ status: "cancelled" }).eq("id", jobId);

  await svc
    .from("cuts")
    .update({ status: "failed" })
    .eq("episode_id", j.episode_id)
    .eq("status", "generating");

  return NextResponse.json({ ok: true });
}
