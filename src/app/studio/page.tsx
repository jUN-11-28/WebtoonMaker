import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, BookOpen, Users, MapPin, Layers } from "lucide-react";

export default async function StudioPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_approved, credits")
    .eq("id", user.id)
    .single();

  const p = profile as { is_approved: boolean; credits: number } | null;

  const { data: webtoons } = await supabase
    .from("webtoons")
    .select("id, title, cover_image_url, visibility, created_at")
    .eq("author_id", user.id)
    .order("created_at", { ascending: false });

  const projects = (webtoons ?? []) as {
    id: string; title: string; cover_image_url: string | null;
    visibility: string; created_at: string;
  }[];

  // 각 프로젝트의 에피소드 수 + 캐릭터 수 조회
  const stats = await Promise.all(
    projects.map(async (w) => {
      const [{ count: epCount }, { count: charCount }] = await Promise.all([
        supabase.from("episodes").select("*", { count: "exact", head: true }).eq("webtoon_id", w.id),
        supabase.from("characters").select("*", { count: "exact", head: true }).eq("webtoon_id", w.id),
      ]);
      return { id: w.id, epCount: epCount ?? 0, charCount: charCount ?? 0 };
    })
  );
  const statsMap = Object.fromEntries(stats.map((s) => [s.id, s]));

  return (
    <div className="mx-auto max-w-screen-lg px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">스튜디오</h1>
          <p className="text-sm text-muted-foreground mt-1">내 웹툰 프로젝트를 관리합니다</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            크레딧 <strong className="text-foreground">{p?.credits ?? 0}</strong>
          </span>
          {p?.is_approved ? (
            <Button asChild>
              <Link href="/studio/new">
                <PlusCircle className="h-4 w-4 mr-2" />새 프로젝트
              </Link>
            </Button>
          ) : (
            <Badge variant="outline" className="text-yellow-600 border-yellow-400">승인 대기 중</Badge>
          )}
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-20 text-muted-foreground">
          <BookOpen className="h-12 w-12 mb-4 opacity-20" />
          <p className="text-lg font-medium mb-1">아직 프로젝트가 없습니다</p>
          <p className="text-sm mb-6">소설을 웹툰으로 만들어 보세요</p>
          {p?.is_approved && (
            <Button asChild>
              <Link href="/studio/new">첫 프로젝트 시작하기</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((w) => {
            const s = statsMap[w.id];
            return (
              <Link
                key={w.id}
                href={`/studio/${w.id}`}
                className="group rounded-xl border bg-card overflow-hidden hover:shadow-md transition-all"
              >
                <div className="aspect-video bg-muted relative overflow-hidden">
                  {w.cover_image_url ? (
                    <Image src={w.cover_image_url} alt={w.title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <BookOpen className="h-10 w-10 text-muted-foreground opacity-20" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2">
                    <Badge variant={w.visibility === "public" ? "default" : "secondary"} className="text-xs">
                      {w.visibility === "public" ? "공개" : "비공개"}
                    </Badge>
                  </div>
                </div>
                <div className="p-4">
                  <h2 className="font-semibold truncate mb-2">{w.title}</h2>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Layers className="h-3 w-3" />{s?.epCount ?? 0}화
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />{s?.charCount ?? 0}명
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
    </div>
  );
}
