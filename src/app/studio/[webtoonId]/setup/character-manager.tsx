"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, RefreshCw, Pencil, Trash2, ImageIcon } from "lucide-react";
import { getErrorMessage, safeJson } from "@/lib/safe-fetch";
import { ImageLightbox } from "@/components/image-lightbox";

interface Character {
  id: string; char_key: string; name: string;
  bible: Record<string, string> | null;
  reference_image_url: string | null; locked: boolean;
}

interface CharacterManagerProps {
  webtoonId: string;
  projectStyle: string;
  characters: Character[];
  onChange: (chars: Character[]) => void;
}

const EMPTY_FORM = { char_key: "", name: "", visual_core: "", wardrobe: "", personality: "", expression: "" };

export function CharacterManager({ webtoonId, projectStyle, characters, onChange }: CharacterManagerProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Character | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [pending, startTransition] = useTransition();
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());

  function openNew() { setEditing(null); setForm(EMPTY_FORM); setOpen(true); }
  function openEdit(c: Character) {
    setEditing(c);
    setForm({
      char_key: c.char_key,
      name: c.name,
      visual_core: c.bible?.visual_core ?? "",
      wardrobe: c.bible?.wardrobe ?? "",
      personality: c.bible?.personality ?? "",
      expression: c.bible?.expression ?? "",
    });
    setOpen(true);
  }

  function handleSave() {
    if (!form.char_key || !form.name || !form.visual_core) {
      toast.error("키·이름·외형 설명은 필수입니다.");
      return;
    }
    startTransition(async () => {
      try {
        if (editing) {
          const res = await fetch(`/api/webtoon/${webtoonId}/characters/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          });
          if (!res.ok) throw new Error((await res.json()).error);
          const { character } = await res.json();
          onChange(characters.map((c) => c.id === editing.id ? { ...c, ...character, bible: form } : c));
        } else {
          const res = await fetch(`/api/webtoon/${webtoonId}/characters`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          });
          if (!res.ok) throw new Error((await res.json()).error);
          const { character } = await res.json();
          onChange([...characters, { ...character, bible: form }]);
        }
        toast.success(editing ? "수정되었습니다." : "캐릭터가 추가되었습니다.");
        setOpen(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "오류");
      }
    });
  }

  async function generateRef(char: Character) {
    // 생성 중 목록에 추가 + 이전 이미지 즉시 제거 (shimmer 표시)
    setGeneratingIds((s) => new Set([...s, char.id]));
    onChange(characters.map((c) => c.id === char.id ? { ...c, reference_image_url: null } : c));

    try {
      const artStyle = projectStyle || "webtoon style, clean lines, expressive characters";
      const res = await fetch("/api/generate/references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webtoonId,
          episodeId: null,
          key: char.char_key,
          type: "character",
          provider: "openai",
          storyJson: {
            style_guide: {
              art_style: artStyle,
              color_palette: "vibrant, high contrast",
              global_negative_prompt: "blurry, low quality, deformed, extra limbs, watermark, text",
            },
            character_bible: [{ ...(char.bible ?? {}), char_key: char.char_key, name: char.name }],
            locations: [],
          },
        }),
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, "이미지 생성 실패"));
      const data = await safeJson<{ imageUrl: string }>(res);
      if (!data?.imageUrl) throw new Error("이미지 URL을 받지 못했습니다.");
      onChange(characters.map((c) => c.id === char.id ? { ...c, reference_image_url: data.imageUrl } : c));
      toast.success(`${char.name} 레퍼런스 생성 완료`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setGeneratingIds((s) => { const n = new Set(s); n.delete(char.id); return n; });
    }
  }


  async function deleteChar(char: Character) {
    if (!confirm(`"${char.name}"을 삭제할까요?`)) return;
    const res = await fetch(`/api/webtoon/${webtoonId}/characters/${char.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("삭제 실패"); return; }
    onChange(characters.filter((c) => c.id !== char.id));
    toast.success("삭제되었습니다.");
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          캐릭터를 추가하고 레퍼런스 이미지를 생성한 뒤 잠금하세요.
        </p>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" />캐릭터 추가
        </Button>
      </div>

      {characters.length === 0 && (
        <div className="rounded-lg border-2 border-dashed py-12 text-center text-muted-foreground text-sm">
          아직 캐릭터가 없습니다. 직접 추가하거나 "AI 추출" 탭을 이용하세요.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {characters.map((char) => (
          <div key={char.id} className={`rounded-xl border bg-card overflow-hidden ${char.locked ? "ring-2 ring-primary/30" : ""}`}>
            <div className="aspect-square bg-muted relative overflow-hidden">
              {char.reference_image_url ? (
                <ImageLightbox
                  src={char.reference_image_url} alt={char.name} fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                />
              ) : generatingIds.has(char.id) ? (
                /* 생성 중 shimmer */
                <div className="h-full w-full bg-gradient-to-br from-muted via-primary/5 to-muted relative animate-pulse">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent animate-[shimmer_1.4s_infinite] -translate-x-full" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="h-6 w-6 text-primary/50 animate-spin" />
                    <span className="text-xs text-muted-foreground">생성 중...</span>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-muted-foreground opacity-30" />
                </div>
              )}
            </div>
            <div className="p-3 space-y-2">
              <div>
                <p className="font-semibold text-sm">{char.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{char.char_key}</p>
                {char.bible?.visual_core && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{char.bible.visual_core}</p>
                )}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-7 text-xs flex-1"
                  onClick={() => generateRef(char)}
                  disabled={generatingIds.has(char.id)}>
                  {generatingIds.has(char.id)
                    ? <RefreshCw className="h-3 w-3 animate-spin" />
                    : <RefreshCw className="h-3 w-3 mr-1" />}
                  {char.reference_image_url ? "재생성" : "생성"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs"
                  onClick={() => openEdit(char)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={() => deleteChar(char)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 추가/수정 다이얼로그 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{editing ? "캐릭터 수정" : "캐릭터 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">이름 *</Label>
                <Input placeholder="예: 이준혁" value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({
                      ...f, name,
                      char_key: f.char_key || name.toLowerCase().replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_"),
                    }));
                  }} disabled={pending} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">키 (영문) *</Label>
                <Input placeholder="lee_junhyuk" value={form.char_key}
                  onChange={(e) => setForm((f) => ({ ...f, char_key: e.target.value }))}
                  disabled={pending || !!editing} className="font-mono text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">외형 설명 (영문) *</Label>
              <Textarea placeholder="young man, late 20s, short black hair, sharp dark eyes, tall athletic build"
                value={form.visual_core}
                onChange={(e) => setForm((f) => ({ ...f, visual_core: e.target.value }))}
                rows={2} disabled={pending} className="text-sm" />
              <p className="text-xs text-muted-foreground">이미지 생성에 직접 사용됩니다. 영문으로 구체적으로.</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">의상</Label>
              <Input placeholder="예: 회색 정장, 흰 셔츠" value={form.wardrobe}
                onChange={(e) => setForm((f) => ({ ...f, wardrobe: e.target.value }))} disabled={pending} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">성격</Label>
                <Input placeholder="냉정하고 계산적" value={form.personality}
                  onChange={(e) => setForm((f) => ({ ...f, personality: e.target.value }))} disabled={pending} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">대표 표정</Label>
                <Input placeholder="무표정, 가끔 미소" value={form.expression}
                  onChange={(e) => setForm((f) => ({ ...f, expression: e.target.value }))} disabled={pending} />
              </div>
            </div>
            <Button onClick={handleSave} disabled={pending} className="w-full">
              {pending ? "저장 중..." : "저장"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
