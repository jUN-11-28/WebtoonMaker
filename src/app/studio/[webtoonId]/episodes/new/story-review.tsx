"use client";

import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, ChevronRight, Check, CheckCircle, RotateCcw,
  MessageSquare, BookOpen, Zap, Eye, Camera, Users, MapPin,
  Save, CloudCheck, Loader2, Pencil, Trash2, Plus,
} from "lucide-react";
import type { StoryJson, Cut, Scene } from "@/lib/ai/story-schema";
import { toast } from "sonner";

interface StoryReviewProps {
  storyJson: StoryJson;
  episodeId: string;
  webtoonId: string;
  onComplete: (updated: StoryJson) => void;      // 검토 완료 → 이미지 생성
  onSavedBack: () => void;                        // 저장 후 대시보드로
}

type SaveState = "idle" | "saving" | "saved";

export function StoryReview({ storyJson, episodeId, webtoonId, onComplete, onSavedBack }: StoryReviewProps) {
  const [scenes, setScenes] = useState<Scene[]>(storyJson.scenes);
  const [currentSceneIdx, setCurrentSceneIdx] = useState(0);
  const [confirmedScenes, setConfirmedScenes] = useState<Set<number>>(new Set());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const allConfirmed = confirmedScenes.size === scenes.length && scenes.length > 0;
  const scene = scenes[currentSceneIdx];

  // 디바운스 자동 저장
  const scheduleSave = useCallback(
    (updatedScenes: Scene[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaveState("saving");
      saveTimer.current = setTimeout(async () => {
        try {
          const updated: StoryJson = { ...storyJson, scenes: updatedScenes };
          const res = await fetch(`/api/episodes/${episodeId}/story-json`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storyJson: updated }),
          });
          if (res.ok) setSaveState("saved");
          else setSaveState("idle");
        } catch {
          setSaveState("idle");
        }
      }, 1200);
    },
    [episodeId, storyJson]
  );

  function updateScene(idx: number, patch: Partial<Scene>) {
    setScenes((prev) => {
      const next = prev.map((sc, i) => i === idx ? { ...sc, ...patch } : sc);
      scheduleSave(next);
      return next;
    });
  }

  function updateCut(sceneIdx: number, cutIdx: number, patch: Partial<Cut>) {
    setScenes((prev) => {
      const next = prev.map((sc, si) =>
        si !== sceneIdx ? sc : {
          ...sc,
          cuts: sc.cuts.map((c, ci) => ci !== cutIdx ? c : { ...c, ...patch }),
        }
      );
      scheduleSave(next);
      return next;
    });
  }

  function confirmScene() {
    setConfirmedScenes((prev) => new Set([...prev, currentSceneIdx]));
    if (currentSceneIdx < scenes.length - 1) {
      setCurrentSceneIdx((i) => i + 1);
    }
    topRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function deleteScene(idx: number) {
    if (scenes.length <= 1) { toast.error("마지막 씬은 삭제할 수 없습니다."); return; }
    setScenes((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      scheduleSave(next);
      return next;
    });
    setConfirmedScenes((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => { if (i < idx) next.add(i); else if (i > idx) next.add(i - 1); });
      return next;
    });
    setCurrentSceneIdx((i) => Math.min(i, scenes.length - 2));
  }

  function addScene() {
    const newSceneId = `S${String(scenes.length + 1).padStart(2, "0")}`;
    const newScene: Scene = {
      scene_id: newSceneId,
      location_key: "",
      description: "",
      cuts: [{
        cut_id: `${newSceneId}_C01`,
        panel_type: "medium",
        visual_prompt: "",
        camera: "",
        emotion: "",
        character_keys: [],
        location_key: "",
        prop_keys: [],
        dialogue: [],
        narration: [],
        sfx: [],
      }],
    };
    setScenes((prev) => {
      const next = [...prev, newScene];
      scheduleSave(next);
      return next;
    });
    setCurrentSceneIdx(scenes.length);
    setTimeout(() => topRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  function unconfirmScene(idx: number) {
    setConfirmedScenes((prev) => { const s = new Set(prev); s.delete(idx); return s; });
  }

  async function saveAndBack() {
    setSaveState("saving");
    try {
      const updated: StoryJson = { ...storyJson, scenes };
      const res = await fetch(`/api/episodes/${episodeId}/story-json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyJson: updated }),
      });
      if (!res.ok) throw new Error();
      setSaveState("saved");
      toast.success("저장되었습니다.");
      onSavedBack();
    } catch {
      toast.error("저장 실패. 다시 시도해 주세요.");
      setSaveState("idle");
    }
  }

  async function handleComplete() {
    setSaveState("saving");
    try {
      const updated: StoryJson = { ...storyJson, scenes };
      const res = await fetch(`/api/episodes/${episodeId}/story-json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyJson: updated }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setSaveState("saved");
      onComplete(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장 실패");
      setSaveState("idle");
    }
  }

  const totalCuts = scenes.reduce((s, sc) => s + sc.cuts.length, 0);

  return (
    <div className="space-y-4" ref={topRef}>
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-semibold">씬·컷 검토</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {scenes.length}씬 · {totalCuts}컷 · 확인 {confirmedScenes.size}/{scenes.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* 저장 상태 */}
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {saveState === "saving" && <><Loader2 className="h-3 w-3 animate-spin" />저장 중</>}
            {saveState === "saved" && <><CloudCheck className="h-3 w-3 text-green-500" />저장됨</>}
          </span>
          <Button variant="outline" size="sm" onClick={saveAndBack} disabled={saveState === "saving"}>
            <Save className="h-3.5 w-3.5 mr-1" />저장 후 나가기
          </Button>
        </div>
      </div>

      {/* 씬 탭 */}
      <div className="flex gap-1.5 flex-wrap items-center">
        {scenes.map((sc, i) => (
          <div key={sc.scene_id} className="flex items-center gap-0.5 group">
            <button
              onClick={() => setCurrentSceneIdx(i)}
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition-all",
                i === currentSceneIdx
                  ? "bg-primary text-primary-foreground border-primary"
                  : confirmedScenes.has(i)
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700"
                  : "border-border text-muted-foreground hover:bg-muted/50"
              )}
            >
              {confirmedScenes.has(i) && <Check className="h-3 w-3" />}
              {sc.scene_id}
              <span className="opacity-60">({sc.cuts.length})</span>
            </button>
            <button
              onClick={() => deleteScene(i)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5 rounded"
              title="씬 삭제"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          onClick={addScene}
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border border-dashed border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all"
          title="씬 추가"
        >
          <Plus className="h-3 w-3" />씬 추가
        </button>
      </div>

      {/* 현재 씬 */}
      {scene && (
        <div className="rounded-xl border bg-card overflow-hidden">
          {/* 씬 헤더 */}
          <div className="border-b bg-muted/30 px-5 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">{scene.scene_id}</Badge>
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-sm font-medium">{scene.location_key}</span>
              </div>
              {confirmedScenes.has(currentSceneIdx) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => unconfirmScene(currentSceneIdx)}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />수정
                </Button>
              )}
            </div>
            {/* 씬 설명 (편집 가능) */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">씬 설명 (편집 가능)</Label>
              <Textarea
                value={scene.description ?? ""}
                onChange={(e) => updateScene(currentSceneIdx, { description: e.target.value })}
                placeholder="이 씬의 전체적인 분위기, 조명, 감정 흐름, 카메라 무드 등을 자세히 기술하세요. AI 이미지 생성 시 참고됩니다."
                rows={2}
                className="text-sm resize-none bg-background/60"
                disabled={confirmedScenes.has(currentSceneIdx)}
              />
            </div>
          </div>

          {/* 컷 목록 */}
          <div className="divide-y">
            {scene.cuts.map((cut, cutIdx) => (
              <CutCard
                key={cut.cut_id}
                cut={cut}
                locked={confirmedScenes.has(currentSceneIdx)}
                onChange={(patch) => updateCut(currentSceneIdx, cutIdx, patch)}
              />
            ))}
          </div>

          {/* 씬 하단 */}
          <div className="border-t bg-muted/20 px-5 py-3 flex items-center justify-between">
            <Button variant="ghost" size="sm"
              onClick={() => setCurrentSceneIdx((i) => Math.max(0, i - 1))}
              disabled={currentSceneIdx === 0}>
              <ChevronLeft className="h-4 w-4 mr-1" />이전
            </Button>
            {confirmedScenes.has(currentSceneIdx) ? (
              <Badge variant="default" className="gap-1 text-xs">
                <CheckCircle className="h-3 w-3" />확인됨
              </Badge>
            ) : (
              <Button size="sm" onClick={confirmScene} className="gap-1.5">
                <Check className="h-3.5 w-3.5" />이 씬 확인
              </Button>
            )}
            <Button variant="ghost" size="sm"
              onClick={() => setCurrentSceneIdx((i) => Math.min(scenes.length - 1, i + 1))}
              disabled={currentSceneIdx === scenes.length - 1}>
              다음<ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* 전체 완료 */}
      <div className="flex items-center justify-between pt-2">
        <span className="text-xs text-muted-foreground">
          {!allConfirmed ? `미확인 ${scenes.length - confirmedScenes.size}씬 남음` : "모든 씬 확인 완료 ✓"}
        </span>
        <Button onClick={handleComplete} disabled={!allConfirmed || saveState === "saving"} className="gap-1.5">
          {saveState === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          캐릭터·장소 등록 후 이미지 생성
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CutCard                                                              */
/* ------------------------------------------------------------------ */

const PANEL_COLORS: Record<string, string> = {
  splash: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  wide: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  medium: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  close: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  insert: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

function CutCard({ cut, locked, onChange }: {
  cut: Cut;
  locked: boolean;
  onChange: (patch: Partial<Cut>) => void;
}) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [editPrompt, setEditPrompt] = useState(false);

  return (
    <div className={cn("px-5 py-4 space-y-3 transition-colors", locked && "opacity-70")}>
      {/* 헤더 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono text-xs font-bold text-primary">{cut.cut_id}</span>
        {cut.panel_type && (
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", PANEL_COLORS[cut.panel_type] ?? "bg-muted text-muted-foreground")}>
            {cut.panel_type}
          </span>
        )}
        {cut.emotion && <span className="text-xs text-muted-foreground">· {cut.emotion}</span>}
        {cut.character_keys?.length > 0 && (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3 w-3" />{cut.character_keys.join(", ")}
          </span>
        )}
      </div>

      {/* 카메라 */}
      {cut.camera && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Camera className="h-3 w-3" />{cut.camera}
        </div>
      )}

      {/* 비주얼 프롬프트 */}
      <div className="space-y-1">
        <button onClick={() => setShowPrompt((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
          <Eye className="h-3 w-3" />이미지 프롬프트 {showPrompt ? "▲" : "▼"}
        </button>
        {showPrompt && (
          <div className="space-y-1.5">
            {editPrompt && !locked ? (
              <Textarea
                value={cut.visual_prompt ?? ""}
                onChange={(e) => onChange({ visual_prompt: e.target.value })}
                rows={3}
                className="text-xs font-mono bg-muted/50 resize-none"
              />
            ) : (
              <p className="text-xs bg-muted/50 rounded-lg p-2.5 font-mono leading-relaxed text-muted-foreground">
                {cut.visual_prompt}
              </p>
            )}
            {!locked && (
              <button onClick={() => setEditPrompt((v) => !v)}
                className="text-xs text-primary flex items-center gap-1 hover:underline">
                <Pencil className="h-3 w-3" />{editPrompt ? "완료" : "프롬프트 편집"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 내레이션 */}
      {(cut.narration?.length ?? 0) > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium flex items-center gap-1 text-muted-foreground">
            <BookOpen className="h-3 w-3" />내레이션
          </p>
          {(cut.narration ?? []).map((n, i) => (
            <Textarea
              key={i}
              value={n.text}
              onChange={(e) => {
                const narration = [...(cut.narration ?? [])];
                narration[i] = { text: e.target.value };
                onChange({ narration });
              }}
              rows={2}
              className="text-sm bg-background/60 italic resize-none"
              placeholder="내레이션..."
              disabled={locked}
            />
          ))}
        </div>
      )}

      {/* 대사 */}
      {(cut.dialogue?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium flex items-center gap-1 text-muted-foreground">
            <MessageSquare className="h-3 w-3" />대사
          </p>
          {(cut.dialogue ?? []).map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs font-semibold text-primary shrink-0 w-16 truncate">{d.character}</span>
              <Input
                value={d.text}
                onChange={(e) => {
                  const dialogue = [...(cut.dialogue ?? [])];
                  dialogue[i] = { ...dialogue[i], text: e.target.value };
                  onChange({ dialogue });
                }}
                className="text-sm h-8 bg-background/60 flex-1"
                placeholder="대사..."
                disabled={locked}
              />
            </div>
          ))}
        </div>
      )}

      {/* SFX */}
      {(cut.sfx?.length ?? 0) > 0 && (
        <div className="flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-yellow-500" />
          <span className="text-xs text-muted-foreground">{(cut.sfx ?? []).map((s) => s.text).join(" / ")}</span>
        </div>
      )}
    </div>
  );
}

