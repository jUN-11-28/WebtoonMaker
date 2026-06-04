"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { StoryReview } from "../new/story-review";
import { EpisodeReferences } from "../new/episode-references";
import { CutsPhase } from "@/app/(creator)/create/cuts-phase";
import { DeleteEpisodeButton } from "./delete-episode-button";
import type { StoryJson } from "@/lib/ai/story-schema";
import type { Json } from "@/lib/supabase/types";
import { RefreshCw, Play, FileText, CheckCircle, XCircle, ChevronLeft } from "lucide-react";
import Link from "next/link";

interface EpisodeEditorProps {
  webtoonId: string;
  webtoonTitle: string;
  episode: {
    id: string;
    episode_number: number;
    title: string;
    status: string;
    story_json: Json | null;
    script_source: string | null;
  };
  credits: number;
  characters: {
    id: string; char_key: string; name: string;
    bible: Record<string, string> | null;
    locked: boolean; reference_image_url: string | null;
  }[];
  projectBrief: string | null;
}

const STATUS_INFO: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  draft: { label: "초안", icon: <FileText className="h-4 w-4" />, color: "text-muted-foreground" },
  generating: { label: "생성 중", icon: <RefreshCw className="h-4 w-4 animate-spin" />, color: "text-blue-500" },
  ready: { label: "완료", icon: <CheckCircle className="h-4 w-4" />, color: "text-green-500" },
  failed: { label: "실패", icon: <XCircle className="h-4 w-4" />, color: "text-destructive" },
};

export function EpisodeEditor({ webtoonId, webtoonTitle, episode, credits, characters, projectBrief }: EpisodeEditorProps) {
  const router = useRouter();
  const [view, setView] = useState<"status" | "review" | "references" | "cuts">("status");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingJobId, setGeneratingJobId] = useState<string | null>(null);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  const storyJson = episode.story_json as StoryJson | null;
  const statusInfo = STATUS_INFO[episode.status] ?? STATUS_INFO.draft;

  function handleBack() {
    if (isGenerating) { setShowLeaveDialog(true); return; }
    router.back();
  }

  async function leaveWithCancel() {
    if (generatingJobId) {
      await fetch(`/api/jobs/${generatingJobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      }).catch(() => {});
    }
    setShowLeaveDialog(false);
    router.back();
  }

  function leaveWithoutCancel() {
    setShowLeaveDialog(false);
    router.back();
  }

  // 공통 헤더
  const header = (
    <div className="flex items-center justify-between gap-3 mb-6">
      <div className="flex items-center gap-3 min-w-0">
        <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1 shrink-0">
          <ChevronLeft className="h-4 w-4" />
          {webtoonTitle}
        </Button>
        <span className="text-muted-foreground shrink-0">·</span>
        <span className="text-sm font-medium truncate">
          {episode.episode_number}화 — {episode.title}
        </span>
      </div>
      <DeleteEpisodeButton
        episodeId={episode.id}
        webtoonId={webtoonId}
        episodeTitle={episode.title}
      />
    </div>
  );

  // 이탈 확인 다이얼로그
  const leaveDialog = (
    <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>이미지 생성 중입니다</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          컷 이미지를 생성하고 있어요. 나가시겠습니까?
        </p>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowLeaveDialog(false)} className="sm:mr-auto">
            계속 생성하기
          </Button>
          <Button variant="outline" size="sm" onClick={leaveWithoutCancel}>
            생성 유지하고 나가기
          </Button>
          <Button variant="destructive" size="sm" onClick={leaveWithCancel}>
            생성 중단 후 나가기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // 씬/컷 검토 뷰
  if (view === "review" && storyJson) {
    return (
      <>
        {header}
        {leaveDialog}
        <StoryReview
          storyJson={storyJson}
          episodeId={episode.id}
          webtoonId={webtoonId}
          onComplete={() => setView("references")}
          onSavedBack={() => setView("status")}
        />
      </>
    );
  }

  // 레퍼런스 생성 뷰
  if (view === "references" && storyJson) {
    return (
      <>
        {header}
        {leaveDialog}
        <EpisodeReferences
          storyJson={storyJson}
          webtoonId={webtoonId}
          episodeId={episode.id}
          onComplete={() => setView("cuts")}
        />
      </>
    );
  }

  // 이미지 생성 뷰
  if (view === "cuts" && storyJson) {
    return (
      <>
        {header}
        {leaveDialog}
        <div className="space-y-4">
          <CutsPhase
            storyJson={storyJson}
            webtoonId={webtoonId}
            episodeId={episode.id}
            onGeneratingChange={(generating, jobId) => {
              setIsGenerating(generating);
              setGeneratingJobId(jobId);
            }}
          />
          <Button variant="outline" size="sm" onClick={() => setView("status")}>
            ← 에피소드 정보로
          </Button>
        </div>
      </>
    );
  }

  // 기본 상태 뷰
  return (
    <>
      {header}
      {leaveDialog}
      <div className="space-y-5">
        {/* 상태 카드 */}
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">에피소드 상태</h2>
            <div className={`flex items-center gap-1.5 text-sm font-medium ${statusInfo.color}`}>
              {statusInfo.icon}
              {statusInfo.label}
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">제목</span>
              <span className="font-medium">{episode.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">스토리보드</span>
              <span>{storyJson ? `${storyJson.scenes?.length ?? 0}씬 / ${storyJson.scenes?.reduce((s, sc) => s + sc.cuts.length, 0) ?? 0}컷` : "없음"}</span>
            </div>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="space-y-2">
          {episode.status === "ready" && (
            <div className="rounded-lg bg-muted/40 border px-4 py-3 text-xs text-muted-foreground">
              완료된 화입니다. 아래에서 원하는 항목을 수정할 수 있습니다.
              컷 카드의 연필 아이콘으로 개별 컷을 수정하거나, 씬·컷 검토로 스토리보드 전체를 수정한 뒤 재생성할 수 있습니다.
            </div>
          )}

          {storyJson && (
            <>
              <Button className="w-full gap-2" onClick={() => setView("cuts")}>
                <Play className="h-4 w-4" />
                {episode.status === "ready" ? "컷 수정 / 재생성" : "컷 이미지 생성"}
              </Button>
              <Button variant="outline" className="w-full gap-2" onClick={() => setView("review")}>
                <FileText className="h-4 w-4" />씬·컷 검토 / 스토리보드 편집
              </Button>
              <Button variant="outline" className="w-full gap-2" onClick={() => setView("references")}>
                <RefreshCw className="h-4 w-4" />레퍼런스 이미지 수정
              </Button>
            </>
          )}

          {!storyJson && (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground text-center">
              <p>스토리보드가 없습니다.</p>
              <Button variant="outline" size="sm" className="mt-3" asChild>
                <Link href={`/studio/${webtoonId}/episodes/new`}>새 화 생성 페이지로 →</Link>
              </Button>
            </div>
          )}

          {episode.status === "ready" && (
            <Button variant="outline" className="w-full" asChild>
              <Link href={`/w/${webtoonId}/${episode.id}`} target="_blank">
                뷰어에서 보기 →
              </Link>
            </Button>
          )}
        </div>

        {/* 원본 스크립트 */}
        {episode.script_source && (
          <details className="rounded-lg border bg-muted/20">
            <summary className="px-4 py-3 text-sm font-medium cursor-pointer hover:bg-muted/30 transition-colors">
              원본 스크립트 보기
            </summary>
            <pre className="px-4 py-3 text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed border-t max-h-60 overflow-y-auto">
              {episode.script_source}
            </pre>
          </details>
        )}
      </div>
    </>
  );
}
