import { redirect, notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { SetupClient } from "./setup-client";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function SetupPage({
  params,
}: { params: Promise<{ webtoonId: string }> }) {
  const { webtoonId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();
  // style 컬럼은 마이그레이션 004 이후 존재 — 없어도 동작하도록 분리 조회
  const { data: wt, error: wtError } = await svc
    .from("webtoons")
    .select("id, title, author_id, description")
    .eq("id", webtoonId)
    .single();

  if (wtError || !wt || (wt as { author_id: string }).author_id !== user.id) notFound();

  // style 컬럼은 마이그레이션 적용 후에만 존재 (없으면 null로 폴백)
  let projectStyle: string | null = null;
  try {
    const { data: styleRow } = await svc
      .from("webtoons")
      .select("style")
      .eq("id", webtoonId)
      .single();
    projectStyle = (styleRow as { style?: string | null } | null)?.style ?? null;
  } catch { /* 마이그레이션 전이면 무시 */ }

  const w = {
    ...(wt as { id: string; title: string; author_id: string; description: string | null }),
    style: projectStyle,
  };

  const [{ data: chars }, { data: locs }, { data: propsData }] = await Promise.all([
    svc.from("characters").select("*").eq("webtoon_id", webtoonId).order("created_at"),
    svc.from("locations").select("*").eq("webtoon_id", webtoonId).order("created_at"),
    svc.from("props").select("*").eq("webtoon_id", webtoonId).order("created_at"),
  ]);

  return (
    <div className="mx-auto max-w-screen-lg px-4 py-8">
      <div className="flex items-center gap-3 mb-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/studio/${webtoonId}`}>
            <ChevronLeft className="h-4 w-4 mr-1" />대시보드
          </Link>
        </Button>
      </div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{w.title}</h1>
        {w.style && (
          <p className="text-sm text-muted-foreground mt-0.5">화풍: {w.style}</p>
        )}
        <p className="text-sm text-muted-foreground mt-1">
          캐릭터와 장소를 구축하세요. 레퍼런스 이미지를 생성·잠금 후 화(話) 생성이 가능합니다.
        </p>
      </div>
      <SetupClient
        webtoonId={webtoonId}
        projectStyle={w.style ?? ""}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialCharacters={(chars ?? []) as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialLocations={(locs ?? []) as any}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        initialProps={(propsData ?? []) as any}
      />
    </div>
  );
}
