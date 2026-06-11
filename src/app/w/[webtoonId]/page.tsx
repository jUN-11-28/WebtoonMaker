import { createClient, createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LikeButton } from "@/components/like-button";

export default async function WebtoonPage({
  params,
}: {
  params: Promise<{ webtoonId: string }>;
}) {
  const { webtoonId } = await params;
  const supabase = await createClient();

  // 독립 쿼리 병렬 실행
  const [{ data: webtoon }, { data: episodes }, { count: likeCount }] = await Promise.all([
    supabase
      .from("webtoons")
      .select("id, title, description, cover_image_url, visibility, author_id")
      .eq("id", webtoonId)
      .single(),
    supabase
      .from("episodes")
      .select("id, episode_number, title, status, created_at")
      .eq("webtoon_id", webtoonId)
      .eq("status", "ready")
      .order("episode_number", { ascending: true }),
    supabase
      .from("likes")
      .select("*", { count: "exact", head: true })
      .eq("target_type", "webtoon")
      .eq("target_id", webtoonId),
  ]);

  if (!webtoon || (webtoon as { visibility: string }).visibility !== "public") {
    notFound();
  }

  const w = webtoon as {
    id: string;
    title: string;
    description: string | null;
    cover_image_url: string | null;
    visibility: string;
    author_id: string;
  };

  // 작가 이름 — profiles RLS가 본인만 허용하므로 service client로 조회
  const serviceClient = createServiceClient();
  const { data: authorProfile } = await serviceClient
    .from("profiles")
    .select("display_name")
    .eq("id", w.author_id)
    .single();

  const authorName = (authorProfile as { display_name: string | null } | null)
    ?.display_name ?? "알 수 없음";

  return (
    <div className="mx-auto max-w-screen-md px-4 py-8">
      {/* 커버 + 메타 */}
      <div className="flex gap-6 mb-8">
        <div className="shrink-0 w-28 sm:w-36 aspect-[3/4] rounded-lg bg-muted overflow-hidden relative">
          {w.cover_image_url ? (
            <Image src={w.cover_image_url} alt={w.title} fill sizes="(max-width: 640px) 7rem, 9rem" className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <BookOpen className="h-8 w-8 text-muted-foreground opacity-40" />
            </div>
          )}
        </div>
        <div className="flex flex-col justify-between min-w-0">
          <div>
            <h1 className="text-xl font-bold leading-tight mb-1">{w.title}</h1>
            <p className="text-sm text-muted-foreground mb-2">{authorName}</p>
            {w.description && (
              <p className="text-sm text-muted-foreground line-clamp-3">{w.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3 mt-3">
            <LikeButton
              targetType="webtoon"
              targetId={webtoonId}
              initialCount={likeCount ?? 0}
            />
            <Badge variant="secondary">
              {episodes?.length ?? 0}화
            </Badge>
          </div>
        </div>
      </div>

      {/* 에피소드 목록 */}
      <div className="space-y-2">
        <h2 className="text-base font-semibold mb-3">에피소드 목록</h2>
        {!episodes || episodes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            아직 공개된 에피소드가 없습니다.
          </p>
        ) : (
          (episodes as {
            id: string;
            episode_number: number;
            title: string;
            status: string;
            created_at: string;
          }[]).map((ep) => (
            <Link
              key={ep.id}
              href={`/w/${webtoonId}/${ep.id}`}
              className="flex items-center justify-between rounded-lg border px-4 py-3 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-mono text-muted-foreground w-8 text-center">
                  {ep.episode_number}화
                </span>
                <span className="text-sm font-medium">{ep.title}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(ep.created_at).toLocaleDateString("ko-KR")}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
