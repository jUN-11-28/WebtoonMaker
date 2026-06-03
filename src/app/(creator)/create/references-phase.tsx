"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ImageIcon, RefreshCw, Lock, Unlock } from "lucide-react";
import type { StoryJson } from "@/lib/ai/story-schema";
import { CREDIT_COST } from "@/lib/credits";
import Image from "next/image";

interface ReferencesPhaseProps {
  storyJson: StoryJson;
  webtoonId: string;
  episodeId: string;
  onComplete: () => void;
  onBack: () => void;
}

interface ReferenceItem {
  key: string;
  name: string;
  type: "character" | "location";
  imageUrl: string | null;
  locked: boolean;
  generating: boolean;
}

export function ReferencesPhase({
  storyJson,
  webtoonId,
  episodeId,
  onComplete,
  onBack,
}: ReferencesPhaseProps) {
  const [items, setItems] = useState<ReferenceItem[]>(() => [
    ...storyJson.character_bible.map((c) => ({
      key: c.char_key,
      name: c.name,
      type: "character" as const,
      imageUrl: null,
      locked: false,
      generating: false,
    })),
    ...(storyJson.locations ?? []).map((l) => ({
      key: l.loc_key,
      name: l.name,
      type: "location" as const,
      imageUrl: null,
      locked: false,
      generating: false,
    })),
  ]);

  const allLocked = items.length > 0 && items.every((i) => i.locked);
  const totalCost = items.filter((i) => !i.locked).length * CREDIT_COST.generateReference;

  function setItemState(key: string, patch: Partial<ReferenceItem>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }

  async function generateOne(item: ReferenceItem) {
    setItemState(item.key, { generating: true });
    try {
      const res = await fetch("/api/generate/references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webtoonId,
          episodeId,
          key: item.key,
          type: item.type,
          storyJson,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "생성 실패");
      }
      const { imageUrl } = await res.json();
      setItemState(item.key, { imageUrl, generating: false });
      toast.success(`${item.name} 레퍼런스 생성 완료`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "생성 실패");
      setItemState(item.key, { generating: false });
    }
  }

  async function generateAll() {
    const ungenerated = items.filter((i) => !i.imageUrl && !i.locked);
    for (const item of ungenerated) {
      await generateOne(item);
    }
  }

  function toggleLock(key: string) {
    setItems((prev) =>
      prev.map((i) => (i.key === key && i.imageUrl ? { ...i, locked: !i.locked } : i))
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="font-medium mb-1">레퍼런스 이미지 생성</p>
        <p className="text-muted-foreground">
          캐릭터 외형과 배경을 이미지로 고정합니다. 컷 생성 시 이 이미지가 입력으로 첨부되어
          캐릭터 일관성을 유지합니다.
        </p>
        <p className="mt-1 text-muted-foreground">
          총 <strong className="text-foreground">{items.length}개</strong> · 예상{" "}
          <strong className="text-foreground">{totalCost} 크레딧</strong>
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={generateAll}>
          <ImageIcon className="h-4 w-4 mr-1" />
          전체 생성
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.key} className="rounded-lg border overflow-hidden">
            <div className="aspect-square bg-muted relative">
              {item.imageUrl ? (
                <Image src={item.imageUrl} alt={item.name} fill className="object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-muted-foreground opacity-30" />
                </div>
              )}
              {item.locked && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <Lock className="h-6 w-6 text-white" />
                </div>
              )}
            </div>
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  <Badge variant="secondary" className="text-xs mt-0.5">
                    {item.type === "character" ? "캐릭터" : "배경"}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-xs"
                  disabled={item.generating || item.locked}
                  onClick={() => generateOne(item)}
                >
                  {item.generating ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3 mr-1" />
                  )}
                  {item.imageUrl ? "재생성" : "생성"}
                </Button>
                <Button
                  size="sm"
                  variant={item.locked ? "default" : "outline"}
                  className="text-xs"
                  disabled={!item.imageUrl}
                  onClick={() => toggleLock(item.key)}
                  title={item.locked ? "잠금 해제" : "잠금"}
                >
                  {item.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-1" />뒤로
        </Button>
        <Button onClick={onComplete} disabled={!allLocked}>
          {allLocked ? "컷 생성으로" : "모두 잠금 후 진행 가능"}
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
