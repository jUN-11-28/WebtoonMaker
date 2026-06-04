"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ChevronRight, RefreshCw, CheckCircle, Users,
  MapPin, Package, Loader2, ImageIcon, Link2,
} from "lucide-react";
import { ImageLightbox } from "@/components/image-lightbox";
import { getErrorMessage, safeJson } from "@/lib/safe-fetch";
import type { StoryJson } from "@/lib/ai/story-schema";

const MAX_CONCURRENT = 3;

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
  episodeId,
  onComplete,
}: EpisodeReferencesProps) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [selected, setSelected] = useState<Asset | null>(null);

  useEffect(() => {
    fetch(`/api/webtoon/${webtoonId}/assets`)
      .then((r) => r.json())
      .then(({ characters = [], locations = [], props: propsList = [] }) => {
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
          episodeId,
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
      const data = await safeJson<{ jobId?: string; imageUrl?: string }>(res);

      let imageUrl: string | null = data?.imageUrl ?? null;
      if (data?.jobId) {
        const INTERVAL = 2500;
        const TIMEOUT = 3 * 60 * 1000;
        const start = Date.now();
        while (Date.now() - start < TIMEOUT) {
          await new Promise((r) => setTimeout(r, INTERVAL));
          const pollRes = await fetch(`/api/jobs/${data.jobId}`);
          if (!pollRes.ok) throw new Error("Job 상태 조회 실패");
          const job = await pollRes.json() as { status: string; error?: string; imageUrl?: string };
          if (job.status === "done") { imageUrl = job.imageUrl ?? null; break; }
          if (job.status === "failed") throw new Error(job.error ?? "생성 실패");
        }
        if (!imageUrl) {
          const assetsRes = await fetch(`/api/webtoon/${webtoonId}/assets`);
          if (assetsRes.ok) {
            const all = await assetsRes.json() as {
              characters: { char_key: string; reference_image_url: string | null }[];
              locations: { loc_key: string; reference_image_url: string | null }[];
              props: { prop_key: string; reference_image_url: string | null }[];
            };
            if (asset.type === "character") imageUrl = all.characters.find((c) => c.char_key === asset.key)?.reference_image_url ?? null;
            else if (asset.type === "location") imageUrl = all.locations.find((l) => l.loc_key === asset.key)?.reference_image_url ?? null;
            else imageUrl = all.props.find((p) => p.prop_key === asset.key)?.reference_image_url ?? null;
          }
        }
      }

      if (!imageUrl) throw new Error("이미지 URL을 받지 못했습니다.");
      setAssets((prev) => prev.map((a) =>
        a.key === asset.key ? { ...a, generating: false, reference_image_url: imageUrl } : a
      ));
      setSelected((prev) => prev?.key === asset.key ? { ...prev, generating: false, reference_image_url: imageUrl } : prev);
      toast.success(`${asset.name} 생성 완료`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "생성 실패");
      setAssets((prev) => prev.map((a) =>
        a.key === asset.key ? { ...a, generating: false } : a
      ));
      setSelected((prev) => prev?.key === asset.key ? { ...prev, generating: false } : prev);
    }
  }

  async function generateAll() {
    setGeneratingAll(true);
    const missing = assets.filter((a) => !a.reference_image_url && !a.generating);
    for (let i = 0; i < missing.length; i += MAX_CONCURRENT) {
      const batch = missing.slice(i, i + MAX_CONCURRENT);
      await Promise.allSettled(batch.map((asset) => generateOne(asset)));
    }
    setGeneratingAll(false);
  }

  function openDetail(asset: Asset) {
    setSelected(asset);
  }

  function updateAsset(key: string, patch: Partial<Asset>) {
    setAssets((prev) => prev.map((a) => a.key === key ? { ...a, ...patch } : a));
    setSelected((prev) => prev?.key === key ? { ...prev, ...patch } : prev);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const withImage = assets.filter((a) => a.reference_image_url).length;
  const allDone = withImage === assets.length && assets.length > 0;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold">레퍼런스 이미지 생성</h2>
          <span className="text-xs text-muted-foreground">{withImage}/{assets.length} 완료</span>
        </div>
        <p className="text-sm text-muted-foreground">
          캐릭터·장소·소품 이미지를 미리 생성하면 컷 생성 시 일관된 외형을 유지합니다.
          카드를 클릭하면 상세 정보를 확인하고 편집할 수 있습니다.
        </p>
      </div>

      {assets.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed py-10 text-center text-sm text-muted-foreground">
          이 에피소드에 등록된 에셋이 없습니다.
        </div>
      ) : (
        <>
          {!allDone && (
            <Button
              variant="outline"
              size="sm"
              onClick={generateAll}
              disabled={generatingAll || assets.every((a) => a.generating || !!a.reference_image_url)}
            >
              {generatingAll
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />생성 중 (최대 {MAX_CONCURRENT}개 동시)...</>
                : <><RefreshCw className="h-3.5 w-3.5 mr-1.5" />없는 이미지 전체 생성</>
              }
            </Button>
          )}

          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
            {assets.map((asset) => (
              <div
                key={asset.key}
                className="rounded-xl border bg-card overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => openDetail(asset)}
              >
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
                <div className="p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-medium truncate">{asset.name}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      {asset.reference_image_url && <CheckCircle className="h-3 w-3 text-green-500" />}
                      <TypeBadge type={asset.type} />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">클릭하여 상세보기</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

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

      {selected && (
        <AssetDetailDialog
          asset={selected}
          storyJson={storyJson}
          webtoonId={webtoonId}
          onClose={() => setSelected(null)}
          onGenerate={() => generateOne(selected)}
          onUpdate={(patch) => updateAsset(selected.key, patch)}
        />
      )}
    </div>
  );
}

// ── 상세 다이얼로그 ────────────────────────────────────────────────

interface AssetDetailDialogProps {
  asset: Asset;
  storyJson: StoryJson;
  webtoonId: string;
  onClose: () => void;
  onGenerate: () => void;
  onUpdate: (patch: Partial<Asset>) => void;
}

function AssetDetailDialog({ asset, storyJson, webtoonId, onClose, onGenerate, onUpdate }: AssetDetailDialogProps) {
  const [saving, setSaving] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [applyingUrl, setApplyingUrl] = useState(false);

  // 편집 가능한 필드
  const [name, setName] = useState(asset.name);
  const [fields, setFields] = useState<Record<string, string>>(() => getInitialFields(asset, storyJson));

  async function saveDetails() {
    setSaving(true);
    try {
      const endpoint = typeEndpoint(webtoonId, asset);
      const body: Record<string, string> = { name, ...fields };
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, "저장 실패"));
      onUpdate({ name });
      toast.success("저장되었습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function applyManualUrl() {
    if (!manualUrl.trim()) return;
    setApplyingUrl(true);
    try {
      const endpoint = typeEndpoint(webtoonId, asset);
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference_image_url: manualUrl.trim() }),
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, "URL 적용 실패"));
      onUpdate({ reference_image_url: manualUrl.trim() });
      setManualUrl("");
      toast.success("이미지가 연결되었습니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "URL 적용 실패");
    } finally {
      setApplyingUrl(false);
    }
  }

  const fieldLabels = getFieldLabels(asset.type);
  const isDirty = name !== asset.name || Object.entries(fields).some(([k, v]) => {
    const orig = getInitialFields(asset, storyJson)[k] ?? "";
    return v !== orig;
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TypeBadge type={asset.type} />
            <span className="text-base">{asset.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 mt-1">
          {/* 이미지 미리보기 */}
          <div className="rounded-lg border overflow-hidden aspect-square relative bg-muted max-w-[200px] mx-auto">
            {asset.reference_image_url ? (
              <ImageLightbox
                src={asset.reference_image_url}
                alt={asset.name}
                fill
                sizes="200px"
              />
            ) : asset.generating ? (
              <div className="h-full flex flex-col items-center justify-center gap-2">
                <RefreshCw className="h-6 w-6 text-primary/50 animate-spin" />
                <span className="text-xs text-muted-foreground">생성 중...</span>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <ImageIcon className="h-10 w-10 text-muted-foreground opacity-20" />
              </div>
            )}
          </div>

          {/* 이미지 생성 */}
          <Button
            className="w-full"
            variant={asset.reference_image_url ? "outline" : "default"}
            onClick={onGenerate}
            disabled={asset.generating}
          >
            {asset.generating
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />생성 중...</>
              : asset.reference_image_url
              ? <><RefreshCw className="h-4 w-4 mr-2" />이미지 재생성</>
              : <><ImageIcon className="h-4 w-4 mr-2" />이미지 생성</>
            }
          </Button>

          <Separator />

          {/* 수동 URL 매핑 */}
          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              기존 이미지 URL 직접 연결
            </Label>
            <p className="text-[11px] text-muted-foreground">
              이미 Storage에 업로드된 이미지가 있으면 URL을 붙여넣어 연결할 수 있습니다.
            </p>
            <div className="flex gap-2">
              <Input
                className="text-xs h-8"
                placeholder="https://...supabase.co/storage/..."
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0"
                onClick={applyManualUrl}
                disabled={!manualUrl.trim() || applyingUrl}
              >
                {applyingUrl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "적용"}
              </Button>
            </div>
          </div>

          <Separator />

          {/* 이름 및 특징 편집 */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="asset-name">이름</Label>
              <Input
                id="asset-name"
                className="text-sm h-8"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {fieldLabels.map(({ key, label }) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-xs" htmlFor={`field-${key}`}>{label}</Label>
                <Textarea
                  id={`field-${key}`}
                  className="text-sm resize-none"
                  rows={2}
                  value={fields[key] ?? ""}
                  onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
                  placeholder={`${label}을(를) 입력하세요`}
                />
              </div>
            ))}

            {(isDirty || fieldLabels.length > 0) && (
              <Button
                size="sm"
                className="w-full"
                onClick={saveDetails}
                disabled={saving || !isDirty}
              >
                {saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />저장 중...</> : "변경사항 저장"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── 헬퍼 ─────────────────────────────────────────────────────────

function typeEndpoint(webtoonId: string, asset: Asset) {
  if (asset.type === "character") return `/api/webtoon/${webtoonId}/characters/${asset.id}`;
  if (asset.type === "location") return `/api/webtoon/${webtoonId}/locations/${asset.id}`;
  return `/api/webtoon/${webtoonId}/props/${asset.id}`;
}

function getFieldLabels(type: Asset["type"]): { key: string; label: string }[] {
  if (type === "character") return [
    { key: "visual_core", label: "외모 설명" },
    { key: "wardrobe", label: "의상" },
    { key: "personality", label: "성격" },
    { key: "expression", label: "표정/감정" },
  ];
  if (type === "location") return [
    { key: "description", label: "장소 설명" },
  ];
  return [
    { key: "visual_core", label: "비주얼 설명" },
    { key: "description", label: "소품 설명" },
  ];
}

function getInitialFields(asset: Asset, storyJson: StoryJson): Record<string, string> {
  if (asset.type === "character") {
    const char = storyJson.character_bible?.find((c) => c.char_key === asset.key);
    return {
      visual_core: char?.visual_core ?? "",
      wardrobe: char?.wardrobe ?? "",
      personality: char?.personality ?? "",
      expression: char?.expression ?? "",
    };
  }
  if (asset.type === "location") {
    const loc = storyJson.locations?.find((l) => l.loc_key === asset.key);
    return { description: loc?.description ?? "" };
  }
  const prop = storyJson.props?.find((p) => p.prop_key === asset.key);
  return {
    visual_core: prop?.visual_core ?? "",
    description: prop?.description ?? "",
  };
}

function TypeBadge({ type }: { type: Asset["type"] }) {
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
