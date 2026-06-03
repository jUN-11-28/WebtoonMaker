"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Globe, Lock, ExternalLink, Upload, ImageIcon, RefreshCw, Loader2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

interface PublishSettingsProps {
  webtoon: {
    id: string;
    title: string;
    description: string | null;
    cover_image_url: string | null;
    visibility: string;
  };
  episodes: {
    id: string;
    episode_number: number;
    title: string;
    status: string;
  }[];
}

export function PublishSettings({ webtoon, episodes }: PublishSettingsProps) {
  const [title, setTitle] = useState(webtoon.title);
  const [description, setDescription] = useState(webtoon.description ?? "");
  const [isPublic, setIsPublic] = useState(webtoon.visibility === "public");
  const [coverUrl, setCoverUrl] = useState(webtoon.cover_image_url);
  const [coverUploading, setCoverUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [recoveringEpisode, setRecoveringEpisode] = useState<string | null>(null);

  async function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("파일 크기는 5MB 이하여야 합니다.");
      return;
    }
    setCoverUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]); // strip data URL prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch(`/api/webtoon/${webtoon.id}/cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64, mimeType: file.type }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "업로드 실패");
      const { imageUrl } = await res.json();
      setCoverUrl(imageUrl);
      toast.success("포스터가 업로드되었습니다.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setCoverUploading(false);
      e.target.value = "";
    }
  }

  async function recoverEpisodeImages(episodeId: string) {
    setRecoveringEpisode(episodeId);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/cuts/recover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webtoonId: webtoon.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "복구 실패");
      if (data.recovered === 0) {
        toast.info("연결할 이미지가 없습니다. (Storage에 파일이 없거나 이미 연결됨)");
      } else {
        toast.success(`${data.recovered}개 이미지 연결 복구 완료!`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "복구 실패");
    } finally {
      setRecoveringEpisode(null);
    }
  }

  function save() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/webtoon/${webtoon.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            visibility: isPublic ? "public" : "private",
          }),
        });
        if (!res.ok) {
          const d = await res.json();
          throw new Error(d.error ?? "저장 실패");
        }
        toast.success("저장되었습니다.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "오류가 발생했습니다.");
      }
    });
  }

  const readyEpisodes = episodes.filter((e) => e.status === "ready");

  return (
    <div className="space-y-6">
      {/* 포스터 */}
      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-semibold">포스터 이미지</h2>
        <div className="flex gap-5 items-start">
          <div className="relative w-32 shrink-0 aspect-[3/4] rounded-lg overflow-hidden border bg-muted flex items-center justify-center">
            {coverUrl ? (
              <Image src={coverUrl} alt="포스터" fill className="object-cover" sizes="128px" />
            ) : (
              <ImageIcon className="h-8 w-8 text-muted-foreground opacity-30" />
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              탐색 페이지에 표시되는 표지 이미지입니다. (JPG, PNG, WebP · 최대 5MB)
            </p>
            <label className={`inline-flex items-center gap-2 cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${coverUploading ? "opacity-50 pointer-events-none" : "hover:bg-muted/50"}`}>
              <Upload className="h-4 w-4" />
              {coverUploading ? "업로드 중..." : coverUrl ? "포스터 변경" : "포스터 업로드"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleCoverUpload}
                disabled={coverUploading}
              />
            </label>
          </div>
        </div>
      </section>

      {/* 기본 정보 */}
      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-semibold">기본 정보</h2>
        <div className="space-y-2">
          <Label htmlFor="wt-title">제목</Label>
          <Input
            id="wt-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={60}
            disabled={pending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wt-desc">소개</Label>
          <Textarea
            id="wt-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="독자에게 작품을 소개하세요"
            disabled={pending}
          />
        </div>
      </section>

      {/* 공개 설정 */}
      <section className="rounded-xl border bg-card p-6 space-y-4">
        <h2 className="font-semibold">공개 설정</h2>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isPublic ? (
              <Globe className="h-5 w-5 text-green-500" />
            ) : (
              <Lock className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm font-medium">{isPublic ? "공개" : "비공개"}</p>
              <p className="text-xs text-muted-foreground">
                {isPublic
                  ? "누구나 탐색 페이지에서 볼 수 있습니다"
                  : "본인만 볼 수 있습니다"}
              </p>
            </div>
          </div>
          <Switch
            checked={isPublic}
            onCheckedChange={setIsPublic}
            disabled={pending}
          />
        </div>
        {isPublic && (
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <p className="text-muted-foreground">공개 URL:</p>
            <Link
              href={`/w/${webtoon.id}`}
              className="text-primary hover:underline flex items-center gap-1 mt-0.5 text-sm"
              target="_blank"
            >
              /w/{webtoon.id}
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}
      </section>

      <Button onClick={save} disabled={pending || !title.trim()} className="w-full">
        {pending ? "저장 중..." : "저장"}
      </Button>

      <Separator />

      {/* 에피소드 목록 */}
      <section className="space-y-3">
        <h2 className="font-semibold">에피소드 ({episodes.length}개)</h2>
        {episodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 에피소드가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {episodes.map((ep) => (
              <div
                key={ep.id}
                className="flex items-center justify-between rounded-lg border px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-muted-foreground w-6">
                    {ep.episode_number}화
                  </span>
                  <span className="text-sm font-medium">{ep.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      ep.status === "ready" ? "default"
                      : ep.status === "failed" ? "destructive"
                      : "secondary"
                    }
                    className="text-xs"
                  >
                    {ep.status === "ready" ? "완료"
                      : ep.status === "generating" ? "생성 중"
                      : ep.status === "failed" ? "실패"
                      : "초안"}
                  </Badge>

                  {/* 이미지 연결 복구 */}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => recoverEpisodeImages(ep.id)}
                    disabled={recoveringEpisode === ep.id}
                    title="Storage 이미지 → DB 연결 복구"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {recoveringEpisode === ep.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <RefreshCw className="h-3 w-3" />}
                  </Button>

                  {ep.status === "ready" ? (
                    <Button size="sm" variant="ghost" asChild>
                      <Link href={`/w/${webtoon.id}/${ep.id}`} target="_blank">
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const ok = confirm("정말 이 에피소드를 강제로 발행하시겠습니까? (컷이 완료되지 않아도 공개됩니다)");
                        if (!ok) return;
                        try {
                          const res = await fetch(`/api/episodes/${ep.id}/force-publish`, { method: "POST" });
                          if (!res.ok) {
                            const d = await res.json().catch(() => ({}));
                            throw new Error(d.error ?? "발행 실패");
                          }
                          toast.success("에피소드가 발행 상태(ready)로 변경되었습니다.");
                          window.location.reload();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "오류가 발생했습니다.");
                        }
                      }}
                    >
                      강제 발행
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
