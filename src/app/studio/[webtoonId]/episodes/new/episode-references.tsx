"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ChevronRight, RefreshCw, CheckCircle, Users,
  MapPin, Package, Loader2, ImageIcon,
} from "lucide-react";
import { ImageLightbox } from "@/components/image-lightbox";
import { getErrorMessage, safeJson } from "@/lib/safe-fetch";
import type { StoryJson } from "@/lib/ai/story-schema";

interface Asset {
  id: string;
  key: string;
  name: string;
  type: "character" | "location" | "prop";
  reference_image_url: string | null;
  generating: boolean;
}

interface EpisodeReferencesProps {
  storyJson: StoryJson;
  webtoonId: string;
  episodeId: string;
  onComplete: () => void;
}

export function EpisodeReferences({
  storyJson,
  webtoonId,
  onComplete,
}: EpisodeReferencesProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingAll, setGeneratingAll] = useState(false);

  // 이 에피소드의 캐릭터/장소/소품을 로드
  useEffect(() => {
    fetch(`/api/webtoon/${webtoonId}/assets`)
      .then((r) => r.json())
      .then(({ characters = [], locations = [], props: propsList = [] }) => {
        // 이 에피소드의 storyJson에 등장하는 것만 필터링
        const epCharKeys = new Set(storyJson.character_bible?.map((c) => c.char_key) ?? []);
        const epLocKeys = new Set(storyJson.locations?.map((l) => l.loc_key) ?? []);
        const epPropKeys = new Set(storyJson.props?.map((p) => p.prop_key) ?? []);

        const list: Asset[] = [
          ...characters
            .filter((c: { char_key: string }) => epCharKeys.has(c.char_key))
            .map((c: { id: string; char_key: string; name: string; reference_image_url: string | null }) => ({
              id: c.id, key: c.char_key, name: c.name,
              type: "character" as const, reference_image_url: c.reference_image_url, generating: false,
            })),
          ...locations
            .filter((l: { loc_key: string }) => epLocKeys.has(l.loc_key))
            .map((l: { id: string; loc_key: string; name: string; reference_image_url: string | null }) => ({
              id: l.id, key: l.loc_key, name: l.name,
              type: "location" as const, reference_image_url: l.reference_image_url, generating: false,
            })),
          ...propsList
            .filter((p: { prop_key: string }) => epPropKeys.has(p.prop_key))
            .map((p: { id: string; prop_key: string; name: string; reference_image_url: string | null }) => ({
              id: p.id, key: p.prop_key, name: p.name,
              type: "prop" as const, reference_image_url: p.reference_image_url, generating: false,
            })),
        ];
        setAssets(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [webtoonId, storyJson]);

  async function generateOne(asset: Asset) {
    setAssets((prev) => prev.map((a) =>
      a.key === asset.key ? { ...a, generating: true, reference_image_url: null } : a
    ));

    try {
      const res = await fetch("/api/generate/references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webtoonId,
          episodeId: null,
          key: asset.key,
          type: asset.type,
          provider: "openai",
          storyJson: {
            style_guide: storyJson.style_guide,
            character_bible: storyJson.character_bible ?? [],
            locations: storyJson.locations ?? [],
            props: storyJson.props ?? [],
          },
        }),
      });

      if (!res.ok) throw new Error(await getErrorMessage(res, "생성 실패"));
      const data = await safeJson<{ imageUrl: string }>(res);
      if (!data?.imageUrl) throw new Error("이미지 URL을 받지 못했습니다.");

      setAssets((prev) => prev.map((a) =>
        a.key === asset.key ? { ...a, generating: false, reference_image_url: data.imageUrl } : a
      ));
      toast.success(`${asset.name} 생성 완료`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "생성 실패");
      setAssets((prev) => prev.map((a) =>
        a.key === asset.key ? { ...a, generating: false } : a
      ));
    }
  }

  async function generateAll() {
    setGeneratingAll(true);
    const missing = assets.filter((a) => !a.reference_image_url && !a.generating);
    await Promise.allSettled(missing.map((asset) => generateOne(asset)));
    setGeneratingAll(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const withImage = assets.filter((a) => a.reference_image_url).length;
  const allDone = withImage === assets.length;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold">레퍼런스 이미지 생성</h2>
          <span className="text-xs text-muted-foreground">
            {withImage}/{assets.length} 완료
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          캐릭터·장소·소품 이미지를 미리 생성하면 컷 생성 시 일관된 외형을 유지합니다.
          없어도 컷 생성은 가능합니다.
        </p>
      </div>

      {assets.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed py-10 text-center text-sm text-muted-foreground">
          이 에피소드에 등록된 에셋이 없습니다.
        </div>
      ) : (
        <>
          {/* 전체 생성 버튼 */}
          {!allDone && (
            <Button
              variant="outline"
              size="sm"
              onClick={generateAll}
              disabled={generatingAll || assets.every((a) => a.generating || !!a.reference_image_url)}
            >
              {generatingAll
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />생성 중...</>
                : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />없는 이미지 전체 생성</>
              }
            </Button>
          )}

          {/* 에셋 그리드 */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
            {assets.map((asset) => (
              <div key={asset.key} className="rounded-xl border bg-card overflow-hidden">
                <div className="aspect-square bg-muted relative overflow-hidden">
                  {asset.reference_image_url ? (
                    <ImageLightbox
                      src={asset.reference_image_url}
                      alt={asset.name}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                    />
                  ) : asset.generating ? (
                    <div className="h-full w-full bg-gradient-to-br from-muted via-primary/5 to-muted relative animate-pulse">
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent animate-[shimmer_1.4s_infinite] -translate-x-full" />
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                        <RefreshCw className="h-5 w-5 text-primary/50 animate-spin" />
                        <span className="text-xs text-muted-foreground">생성 중...</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <ImageIcon className="h-7 w-7 text-muted-foreground opacity-20" />
                    </div>
                  )}
                </div>
                <div className="p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-medium truncate">{asset.name}</p>
                    <TypeBadge type={asset.type} />
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs flex-1"
                      onClick={() => generateOne(asset)}
                      disabled={asset.generating}
                    >
                      {asset.generating
                        ? <RefreshCw className="h-3 w-3 animate-spin" />
                        : asset.reference_image_url
                        ? <><RefreshCw className="h-3 w-3 mr-1" />재생성</>
                        : <><ImageIcon className="h-3 w-3 mr-1" />생성</>
                      }
                    </Button>
                    {asset.reference_image_url && (
                      <div className="flex items-center px-1.5">
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 진행 버튼 */}
      <div className="flex justify-between items-center pt-2 border-t">
        <p className="text-xs text-muted-foreground">
          {withImage === 0
            ? "레퍼런스 없이도 컷 생성은 가능합니다"
            : `${withImage}개 이미지가 컷 생성 시 자동 적용됩니다`}
        </p>
        <Button onClick={onComplete} className="gap-1.5">
          {allDone ? "컷 생성 시작" : "건너뛰고 컷 생성"}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: "character" | "location" | "prop" }) {
  if (type === "character") return (
    <Badge variant="secondary" className="text-xs gap-0.5 py-0 shrink-0">
      <Users className="h-2.5 w-2.5" />캐
    </Badge>
  );
  if (type === "location") return (
    <Badge variant="secondary" className="text-xs gap-0.5 py-0 shrink-0">
      <MapPin className="h-2.5 w-2.5" />장
    </Badge>
  );
  return (
    <Badge variant="secondary" className="text-xs gap-0.5 py-0 shrink-0">
      <Package className="h-2.5 w-2.5" />소
    </Badge>
  );
}
