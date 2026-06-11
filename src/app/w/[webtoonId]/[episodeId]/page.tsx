import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LikeButton } from "@/components/like-button";
import { CommentSection } from "@/components/comment-section";

export default async function EpisodePage({
  params,
}: {
  params: Promise<{ webtoonId: string; episodeId: string }>;
}) {
  const { webtoonId, episodeId } = await params;
  const supabase = await createClient();

  // 독립 쿼리 병렬 실행 — 순차 대기 시 왕복 7회가 직렬화됨
  const [
    viewer,
    { data: episode },
    { data: webtoon },
    { data: cutsRaw },
    { data: siblingsRaw },
    { count: likeCount },
  ] = await Promise.all([
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return { user: null, displayName: null };
      const { data } = await supabase
        .from("profiles").select("display_name").eq("id", user.id).single();
      return {
        user,
        displayName: (data as { display_name: string | null } | null)?.display_name ?? null,
      };
    }),
    // 에피소드 조회
    supabase
      .from("episodes")
      .select("id, episode_number, title, status, webtoon_id")
      .eq("id", episodeId)
      .eq("webtoon_id", webtoonId)
      .single(),
    // 웹툰 visibility 체크
    supabase
      .from("webtoons")
      .select("title, visibility")
      .eq("id", webtoonId)
      .single(),
    // 컷 조회 (순서대로, done 상태만)
    supabase
      .from("cuts")
      .select("id, order_index, image_url, cut_id_key")
      .eq("episode_id", episodeId)
      .eq("status", "done")
      .order("order_index", { ascending: true }),
    // 이전/다음 에피소드
    supabase
      .from("episodes")
      .select("id, episode_number")
      .eq("webtoon_id", webtoonId)
      .eq("status", "ready")
      .order("episode_number", { ascending: true }),
    supabase
      .from("likes")
      .select("*", { count: "exact", head: true })
      .eq("target_type", "episode")
      .eq("target_id", episodeId),
  ]);

  const { user, displayName } = viewer;

  const ep = episode as {
    id: string;
    episode_number: number;
    title: string;
    status: string;
    webtoon_id: string;
  } | null;

  if (!ep || ep.status !== "ready") notFound();

  const wt = webtoon as { title: string; visibility: string } | null;
  if (!wt || wt.visibility !== "public") notFound();

  const cuts = (cutsRaw ?? []) as {
    id: string;
    order_index: number;
    image_url: string | null;
    cut_id_key: string;
  }[];

  const siblings = (siblingsRaw ?? []) as { id: string; episode_number: number }[];
  const currentIdx = siblings.findIndex((s) => s.id === episodeId);
  const prev = currentIdx > 0 ? siblings[currentIdx - 1] : null;
  const next = currentIdx < siblings.length - 1 ? siblings[currentIdx + 1] : null;

  return (
    <div className="flex flex-col items-center">
      {/* 상단 네비게이션 */}
      <div className="w-full max-w-2xl px-4 py-3 flex items-center justify-between border-b">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/w/${webtoonId}`}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            {wt.title}
          </Link>
        </Button>
        <span className="text-sm font-medium text-muted-foreground">
          {ep.episode_number}화 · {ep.title}
        </span>
      </div>

      {/* 컷 세로 스크롤 */}
      <div className="w-full max-w-2xl">
        {cuts.length === 0 ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <p>이미지를 준비 중입니다.</p>
          </div>
        ) : (
          cuts.map((cut, idx) => (
            <div key={cut.id} className="w-full">
              {cut.image_url ? (
                <div className="relative w-full">
                  <Image
                    src={cut.image_url}
                    alt=""
                    width={800}
                    height={1200}
                    className="w-full h-auto"
                    sizes="(max-width: 672px) 100vw, 672px"
                    priority={idx === 0}
                  />
                </div>
              ) : (
                <div className="w-full aspect-[2/3] bg-muted" />
              )}
            </div>
          ))
        )}
      </div>

      {/* 하단: 좋아요 + 이전/다음 */}
      <div className="w-full max-w-2xl px-4 py-6 border-t flex flex-col items-center gap-4">
        <LikeButton targetType="episode" targetId={episodeId} initialCount={likeCount ?? 0} />
        <div className="flex w-full items-center justify-between">
          {prev ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/w/${webtoonId}/${prev.id}`}>
                <ChevronLeft className="h-4 w-4 mr-1" />{prev.episode_number}화
              </Link>
            </Button>
          ) : <div />}
          {next ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/w/${webtoonId}/${next.id}`}>
                {next.episode_number}화<ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          ) : <div />}
        </div>
      </div>

      {/* 댓글 */}
      <div className="w-full max-w-2xl px-4 pb-12">
        <CommentSection targetType="episode" targetId={episodeId} authorId={user?.id} displayName={displayName} />
      </div>
    </div>
  );
}
