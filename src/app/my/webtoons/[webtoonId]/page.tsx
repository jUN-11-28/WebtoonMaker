import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PublishSettings } from "./publish-settings";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function WebtoonManagePage({
  params,
}: {
  params: Promise<{ webtoonId: string }>;
}) {
  const { webtoonId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: webtoon } = await supabase
    .from("webtoons")
    .select("id, title, description, cover_image_url, visibility, author_id")
    .eq("id", webtoonId)
    .eq("author_id", user.id)
    .single();

  if (!webtoon) notFound();

  const w = webtoon as {
    id: string;
    title: string;
    description: string | null;
    cover_image_url: string | null;
    visibility: string;
    author_id: string;
  };

  const { data: episodes } = await supabase
    .from("episodes")
    .select("id, episode_number, title, status")
    .eq("webtoon_id", webtoonId)
    .order("episode_number");

  return (
    <div className="mx-auto max-w-screen-md px-4 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/my">
            <ChevronLeft className="h-4 w-4 mr-1" />
            마이페이지
          </Link>
        </Button>
        <h1 className="text-xl font-bold truncate">{w.title}</h1>
      </div>

      <PublishSettings
        webtoon={w}
        episodes={(episodes ?? []) as {
          id: string;
          episode_number: number;
          title: string;
          status: string;
        }[]}
      />
    </div>
  );
}
