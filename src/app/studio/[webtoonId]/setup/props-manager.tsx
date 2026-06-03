"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, RefreshCw, Pencil, Trash2, Package } from "lucide-react";
import { getErrorMessage, safeJson } from "@/lib/safe-fetch";
import { ImageLightbox } from "@/components/image-lightbox";

interface Prop {
  id: string; prop_key: string; name: string;
  description: string | null; visual_core: string | null;
  reference_image_url: string | null; locked: boolean;
}

interface PropsManagerProps {
  webtoonId: string;
  projectStyle: string;
  props: Prop[];
  onChange: (props: Prop[]) => void;
}

export function PropsManager({ webtoonId, projectStyle, props, onChange }: PropsManagerProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Prop | null>(null);
  const [form, setForm] = useState({ prop_key: "", name: "", description: "", visual_core: "" });
  const [pending, startTransition] = useTransition();
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());

  function openNew() {
    setEditing(null);
    setForm({ prop_key: "", name: "", description: "", visual_core: "" });
    setOpen(true);
  }
  function openEdit(p: Prop) {
    setEditing(p);
    setForm({ prop_key: p.prop_key, name: p.name, description: p.description ?? "", visual_core: p.visual_core ?? "" });
    setOpen(true);
  }

  function handleSave() {
    if (!form.prop_key || !form.name) { toast.error("키·이름 필수"); return; }
    startTransition(async () => {
      try {
        if (editing) {
          const res = await fetch(`/api/webtoon/${webtoonId}/props/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          });
          if (!res.ok) throw new Error((await res.json()).error);
          onChange(props.map((p) => p.id === editing.id ? { ...p, ...form } : p));
        } else {
          const res = await fetch(`/api/webtoon/${webtoonId}/props`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          });
          if (!res.ok) throw new Error((await res.json()).error);
          const { prop } = await res.json();
          onChange([...props, prop]);
        }
        toast.success(editing ? "수정됨" : "추가됨");
        setOpen(false);
      } catch (e) { toast.error(e instanceof Error ? e.message : "오류"); }
    });
  }

  async function generateRef(prop: Prop) {
    setGeneratingIds((s) => new Set([...s, prop.id]));
    onChange(props.map((p) => p.id === prop.id ? { ...p, reference_image_url: null } : p));
    try {
      const artStyle = projectStyle || "webtoon style";
      const res = await fetch("/api/generate/references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webtoonId, episodeId: null,
          key: prop.prop_key, type: "prop",
          provider: "openai",
          storyJson: {
            style_guide: {
              art_style: artStyle,
              color_palette: "vibrant",
              global_negative_prompt: "blurry, low quality, deformed, watermark",
            },
            character_bible: [],
            locations: [],
            props: [{ prop_key: prop.prop_key, name: prop.name, description: prop.description ?? "", visual_core: prop.visual_core ?? prop.name }],
          },
        }),
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, "이미지 생성 실패"));
      const data = await safeJson<{ imageUrl: string }>(res);
      if (!data?.imageUrl) throw new Error("이미지 URL을 받지 못했습니다.");
      onChange(props.map((p) => p.id === prop.id ? { ...p, reference_image_url: data.imageUrl } : p));
      toast.success("소품 이미지 생성 완료");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "생성 실패");
    } finally { setGeneratingIds((s) => { const n = new Set(s); n.delete(prop.id); return n; }); }
  }


  async function deleteProp(prop: Prop) {
    if (!confirm(`"${prop.name}"을 삭제할까요?`)) return;
    const res = await fetch(`/api/webtoon/${webtoonId}/props/${prop.id}`, { method: "DELETE" });
    if (!res.ok) { toast.error("삭제 실패"); return; }
    onChange(props.filter((p) => p.id !== prop.id));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          중요 소품의 레퍼런스를 생성하면 컷 생성 시 일관된 외형을 유지합니다.
          <br />
          <span className="text-xs">에피소드 생성 시 AI가 자동으로 소품을 추출합니다.</span>
        </p>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" />소품 추가
        </Button>
      </div>

      {props.length === 0 && (
        <div className="rounded-lg border-2 border-dashed py-12 text-center text-muted-foreground text-sm">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-20" />
          소품이 없습니다. 에피소드 생성 후 AI가 자동으로 추출하거나 직접 추가하세요.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {props.map((prop) => (
          <div key={prop.id} className={`rounded-xl border bg-card overflow-hidden ${prop.locked ? "ring-2 ring-primary/30" : ""}`}>
            <div className="aspect-square bg-muted relative overflow-hidden">
              {prop.reference_image_url ? (
                <ImageLightbox src={prop.reference_image_url} alt={prop.name} fill />
              ) : generatingIds.has(prop.id) ? (
                <div className="h-full w-full bg-gradient-to-br from-muted via-primary/5 to-muted relative animate-pulse">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent animate-[shimmer_1.4s_infinite] -translate-x-full" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <RefreshCw className="h-6 w-6 text-primary/50 animate-spin" />
                    <span className="text-xs text-muted-foreground">생성 중...</span>
                  </div>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Package className="h-8 w-8 text-muted-foreground opacity-30" />
                </div>
              )}
            </div>
            <div className="p-3 space-y-2">
              <div>
                <p className="font-semibold text-sm">{prop.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{prop.prop_key}</p>
                {prop.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{prop.description}</p>}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-7 text-xs flex-1"
                  onClick={() => generateRef(prop)} disabled={generatingIds.has(prop.id)}>
                  {generatingIds.has(prop.id) ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                  {prop.reference_image_url ? "재생성" : "생성"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs"
                  onClick={() => openEdit(prop)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={() => deleteProp(prop)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editing ? "소품 수정" : "소품 추가"}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">이름 *</Label>
                <Input placeholder="고대 검" value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({ ...f, name, prop_key: f.prop_key || name.toLowerCase().replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_") }));
                  }} disabled={pending} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">키 (영문) *</Label>
                <Input placeholder="ancient_sword" value={form.prop_key}
                  onChange={(e) => setForm((f) => ({ ...f, prop_key: e.target.value }))}
                  disabled={pending || !!editing} className="font-mono text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">설명</Label>
              <Input placeholder="1화에서 주인공이 발견한 고대 유물" value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} disabled={pending} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">외형 설명 (영문, 이미지 생성용)</Label>
              <Textarea placeholder="ancient bronze sword with ornate golden hilt, glowing blue runes along the blade"
                value={form.visual_core}
                onChange={(e) => setForm((f) => ({ ...f, visual_core: e.target.value }))}
                rows={2} disabled={pending} className="text-sm" />
            </div>
            <Button onClick={handleSave} disabled={pending} className="w-full">저장</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
