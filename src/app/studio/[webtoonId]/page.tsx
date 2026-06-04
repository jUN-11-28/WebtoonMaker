import { redirect, notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PlusCircle, Settings2, BookOpen, ImageIcon, Users, MapPin, ExternalLink } from "lucide-react";
import { DeleteProjectButton } from "./delete-project-button";
import { BriefEditor } from "./brief-editor";
import { EpisodeList } from "./episode-list";

export default async function ProjectDashboard({
  params,
}: { params: Promise<{ webtoonId: string }> }) {
  const { webtoonId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();
  const { data: wt } = await svc
    .from("webtoons")
    .select("id, title, description, visibility, author_id, brief")
    .eq("id", webtoonId)
    .single();

  if (!wt || (wt as { author_id: string }).author_id !== user.id) notFound();
  const project = wt as {
    id: string; title: string; description: string | null;
    visibility: string; author_id: string; brief?: string | null;
  };

  const [{ data: episodes }, { data: chars }, { data: locs }] = await Promise.all([
    svc.from("episodes").select("id, episode_number, title, status, created_at")
      .eq("webtoon_id", webtoonId).order("episode_number"),
    svc.from("characters").select("id, name, locked, reference_image_url").eq("webtoon_id", webtoonId),
    svc.from("locations").select("id, name, locked, reference_image_url").eq("webtoon_id", webtoonId),
  ]);

  const epList = (episodes ?? []) as { id: string; episode_number: number; title: string; status: string; created_at: string }[];
  const charList = (chars ?? []) as { id: string; name: string; locked: boolean; reference_image_url: string | null }[];
  const locList = (locs ?? []) as { id: string; name: string; locked: boolean; reference_image_url: string | null }[];

  const canAddEpisode = true;

  return (
    <div className="mx-auto max-w-screen-lg px-4 py-8 space-y-8">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/my" className="hover:underline">마이페이지</Link>
            <span>/</span>
            <span>{project.title}</span>
          </div>
          <h1 className="text-2xl font-bold">{project.title}</h1>
          {project.description && <p className="text-sm text-muted-foreground mt-1">{project.description}</p>}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/studio/${webtoonId}/setup`}>
              <Settings2 className="h-4 w-4 mr-1" />캐릭터·장소 설정
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/my/webtoons/${webtoonId}`}>
              <ExternalLink className="h-4 w-4 mr-1" />발행 설정
            </Link>
          </Button>
          <DeleteProjectButton webtoonId={webtoonId} webtoonTitle={project.title} />
        </div>
      </div>

      {/* 캐릭터/장소 현황 */}
      <section className="rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" />프로젝트 에셋
          </h2>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/studio/${webtoonId}/setup`}>편집</Link>
          </Button>
        </div>

        {charList.length === 0 ? (
          <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 text-sm text-yellow-800 dark:text-yellow-300">
            ⚠️ 캐릭터를 먼저 추가하고 레퍼런스 이미지를 잠금해야 화 생성이 가능합니다.
            <Link href={`/studio/${webtoonId}/setup`} className="underline ml-1">설정하러 가기 →</Link>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <Users className="h-3 w-3" />캐릭터 ({charList.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {charList.map((c) => (
                  <div key={c.id} className="flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs">
                    <ImageIcon className={`h-3 w-3 ${c.reference_image_url ? "text-green-500" : "text-muted-foreground opacity-40"}`} />
                    <span>{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
            {locList.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />장소 ({locList.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {locList.map((l) => (
                    <div key={l.id} className="flex items-center gap-1.5 rounded-full border bg-muted/40 px-2.5 py-1 text-xs">
                      <ImageIcon className={`h-3 w-3 ${l.reference_image_url ? "text-green-500" : "text-muted-foreground opacity-40"}`} />
                      <span>{l.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 기획안 */}
      <BriefEditor webtoonId={webtoonId} initialBrief={project.brief ?? ""} />

      <Separator />

      {/* 에피소드 목록 */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold flex items-center gap-2">
            <BookOpen className="h-4 w-4" />화 목록 ({epList.length}화)
          </h2>
          <Button size="sm" asChild disabled={!canAddEpisode}>
            <Link href={canAddEpisode ? `/studio/${webtoonId}/episodes/new` : "#"}>
              <PlusCircle className="h-4 w-4 mr-1" />
              새 화 추가
            </Link>
          </Button>
        </div>

        <EpisodeList episodes={epList} webtoonId={webtoonId} />
      </section>
    </div>
  );
}
