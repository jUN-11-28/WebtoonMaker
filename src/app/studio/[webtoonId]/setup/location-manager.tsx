"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, RefreshCw, Pencil, Trash2, MapPin } from "lucide-react";
import { getErrorMessage, safeJson } from "@/lib/safe-fetch";
import { ImageLightbox } from "@/components/image-lightbox";

interface Location {
  id: string; loc_key: string; name: string;
  reference_image_url: string | null; locked: boolean;
}

interface LocationManagerProps {
  webtoonId: string;
  projectStyle: string;
  locations: Location[];
  onChange: (locs: Location[]) => void;
}

const EMPTY = { loc_key: "", name: "", description: "" };

export function LocationManager({ webtoonId, projectStyle, locations, onChange }: LocationManagerProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [pending, startTransition] = useTransition();
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());

  function openNew() { setEditing(null); setForm(EMPTY); setOpen(true); }
  function openEdit(l: Location) {
    setEditing(l);
    setForm({ loc_key: l.loc_key, name: l.name, description: "" });
    setOpen(true);
  }

  function handleSave() {
    if (!form.loc_key || !form.name) { toast.error("키·이름 필수"); return; }
    startTransition(async () => {
      try {
        if (editing) {
          const res = await fetch(`/api/webtoon/${webtoonId}/locations/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: form.name }),
          });
          if (!res.ok) throw new Error((await res.json()).error);
          onChange(locations.map((l) => l.id === editing.id ? { ...l, name: form.name } : l));
        } else {
          const res = await fetch(`/api/webtoon/${webtoonId}/locations`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          });
          if (!res.ok) throw new Error((await res.json()).error);
          const { location } = await res.json();
          onChange([...locations, location]);
        }
        toast.success(editing ? "수정됨" : "추가됨");
        setOpen(false);
      } catch (e) { toast.error(e instanceof Error ? e.message : "오류"); }
    });
  }

  async function generateRef(loc: Location) {
    setGeneratingIds((s) => new Set([...s, loc.id]));
    onChange(locations.map((l) => l.id === loc.id ? { ...l, reference_image_url: null } : l));
    try {
      const artStyle = projectStyle || "webtoon style, clean lines, detailed backgrounds";
      const res = await fetch("/api/generate/references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webtoonId, episodeId: null,
          key: loc.loc_key, type: "location",
          provider: "openai",
          storyJson: {
            style_guide: {
              art_style: artStyle,
              color_palette: "atmospheric, cinematic",
              global_negative_prompt: "blurry, low quality, deformed, watermark, text, people",
            },
            character_bible: [],
            locations: [{ loc_key: loc.loc_key, name: loc.name, description: "" }],
          },
        }),
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, "이미지 생성 실패"));
      const data = await safeJson<{ imageUrl: string }>(res);
      if (!data?.imageUrl) throw new Error("이미지 URL을 받지 못했습니다.");
      onChange(locations.map((l) => l.id === loc.id ? { ...l, reference_image_url: data.imageUrl } : l));
      toast.success("장소 레퍼런스 생성 완료");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "생성 실패");
    } finally { setGeneratingIds((s) => { const n = new Set(s); n.delete(loc.id); return n; }); }
  }


  async function deleteLoc(loc: Location) {
    if (!confirm(`"${loc.name}"을 삭제할까요?`)) return;
    const res = await fetch(`/api/webtoon/${webtoonId}/locations/${loc.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("삭제 실패"); return; }
    onChange(locations.filter((l) => l.id !== loc.id));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">장소별 배경 레퍼런스를 생성하세요. 장소는 선택사항입니다.</p>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" />장소 추가
        </Button>
      </div>

      {locations.length === 0 && (
        <div className="rounded-lg border-2 border-dashed py-12 text-center text-muted-foreground text-sm">
          장소가 없으면 배경 레퍼런스 없이 생성됩니다.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {locations.map((loc) => (
          <div key={loc.id} className={`rounded-xl border bg-card overflow-hidden ${loc.locked ? "ring-2 ring-primary/30" : ""}`}>
            <div className="aspect-video bg-muted relative overflow-hidden">
              {loc.reference_image_url ? (
                <ImageLightbox
                  src={loc.reference_image_url} alt={loc.name} fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                />
              ) : generatingIds.has(loc.id) ? (
                <div className="h-full w-full bg-gradient-to-br from-muted via-primary/5 to-muted relative animate-pulse">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent animate-[shimmer_1.4s_infinite] -translate-x-full" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="h-6 w-6 text-primary/50 animate-spin" />
                    <span className="text-xs text-muted-foreground">생성 중...</span>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <MapPin className="h-8 w-8 text-muted-foreground opacity-30" />
                </div>
              )}
            </div>
            <div className="p-3 space-y-2">
              <div>
                <p className="font-semibold text-sm">{loc.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{loc.loc_key}</p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-7 text-xs flex-1"
                  onClick={() => generateRef(loc)} disabled={generatingIds.has(loc.id)}>
                  {generatingIds.has(loc.id)
                    ? <RefreshCw className="h-3 w-3 animate-spin" />
                    : <RefreshCw className="h-3 w-3 mr-1" />}
                  {loc.reference_image_url ? "재생성" : "생성"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs"
                  onClick={() => openEdit(loc)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={() => deleteLoc(loc)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editing ? "장소 수정" : "장소 추가"}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">장소명 *</Label>
                <Input placeholder="병원 옥상" value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({ ...f, name, loc_key: f.loc_key || name.toLowerCase().replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_") }));
                  }} disabled={pending} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">키 (영문) *</Label>
                <Input placeholder="hospital_rooftop" value={form.loc_key}
                  onChange={(e) => setForm((f) => ({ ...f, loc_key: e.target.value }))}
                  disabled={pending || !!editing} className="font-mono text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">설명 (선택)</Label>
              <Input placeholder="낡은 병원 건물 옥상, 밤, 도시 야경" value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} disabled={pending} />
            </div>
            <Button onClick={handleSave} disabled={pending} className="w-full">저장</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
