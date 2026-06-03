import { redirect, notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { EpisodeCreator } from "./episode-creator";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

export default async function NewEpisodePage({
  params,
}: { params: Promise<{ webtoonId: string }> }) {
  const { webtoonId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_approved, credits")
    .eq("id", user.id)
    .single();

  const p = profile as { is_approved: boolean; credits: number } | null;
  if (!p?.is_approved) redirect("/studio");

  const svc = createServiceClient();

  // 프로젝트 + 기획안 로드
  const { data: wt } = await svc
    .from("webtoons")
    .select("id, title, author_id, brief, description")
    .eq("id", webtoonId)
    .single();

  if (!wt || (wt as { author_id: string }).author_id !== user.id) notFound();

  // brief는 마이그레이션 005 이후 존재 — 없으면 null
  const projectBrief = (wt as { brief?: string | null }).brief ?? null;

  // 캐릭터 로드 (잠금 여부 포함) — 잠금 의무 없음
  const { data: chars } = await svc
    .from("characters")
    .select("id, char_key, name, bible, locked, reference_image_url")
    .eq("webtoon_id", webtoonId);

  const charList = (chars ?? []) as {
    id: string; char_key: string; name: string;
    bible: Record<string, string> | null;
    locked: boolean; reference_image_url: string | null;
  }[];

  // 다음 에피소드 번호
  const { count } = await svc
    .from("episodes")
    .select("*", { count: "exact", head: true })
    .eq("webtoon_id", webtoonId);

  const nextEpNumber = (count ?? 0) + 1;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/studio/${webtoonId}`}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            {(wt as { title: string }).title}
          </Link>
        </Button>
        <span className="text-muted-foreground">·</span>
        <span className="text-sm font-medium">{nextEpNumber}화 추가</span>
      </div>

      <EpisodeCreator
        webtoonId={webtoonId}
        episodeNumber={nextEpNumber}
        credits={p.credits}
        characters={charList}
        projectBrief={projectBrief}
      />
    </div>
  );
}
