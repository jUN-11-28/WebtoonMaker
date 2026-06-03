"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Play, RefreshCw, CheckCircle, XCircle, Loader2,
  Square, Pencil, Plus, Trash2, AlertTriangle, X,
} from "lucide-react";
import type { StoryJson, DialogueLine, NarrationLine, SfxLine } from "@/lib/ai/story-schema";
import { CREDIT_COST } from "@/lib/credits";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "@/components/image-lightbox";

interface CutsPhaseProps {
  storyJson: StoryJson;
  webtoonId: string;
  episodeId: string;
}

interface CutStatus {
  cutId: string;
  label: string;
  status: "pending" | "generating" | "done" | "failed";
  imageUrl: string | null;
  characterKeys?: string[];
  locationKey?: string;
  panelType?: string;
}

const PANEL_ASPECT: Record<string, string> = {
  wide: "aspect-[16/7]",
  splash: "aspect-[3/5]",
  close: "aspect-[1/1]",
  insert: "aspect-[1/1]",
  medium: "aspect-[3/4]",
};

export function CutsPhase({ storyJson, webtoonId, episodeId }: CutsPhaseProps) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [cutStatuses, setCutStatuses] = useState<CutStatus[]>(() =>
    storyJson.scenes.flatMap((s) =>
      s.cuts.map((c) => ({
        cutId: c.cut_id,
        label: c.cut_id,
        status: "pending" as const,
        imageUrl: null,
        characterKeys: c.character_keys,
        locationKey: c.location_key,
        panelType: c.panel_type,
      }))
    )
  );
  const [polling, setPolling] = useState(false);
  const [pending, startTransition] = useTransition();
  const [initializing, setInitializing] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [editingCutId, setEditingCutId] = useState<string | null>(null);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  const [charRefMap, setCharRefMap] = useState<Record<string, { name: string; url: string | null }>>({});
  const [locRefMap, setLocRefMap] = useState<Record<string, { name: string; url: string | null }>>({});
  const [regeneratingCuts, setRegeneratingCuts] = useState<Set<string>>(new Set());
  const [deletingCuts, setDeletingCuts] = useState<Set<string>>(new Set());
  const [stuckWarning, setStuckWarning] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const lastProgressRef = useRef<{ value: number; time: number }>({ value: -1, time: Date.now() });

  // 마운트 시 기존 상태 + 에셋 참조 로드
  useEffect(() => {
    Promise.all([
      fetch(`/api/episodes/${episodeId}/cuts`).then((r) => r.json()),
      fetch(`/api/webtoon/${webtoonId}/assets`).then((r) => r.json()),
    ])
      .then(([cutsData, assetsData]) => {
        // panelType을 storyJson에서 보강
        const panelTypeMap: Record<string, string> = {};
        for (const s of storyJson.scenes) for (const c of s.cuts) panelTypeMap[c.cut_id] = c.panel_type;
        const statuses: CutStatus[] = (cutsData.cutStatuses ?? []).map((cs: CutStatus) => ({
          ...cs,
          panelType: cs.panelType ?? panelTypeMap[cs.cutId] ?? "medium",
        }));
        if (statuses.length > 0) setCutStatuses(statuses);

        // 컷이 전부 완료 상태면 job이 running으로 남아 있어도 폴링 불필요
        const allTerminal =
          statuses.length > 0 &&
          statuses.every((c) => c.status === "done" || c.status === "failed");
        if (cutsData.activeJob && !allTerminal) {
          setJobId(cutsData.activeJob.id);
          setPolling(true);
        }

        const cMap: Record<string, { name: string; url: string | null }> = {};
        for (const c of (assetsData.characters ?? []) as { char_key: string; name: string; reference_image_url: string | null }[]) {
          cMap[c.char_key] = { name: c.name, url: c.reference_image_url };
        }
        const lMap: Record<string, { name: string; url: string | null }> = {};
        for (const l of (assetsData.locations ?? []) as { loc_key: string; name: string; reference_image_url: string | null }[]) {
          lMap[l.loc_key] = { name: l.name, url: l.reference_image_url };
        }
        setCharRefMap(cMap);
        setLocRefMap(lMap);
      })
      .catch(() => {})
      .finally(() => setInitializing(false));
  }, [episodeId, webtoonId]);

  const totalCuts = cutStatuses.length;
  const doneCuts = cutStatuses.filter((c) => c.status === "done").length;
  const failedCuts = cutStatuses.filter((c) => c.status === "failed").length;
  const progress = totalCuts > 0 ? Math.round((doneCuts / totalCuts) * 100) : 0;
  const totalCost = totalCuts * CREDIT_COST.generateCut;
  const allDone = doneCuts + failedCuts === totalCuts && totalCuts > 0;

  function startGeneration() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/generate/cuts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ webtoonId, episodeId }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "생성 시작 실패");
        const { jobId: newJobId } = await res.json();
        setJobId(newJobId);
        setPolling(true);
        lastProgressRef.current = { value: -1, time: Date.now() };
        setStuckWarning(false);
        toast.success("컷 생성이 시작되었습니다!");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "오류가 발생했습니다.");
      }
    });
  }

  async function cancelGeneration() {
    if (!jobId) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      // 폴링은 유지 — cancelled 상태를 서버에서 직접 감지해 종료
      toast.info("중지 요청 완료. 현재 컷 완료 후 멈춥니다.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "중지 실패");
    } finally {
      setCancelling(false);
    }
  }

  async function recoverImages() {
    setRecovering(true);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/cuts/recover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webtoonId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "복구 실패");
      if (data.recovered === 0) {
        toast.info("연결할 이미지가 없습니다. (Storage에 파일이 없거나 이미 연결됨)");
      } else {
        toast.success(`${data.recovered}개 이미지 복구 완료! 상태를 새로 고침합니다.`);
        // DB에서 최신 상태 다시 로드
        const cutsRes = await fetch(`/api/episodes/${episodeId}/cuts`);
        if (cutsRes.ok) {
          const cutsData = await cutsRes.json();
          const panelTypeMap: Record<string, string> = {};
          for (const s of storyJson.scenes) for (const c of s.cuts) panelTypeMap[c.cut_id] = c.panel_type;
          const statuses: CutStatus[] = (cutsData.cutStatuses ?? []).map((cs: CutStatus) => ({
            ...cs,
            panelType: cs.panelType ?? panelTypeMap[cs.cutId] ?? "medium",
          }));
          if (statuses.length > 0) setCutStatuses(statuses);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "복구 실패");
    } finally {
      setRecovering(false);
    }
  }

  // 폴링
  useEffect(() => {
    if (!polling || !jobId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.cutStatuses && data.cutStatuses.length > 0) {
          const updated: CutStatus[] = data.cutStatuses;
          // prev 상태를 기준으로 머지 — 빈 배열이 와도 컷이 사라지지 않고,
          // panelType/characterKeys/locationKey 같이 DB에 없는 필드도 보존됨
          setCutStatuses((prev) => {
            const map = new Map(updated.map((u) => [u.cutId, u]));
            return prev.map((c) => {
              const u = map.get(c.cutId);
              return u ? { ...c, ...u } : c;
            });
          });

          // 컷 상태 기준으로 완료 판단 — job status가 stuck돼도 여기서 폴링 종료
          const allTerminal =
            updated.length > 0 &&
            updated.every((c) => c.status === "done" || c.status === "failed");
          if (allTerminal) {
            setPolling(false);
            setStuckWarning(false);
            const failCount = updated.filter((c) => c.status === "failed").length;
            if (failCount === 0) toast.success("모든 컷이 생성되었습니다!");
            else toast.error(`${failCount}개 컷 생성이 실패했습니다.`);
            return;
          }
        }

        // 무한로딩 감지: 5분 이상 진행률 변화 없으면 경고
        const currentProgress = data.progress ?? 0;
        if (currentProgress !== lastProgressRef.current.value) {
          lastProgressRef.current = { value: currentProgress, time: Date.now() };
          setStuckWarning(false);
        } else if (Date.now() - lastProgressRef.current.time > 5 * 60 * 1000) {
          setStuckWarning(true);
        }

        if (data.status === "done" || data.status === "failed" || data.status === "cancelled") {
          setPolling(false);
          setStuckWarning(false);
          if (data.status === "cancelled") toast.success("생성이 중지되었습니다.");
        }
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [polling, jobId]);

  async function quickRegenerate(cutId: string) {
    setRegeneratingCuts((prev) => new Set(prev).add(cutId));
    updateCutStatus(cutId, { status: "generating" });
    try {
      const res = await fetch(`/api/episodes/${episodeId}/cuts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webtoonId, cutIdKey: cutId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "재생성 실패");
      const { imageUrl } = await res.json();
      updateCutStatus(cutId, { status: "done", imageUrl });
      toast.success(`${cutId} 재생성 완료`);
    } catch (e) {
      updateCutStatus(cutId, { status: "failed" });
      toast.error(e instanceof Error ? e.message : "재생성 실패");
    } finally {
      setRegeneratingCuts((prev) => { const s = new Set(prev); s.delete(cutId); return s; });
    }
  }

  async function deleteCut(cutId: string) {
    if (!confirm(`${cutId} 컷을 삭제하시겠습니까?`)) return;
    setDeletingCuts((prev) => new Set(prev).add(cutId));
    try {
      const res = await fetch(
        `/api/episodes/${episodeId}/cuts?cutIdKey=${encodeURIComponent(cutId)}&webtoonId=${encodeURIComponent(webtoonId)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "삭제 실패");
      setCutStatuses((prev) => prev.filter((c) => c.cutId !== cutId));
      toast.success(`${cutId} 삭제 완료`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setDeletingCuts((prev) => { const s = new Set(prev); s.delete(cutId); return s; });
    }
  }

  async function regenerateScene(sceneId: string) {
    const scene = storyJson.scenes.find((s) => s.scene_id === sceneId);
    if (!scene) return;
    for (const cut of scene.cuts) {
      await quickRegenerate(cut.cut_id);
    }
  }

  // 편집할 컷 찾기
  const editingEntry = editingCutId
    ? storyJson.scenes.flatMap((s) => s.cuts.map((c) => ({ cut: c, scene: s }))).find(({ cut }) => cut.cut_id === editingCutId)
    : null;
  const editingCurrentStatus = editingCutId ? cutStatuses.find((c) => c.cutId === editingCutId) : undefined;

  function updateCutStatus(cutId: string, patch: Partial<CutStatus>) {
    setCutStatuses((prev) => prev.map((c) => (c.cutId === cutId ? { ...c, ...patch } : c)));
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="font-medium mb-1">컷 이미지 생성</p>
        <p className="text-muted-foreground text-xs">
          레퍼런스 이미지를 첨부해 각 컷을 씬 단위로 병렬 생성합니다.
          총 <strong className="text-foreground">{totalCuts}컷</strong> · 예상{" "}
          <strong className="text-foreground">{totalCost} 크레딧</strong>
        </p>
      </div>

      {/* 진행률 */}
      {(polling || allDone) && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{polling ? "생성 중..." : "완료"}</span>
            <span>{doneCuts}/{totalCuts} ({progress}%){failedCuts > 0 ? ` · ${failedCuts}개 실패` : ""}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* 무한로딩 경고 배너 */}
      {stuckWarning && polling && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-700 p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-orange-800 dark:text-orange-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>5분 이상 진행이 없습니다. 무한로딩일 수 있어요.</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={cancelGeneration}
            disabled={cancelling}
            className="shrink-0 border-orange-400 text-orange-700 hover:bg-orange-100 dark:text-orange-300 dark:border-orange-600 dark:hover:bg-orange-900/40"
          >
            {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            강제 중지
          </Button>
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex gap-2">
        {initializing ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />이전 상태 확인 중...
          </div>
        ) : polling ? (
          <Button variant="outline" size="sm" onClick={cancelGeneration} disabled={cancelling} className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/5">
            {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
            생성 중지
          </Button>
        ) : !pending && !allDone ? (
          <Button onClick={startGeneration} size="sm" className="gap-1.5">
            <Play className="h-3.5 w-3.5" />
            {doneCuts > 0 ? `이어서 생성 (${totalCuts - doneCuts}컷 남음)` : `생성 시작 (${totalCost} 크레딧)`}
          </Button>
        ) : null}
        {pending && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />작업을 시작하고 있어요...
          </div>
        )}
        {allDone && doneCuts > 0 && (
          <Button asChild size="sm">
            <Link href={`/my/webtoons/${webtoonId}`}>발행 설정으로 →</Link>
          </Button>
        )}
        {/* 이미지 복구 버튼 — 생성 중이 아닐 때 노출 */}
        {!polling && !initializing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={recoverImages}
            disabled={recovering}
            className="gap-1.5 text-muted-foreground hover:text-foreground ml-auto"
            title="Storage에 이미지가 있는데 화면에 안 보이는 경우 복구"
          >
            {recovering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            이미지 연결 복구
          </Button>
        )}
      </div>

      {/* 씬별 컷 그리드 */}
      <div className="space-y-6">
        {storyJson.scenes.map((scene) => {
          const sceneCuts = cutStatuses.filter((cs) =>
            scene.cuts.some((c) => c.cut_id === cs.cutId)
          );
          const sceneHasDone = sceneCuts.some((c) => c.status === "done");
          const sceneRegenerating = sceneCuts.some(
            (c) => regeneratingCuts.has(c.cutId) || c.status === "generating"
          );

          return (
            <div key={scene.scene_id} className="space-y-2">
              {/* 씬 헤더 */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-semibold font-mono text-muted-foreground shrink-0">{scene.scene_id}</span>
                  {scene.location_key && (
                    <span className="text-xs text-muted-foreground truncate">{scene.location_key}</span>
                  )}
                  <span className="text-xs text-muted-foreground shrink-0">{sceneCuts.length}컷</span>
                </div>
                {sceneHasDone && !polling && (
                  <button
                    onClick={() => regenerateScene(scene.scene_id)}
                    disabled={sceneRegenerating}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 shrink-0"
                    title="씬 전체 재생성"
                  >
                    {sceneRegenerating
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <RefreshCw className="h-3 w-3" />}
                    씬 재생성
                  </button>
                )}
              </div>

              {/* 컷 카드들 */}
              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-4">
                {sceneCuts.map((cut) => {
                  const isRegenIndividual = regeneratingCuts.has(cut.cutId);
                  const isActive = isRegenIndividual || cut.status === "generating";

                  return (
                    <div key={cut.cutId} className="rounded-lg border overflow-hidden group">
                      <div className={cn(PANEL_ASPECT[cut.panelType ?? "medium"] ?? "aspect-[3/4]", "bg-muted relative overflow-hidden", isActive && "animate-pulse")}>
                        {cut.imageUrl ? (
                          <>
                            <ImageLightbox
                              src={cut.imageUrl} alt={cut.label} fill
                              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                            />
                            {/* 호버 오버레이: 편집 */}
                            <button
                              onClick={() => setEditingCutId(cut.cutId)}
                              className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
                            >
                              <Pencil className="h-5 w-5 text-white drop-shadow" />
                            </button>
                          </>
                        ) : isActive ? (
                          <div className="h-full w-full bg-gradient-to-br from-muted via-muted-foreground/10 to-muted relative">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent animate-[shimmer_1.4s_infinite] -translate-x-full" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <RefreshCw className="h-5 w-5 text-muted-foreground/50 animate-spin" />
                            </div>
                          </div>
                        ) : cut.status === "done" ? (
                          <div className="flex h-full items-center justify-center">
                            <CheckCircle className="h-6 w-6 text-green-500" />
                          </div>
                        ) : cut.status === "failed" ? (
                          <div className="flex h-full flex-col items-center justify-center gap-2">
                            <XCircle className="h-6 w-6 text-destructive" />
                            <button
                              onClick={() => quickRegenerate(cut.cutId)}
                              className="text-xs text-primary hover:underline flex items-center gap-0.5"
                            >
                              <RefreshCw className="h-3 w-3" />재시도
                            </button>
                          </div>
                        ) : (
                          <div className="h-full w-full bg-muted relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-[shimmer_2s_infinite_0.5s] -translate-x-full opacity-50" />
                          </div>
                        )}
                      </div>
                      <div className="px-2 pt-1.5 pb-1 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-mono text-muted-foreground truncate">{cut.cutId}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {/* 빠른 재생성 버튼 */}
                            {(cut.status === "done" || cut.status === "failed") && !polling && (
                              <button
                                onClick={() => quickRegenerate(cut.cutId)}
                                disabled={isRegenIndividual}
                                className="text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                                title="다시 생성"
                              >
                                {isRegenIndividual
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <RefreshCw className="h-3 w-3" />}
                              </button>
                            )}
                            {/* 컷 삭제 버튼 — 폴링 중 비활성 */}
                            {!polling && (
                              <button
                                onClick={() => deleteCut(cut.cutId)}
                                disabled={deletingCuts.has(cut.cutId)}
                                className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                                title="컷 삭제"
                              >
                                {deletingCuts.has(cut.cutId)
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <Trash2 className="h-3 w-3" />}
                              </button>
                            )}
                            <button onClick={() => setEditingCutId(cut.cutId)} className="text-muted-foreground hover:text-foreground transition-colors">
                              <Pencil className="h-3 w-3" />
                            </button>
                            <Badge
                              variant={cut.status === "done" ? "default" : cut.status === "failed" ? "destructive" : "secondary"}
                              className="text-xs py-0"
                            >
                              {isRegenIndividual ? "재생성중" : cut.status === "done" ? "완료" : cut.status === "failed" ? "실패" : cut.status === "generating" ? "생성중" : "대기"}
                            </Badge>
                          </div>
                        </div>
                        {/* 참조 이미지 썸네일 */}
                        <CutRefThumbs cut={cut} charRefMap={charRefMap} locRefMap={locRefMap} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 컷 편집 다이얼로그 */}
      {editingEntry && (
        <CutEditDialog
          cut={editingEntry.cut}
          scene={editingEntry.scene}
          currentStatus={editingCurrentStatus}
          episodeId={episodeId}
          webtoonId={webtoonId}
          charRefMap={charRefMap}
          locRefMap={locRefMap}
          open={!!editingCutId}
          onClose={() => setEditingCutId(null)}
          onOpenFullscreen={(url) => setFullscreenUrl(url)}
          onRegenerated={(imageUrl, updatedCharKeys, updatedLocKey) => {
            updateCutStatus(editingEntry.cut.cut_id, {
              status: "done",
              imageUrl,
              characterKeys: updatedCharKeys,
              locationKey: updatedLocKey,
            });
            setEditingCutId(null);
          }}
          onSaved={(updatedCharKeys, updatedLocKey) => {
            updateCutStatus(editingEntry.cut.cut_id, {
              characterKeys: updatedCharKeys,
              locationKey: updatedLocKey,
            });
            setEditingCutId(null);
          }}
        />
      )}

      {/* 전체화면 이미지 오버레이 (Dialog 위) */}
      {fullscreenUrl && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95"
          onClick={() => setFullscreenUrl(null)}
        >
          <button
            className="absolute top-4 right-4 rounded-full bg-white/10 hover:bg-white/20 p-2 text-white"
            onClick={() => setFullscreenUrl(null)}
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={fullscreenUrl}
            alt="컷 전체화면"
            className="max-w-[95vw] max-h-[95vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CutRefThumbs — 컷 카드 하단 참조 이미지 썸네일                       */
/* ------------------------------------------------------------------ */

function CutRefThumbs({
  cut,
  charRefMap,
  locRefMap,
}: {
  cut: CutStatus;
  charRefMap: Record<string, { name: string; url: string | null }>;
  locRefMap: Record<string, { name: string; url: string | null }>;
}) {
  const charKeys = cut.characterKeys ?? [];
  const locKey = cut.locationKey ?? "";
  if (charKeys.length === 0 && !locKey) return null;

  const entries: { key: string; name: string; url: string | null; type: "char" | "loc" }[] = [
    ...charKeys.map((k) => ({
      key: k,
      name: charRefMap[k]?.name ?? k,
      url: charRefMap[k]?.url ?? null,
      type: "char" as const,
    })),
    ...(locKey && locRefMap[locKey]
      ? [{ key: locKey, name: locRefMap[locKey].name, url: locRefMap[locKey].url, type: "loc" as const }]
      : []),
  ];

  const missingRef = entries.some((e) => !e.url);

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {missingRef && (
        <span title="참조 이미지 없는 항목 있음">
          <AlertTriangle className="h-3 w-3 text-yellow-500 shrink-0" />
        </span>
      )}
      {entries.map((e) => (
        <div
          key={e.key}
          title={`${e.name}${e.url ? "" : " (참조 없음)"}`}
          className={cn(
            "h-5 w-5 rounded-full overflow-hidden border shrink-0 relative bg-muted",
            e.url ? "border-border" : "border-yellow-400 border-dashed"
          )}
        >
          {e.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={e.url} alt={e.name} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[8px] font-bold text-muted-foreground leading-none">
              {e.name.charAt(0)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CutEditDialog                                                         */
/* ------------------------------------------------------------------ */

import type { Cut, Scene } from "@/lib/ai/story-schema";

interface CutEditDialogProps {
  cut: Cut;
  scene: Scene;
  currentStatus: CutStatus | undefined;
  episodeId: string;
  webtoonId: string;
  charRefMap: Record<string, { name: string; url: string | null }>;
  locRefMap: Record<string, { name: string; url: string | null }>;
  open: boolean;
  onClose: () => void;
  onOpenFullscreen: (url: string) => void;
  onRegenerated: (imageUrl: string, charKeys: string[], locKey: string) => void;
  onSaved: (charKeys: string[], locKey: string) => void;
}

function CutEditDialog({
  cut, scene, currentStatus, episodeId, webtoonId,
  charRefMap, locRefMap, open, onClose, onOpenFullscreen, onRegenerated, onSaved,
}: CutEditDialogProps) {
  const [visualPrompt, setVisualPrompt] = useState(cut.visual_prompt);
  const [dialogue, setDialogue] = useState<DialogueLine[]>(cut.dialogue ?? []);
  const [narration, setNarration] = useState<NarrationLine[]>(cut.narration ?? []);
  const [sfx, setSfx] = useState<SfxLine[]>(cut.sfx ?? []);
  const [charKeys, setCharKeys] = useState<string[]>(cut.character_keys ?? []);
  const [locationKey, setLocationKey] = useState<string>(cut.location_key ?? "");
  const [regenerating, setRegenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setVisualPrompt(cut.visual_prompt);
    setDialogue(cut.dialogue ?? []);
    setNarration(cut.narration ?? []);
    setSfx(cut.sfx ?? []);
    setCharKeys(cut.character_keys ?? []);
    setLocationKey(cut.location_key ?? "");
  }, [cut]);

  const payload = {
    webtoonId,
    cutIdKey: cut.cut_id,
    visual_prompt: visualPrompt,
    dialogue,
    narration,
    sfx,
    character_keys: charKeys,
    location_key: locationKey,
  };

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/cuts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "저장 실패");
      toast.success(`${cut.cut_id} 저장 완료`);
      onSaved(charKeys, locationKey);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/cuts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "재생성 실패");
      const { imageUrl } = await res.json();
      toast.success(`${cut.cut_id} 재생성 완료`);
      onRegenerated(imageUrl, charKeys, locationKey);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "재생성 실패");
    } finally {
      setRegenerating(false);
    }
  }

  const allCharKeys = Object.keys(charRefMap);
  const allLocKeys = Object.keys(locRefMap);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">
            {cut.cut_id}
            <span className="text-muted-foreground font-normal ml-2">씬: {scene.scene_id}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-[1fr_200px] gap-5">
          {/* 왼쪽: 편집 필드 */}
          <div className="space-y-4">
            {/* 참조 캐릭터 */}
            {allCharKeys.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">참조 캐릭터</Label>
                <div className="flex flex-wrap gap-1.5">
                  {allCharKeys.map((k) => {
                    const info = charRefMap[k];
                    const active = charKeys.includes(k);
                    return (
                      <button
                        key={k}
                        onClick={() => setCharKeys((prev) => active ? prev.filter((x) => x !== k) : [...prev, k])}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors",
                          active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/50"
                        )}
                        title={info.url ? undefined : "참조 이미지 없음"}
                      >
                        <div className={cn("h-4 w-4 rounded-full overflow-hidden border shrink-0", info.url ? "border-border" : "border-yellow-400 border-dashed")}>
                          {info.url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={info.url} alt={info.name} className="h-full w-full object-cover" />
                            : <span className="flex h-full w-full items-center justify-center text-[7px] font-bold leading-none">{info.name.charAt(0)}</span>
                          }
                        </div>
                        {info.name}
                        {!info.url && <AlertTriangle className="h-3 w-3 text-yellow-500" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 참조 장소 */}
            {allLocKeys.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">참조 장소</Label>
                <div className="flex flex-wrap gap-1.5">
                  {allLocKeys.map((k) => {
                    const info = locRefMap[k];
                    const active = locationKey === k;
                    return (
                      <button
                        key={k}
                        onClick={() => setLocationKey(active ? "" : k)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs transition-colors",
                          active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/50"
                        )}
                      >
                        <div className={cn("h-4 w-4 rounded-full overflow-hidden border shrink-0", info.url ? "border-border" : "border-yellow-400 border-dashed")}>
                          {info.url
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={info.url} alt={info.name} className="h-full w-full object-cover" />
                            : <span className="flex h-full w-full items-center justify-center text-[7px] font-bold leading-none">{info.name.charAt(0)}</span>
                          }
                        </div>
                        {info.name}
                        {!info.url && <AlertTriangle className="h-3 w-3 text-yellow-500" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Visual prompt */}
            <div className="space-y-1.5">
              <Label className="text-xs">이미지 프롬프트 (영문)</Label>
              <Textarea value={visualPrompt} onChange={(e) => setVisualPrompt(e.target.value)}
                rows={5} className="text-xs font-mono resize-none" placeholder="Visual description in English..." />
            </div>

            {/* Dialogue */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">대사</Label>
                <button onClick={() => setDialogue((d) => [...d, { character: "", text: "", bubble_position: "auto" }])}
                  className="text-xs text-primary hover:underline flex items-center gap-0.5"><Plus className="h-3 w-3" />추가</button>
              </div>
              {dialogue.map((d, i) => (
                <div key={i} className="flex gap-1.5 items-start">
                  <Input value={d.character} onChange={(e) => setDialogue((p) => p.map((x, j) => j === i ? { ...x, character: e.target.value } : x))}
                    placeholder="캐릭터명" className="h-7 text-xs w-20 shrink-0" />
                  <Input value={d.text} onChange={(e) => setDialogue((p) => p.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
                    placeholder="대사" className="h-7 text-xs flex-1" />
                  <Input value={(d as DialogueLine & { bubble_position?: string }).bubble_position ?? "auto"}
                    onChange={(e) => setDialogue((p) => p.map((x, j) => j === i ? { ...x, bubble_position: e.target.value } : x))}
                    placeholder="위치" className="h-7 text-xs w-16 shrink-0" />
                  <button onClick={() => setDialogue((p) => p.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive mt-1">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Narration */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">내레이션</Label>
                <button onClick={() => setNarration((n) => [...n, { text: "" }])}
                  className="text-xs text-primary hover:underline flex items-center gap-0.5"><Plus className="h-3 w-3" />추가</button>
              </div>
              {narration.map((n, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <Input value={n.text} onChange={(e) => setNarration((p) => p.map((x, j) => j === i ? { text: e.target.value } : x))}
                    placeholder="내레이션..." className="h-7 text-xs flex-1" />
                  <button onClick={() => setNarration((p) => p.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* SFX */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">효과음 (SFX)</Label>
                <button onClick={() => setSfx((s) => [...s, { text: "" }])}
                  className="text-xs text-primary hover:underline flex items-center gap-0.5"><Plus className="h-3 w-3" />추가</button>
              </div>
              {sfx.map((s, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <Input value={s.text} onChange={(e) => setSfx((p) => p.map((x, j) => j === i ? { text: e.target.value } : x))}
                    placeholder="쾅! 슈웅..." className="h-7 text-xs flex-1" />
                  <button onClick={() => setSfx((p) => p.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 오른쪽: 현재 이미지 */}
          <div className="space-y-1.5">
            <Label className="text-xs">현재 이미지</Label>
            <div className={cn(PANEL_ASPECT[cut.panel_type ?? "medium"] ?? "aspect-[3/4]", "rounded-lg border bg-muted overflow-hidden relative group")}>
              {currentStatus?.imageUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={currentStatus.imageUrl} alt={cut.cut_id} className="w-full h-full object-cover" />
                  <button
                    onClick={() => onOpenFullscreen(currentStatus.imageUrl!)}
                    className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100"
                  >
                    <span className="text-white text-xs font-medium drop-shadow">전체화면</span>
                  </button>
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">없음</div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving || regenerating}>취소</Button>
          <Button variant="secondary" onClick={handleSave} disabled={saving || regenerating} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? "저장 중..." : "저장 (JSON만)"}
          </Button>
          <Button onClick={handleRegenerate} disabled={saving || regenerating} className="gap-1.5">
            {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {regenerating ? "재생성 중..." : `저장 + 재생성 (${CREDIT_COST.generateCut} 크레딧)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
