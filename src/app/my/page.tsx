import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Coins, PlusCircle, ShieldCheck, Clock, Layers, Users } from "lucide-react";

export default async function MyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role, is_approved, credits, created_at")
    .eq("id", user.id)
    .single();

  const p = profile as {
    display_name: string | null;
    role: string;
    is_approved: boolean;
    credits: number;
    created_at: string;
  } | null;

  const { data: webtoons } = await supabase
    .from("webtoons")
    .select("id, title, cover_image_url, visibility, created_at, episodes(count), characters(count)")
    .eq("author_id", user.id)
    .order("created_at", { ascending: false });

  const wList = (webtoons ?? []) as unknown as {
    id: string;
    title: string;
    cover_image_url: string | null;
    visibility: string;
    created_at: string;
    episodes: { count: number }[];
    characters: { count: number }[];
  }[];

  return (
    <div className="mx-auto max-w-screen-lg px-4 py-8 space-y-8">
      {/* 프로필 카드 */}
      <section className="rounded-xl border bg-card p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold">{p?.display_name ?? user.email}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {p?.role === "admin" && (
                <Badge variant="secondary" className="gap-1">
                  <ShieldCheck className="h-3 w-3" /> 관리자
                </Badge>
              )}
              {p?.is_approved ? (
                <Badge variant="default" className="gap-1">승인됨</Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-yellow-600 border-yellow-400">
                  <Clock className="h-3 w-3" /> 승인 대기
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-3">
            <Coins className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">보유 크레딧</p>
              <p className="text-2xl font-bold">{p?.credits ?? 0}</p>
            </div>
          </div>
        </div>
        {!p?.is_approved && (
          <div className="mt-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 text-sm text-yellow-800 dark:text-yellow-300">
            관리자 승인 후 웹툰 생성 기능이 활성화됩니다. 크레딧이 지급되면 바로 시작할 수 있습니다.
          </div>
        )}
      </section>

      {/* 내 웹툰 목록 */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">내 웹툰</h2>
          {p?.is_approved && (
            <Button size="sm" asChild>
              <Link href="/studio/new">
                <PlusCircle className="h-4 w-4 mr-1" />
                새 웹툰
              </Link>
            </Button>
          )}
        </div>

        {wList.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border bg-muted/20 py-16 text-muted-foreground">
            <BookOpen className="h-10 w-10 mb-3 opacity-30" />
            <p className="font-medium">아직 만든 웹툰이 없습니다</p>
            {p?.is_approved ? (
              <Button size="sm" variant="outline" className="mt-4" asChild>
                <Link href="/studio/new">첫 웹툰 만들기</Link>
              </Button>
            ) : (
              <p className="text-sm mt-1">관리자 승인 후 생성 가능합니다</p>
            )}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {wList.map((w) => {
              const epCount = w.episodes[0]?.count ?? 0;
              const charCount = w.characters[0]?.count ?? 0;
              return (
                <Link
                  key={w.id}
                  href={`/studio/${w.id}`}
                  className="group rounded-xl border bg-card overflow-hidden hover:shadow-md transition-all"
                >
                  <div className="aspect-[3/4] bg-muted relative overflow-hidden">
                    {w.cover_image_url ? (
                      <Image
                        src={w.cover_image_url}
                        alt={w.title}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                        className="object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <BookOpen className="h-8 w-8 text-muted-foreground opacity-30" />
                      </div>
                    )}
                    <div className="absolute top-2 right-2">
                      <Badge variant={w.visibility === "public" ? "default" : "secondary"} className="text-xs">
                        {w.visibility === "public" ? "공개" : "비공개"}
                      </Badge>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="font-medium text-sm truncate mb-1.5">{w.title}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Layers className="h-3 w-3" />{epCount}화
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />{charCount}명
                      </span>
                      <span className="ml-auto">
                        {new Date(w.created_at).toLocaleDateString("ko-KR")}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
