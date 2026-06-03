import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import Image from "next/image";
import { Heart, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default async function ExplorePage() {
  const supabase = await createClient();

  const { data: webtoons } = await supabase
    .from("webtoons")
    .select("id, title, description, cover_image_url, created_at, author_id")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(48);

  const list = (webtoons ?? []) as {
    id: string;
    title: string;
    description: string | null;
    cover_image_url: string | null;
    created_at: string;
    author_id: string;
  }[];

  // 작가 이름 일괄 조회
  const authorIds = [...new Set(list.map((w) => w.author_id))];
  const { data: profileRows } = authorIds.length > 0
    ? await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", authorIds)
    : { data: [] };

  const profileMap: Record<string, string | null> = {};
  for (const p of profileRows ?? []) {
    profileMap[(p as { id: string; display_name: string | null }).id] =
      (p as { id: string; display_name: string | null }).display_name;
  }

  // 좋아요 수 일괄 조회
  const ids = list.map((w) => w.id);
  const { data: likeCounts } = ids.length > 0
    ? await supabase
        .from("likes")
        .select("target_id")
        .eq("target_type", "webtoon")
        .in("target_id", ids)
    : { data: [] };

  const likeMap: Record<string, number> = {};
  for (const row of (likeCounts ?? []) as { target_id: string }[]) {
    likeMap[row.target_id] = (likeMap[row.target_id] ?? 0) + 1;
  }

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">웹툰 탐색</h1>
        <Badge variant="secondary">{list.length}개</Badge>
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <BookOpen className="h-12 w-12 mb-4 opacity-30" />
          <p className="text-lg font-medium">아직 공개된 웹툰이 없습니다</p>
          <p className="text-sm mt-1">첫 번째 웹툰을 만들어 보세요!</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {list.map((w) => (
            <Link
              key={w.id}
              href={`/w/${w.id}`}
              className="group flex flex-col gap-2"
            >
              <div className="aspect-[3/4] w-full overflow-hidden rounded-lg bg-muted relative">
                {w.cover_image_url ? (
                  <Image
                    src={w.cover_image_url}
                    alt={w.title}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <BookOpen className="h-8 w-8 opacity-40" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-tight">{w.title}</p>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-xs text-muted-foreground truncate">
                    {profileMap[w.author_id] ?? "알 수 없음"}
                  </span>
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground shrink-0">
                    <Heart className="h-3 w-3" />
                    {likeMap[w.id] ?? 0}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
