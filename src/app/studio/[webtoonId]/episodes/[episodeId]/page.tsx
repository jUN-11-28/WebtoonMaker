import { redirect, notFound } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { EpisodeEditor } from "./episode-editor";
import type { Json } from "@/lib/supabase/types";
import type { StoryJson } from "@/lib/ai/story-schema";

export default async function EpisodeEditPage({
  params,
}: {
  params: Promise<{ webtoonId: string; episodeId: string }>;
}) {
  const { webtoonId, episodeId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();

  // 소유권 확인
  const { data: wt } = await svc
    .from("webtoons")
    .select("id, title, author_id, brief")
    .eq("id", webtoonId)
    .single();

  if (!wt || (wt as { author_id: string }).author_id !== user.id) notFound();

  const { data: ep } = await svc
    .from("episodes")
    .select("id, episode_number, title, status, story_json, script_source")
    .eq("id", episodeId)
    .eq("webtoon_id", webtoonId)
    .single();

  if (!ep) notFound();

  const episode = ep as {
    id: string;
    episode_number: number;
    title: string;
    status: string;
    story_json: Json | null;
    script_source: string | null;
  };

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits")
    .eq("id", user.id)
    .single();

  const credits = (profile as { credits: number } | null)?.credits ?? 0;

  // 캐릭터 목록
  const { data: chars } = await svc
    .from("characters")
    .select("id, char_key, name, bible, locked, reference_image_url")
    .eq("webtoon_id", webtoonId);

  const charList = (chars ?? []) as {
    id: string; char_key: string; name: string;
    bible: Record<string, string> | null;
    locked: boolean; reference_image_url: string | null;
  }[];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <EpisodeEditor
        webtoonId={webtoonId}
        webtoonTitle={(wt as { title: string }).title}
        episode={episode}
        credits={credits}
        characters={charList}
        projectBrief={(wt as { brief?: string | null }).brief ?? null}
      />
    </div>
  );
}
