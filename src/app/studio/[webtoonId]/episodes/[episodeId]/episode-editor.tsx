"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { GeneratingOverlay } from "@/components/generating-overlay";
import { StoryReview } from "../new/story-review";
import { EpisodeReferences } from "../new/episode-references";
import { CutsPhase } from "@/app/(creator)/create/cuts-phase";
import { DeleteEpisodeButton } from "./delete-episode-button";
import { CREDIT_COST } from "@/lib/credits";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { StoryJson } from "@/lib/ai/story-schema";
import type { Json } from "@/lib/supabase/types";
import { RefreshCw, Play, FileText, CheckCircle, XCircle, ChevronLeft, Sparkles, Coins, Users, Lock, Unlock, Check } from "lucide-react";
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
  const [view, setView] = useState<"status" | "generate" | "review" | "references" | "cuts">("status");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingJobId, setGeneratingJobId] = useState<string | null>(null);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [storyJson, setStoryJson] = useState<StoryJson | null>(episode.story_json as StoryJson | null);

  // 스토리보드 생성 폼 상태
  const [script, setScript] = useState("");
  const [textProvider, setTextProvider] = useState<"gemini" | "openai">("gemini");
  const [selectedCharKeys, setSelectedCharKeys] = useState<Set<string>>(
    new Set(characters.map((c) => c.char_key))
  );
  const [genPending, startGenTransition] = useTransition();

  const statusInfo = STATUS_INFO[episode.status] ?? STATUS_INFO.draft;

  function toggleChar(key: string) {
    setSelectedCharKeys((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  function generateStoryboard() {
    if (script.trim().length < 10) {
      toast.error("스크립트를 입력하세요.");
      return;
    }
    startGenTransition(async () => {
      try {
        const genRes = await fetch("/api/generate/json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            script,
            webtoonId,
            episodeId: episode.id,
            selectedCharKeys: [...selectedCharKeys],
            textProvider,
          }),
        });
        if (!genRes.ok) throw new Error((await genRes.json()).error ?? "JSON 생성 실패");
        const { jobId } = await genRes.json();

        // job 완료 대기 (2.5초 간격 폴링)
        const INTERVAL = 2500;
        const TIMEOUT = 5 * 60 * 1000;
        const start = Date.now();
        while (Date.now() - start < TIMEOUT) {
          await new Promise((r) => setTimeout(r, INTERVAL));
          const pollRes = await fetch(`/api/jobs/${jobId}`);
          if (!pollRes.ok) throw new Error("Job 상태 조회 실패");
          const job = await pollRes.json() as { status: string; error?: string; storyJson?: StoryJson };
          if (job.status === "done") {
            if (!job.storyJson) throw new Error("스토리보드 데이터가 없습니다.");
            setStoryJson(job.storyJson);
            toast.success("스토리보드 생성 완료! 씬·컷을 검토하세요.");
            setView("review");
            return;
          }
          if (job.status === "failed") throw new Error(job.error ?? "JSON 생성 실패");
        }
        throw new Error("생성 시간 초과. 나중에 다시 시도하세요.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "오류가 발생했습니다.");
      }
    });
  }

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

  // 스토리보드 생성 뷰
  if (view === "generate") {
    return (
      <>
        {header}
        <div className="space-y-5">
          {projectBrief && (
            <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 p-4 text-sm">
              <p className="font-medium text-blue-700 dark:text-blue-300 mb-1">📋 기획안 적용 중</p>
              <p className="text-blue-600 dark:text-blue-400 text-xs line-clamp-2">{projectBrief}</p>
            </div>
          )}

          {characters.length > 0 && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div>
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Users className="h-4 w-4" />이번 화 등장 캐릭터 선택
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  체크된 캐릭터만 AI가 이번 화 컨텍스트로 사용합니다. 안 나오는 캐릭터는 해제하세요.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {characters.map((c) => {
                  const on = selectedCharKeys.has(c.char_key);
                  return (
                    <button
                      key={c.char_key}
                      onClick={() => toggleChar(c.char_key)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted/50"
                      )}
                    >
                      {c.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                      {c.name}
                      {on && <Check className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="script">이번 화 소설/스크립트 *</Label>
            <Textarea id="script" value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="이번 화에 해당하는 소설 텍스트를 붙여넣으세요."
              rows={14} className="font-mono text-sm resize-y" disabled={genPending} />
            <p className="text-xs text-muted-foreground text-right">{script.trim().length.toLocaleString()}자</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">씬/컷 분석 엔진</Label>
            <Select value={textProvider} onValueChange={(v) => setTextProvider(v as "gemini" | "openai")} disabled={genPending}>
              <SelectTrigger className="w-56 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini">Gemini (기본)</SelectItem>
                <SelectItem value="openai">OpenAI GPT</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border bg-muted/40 p-3 text-sm flex items-center gap-2">
            <Coins className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground text-xs">
              JSON {CREDIT_COST.generateJson} + 컷 {CREDIT_COST.generateCut}/장
            </span>
            <span className="ml-auto font-medium shrink-0">보유 {credits}</span>
          </div>

          {!genPending && (
            <>
              <Button onClick={generateStoryboard}
                disabled={script.trim().length < 10 || credits < CREDIT_COST.generateJson}
                size="lg" className="w-full gap-2">
                <Sparkles className="h-4 w-4" />
                스토리보드 생성 ({CREDIT_COST.generateJson} 크레딧)
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setView("status")}>
                ← 에피소드 정보로
              </Button>
            </>
          )}

          {genPending && (
            <GeneratingOverlay messages={[
              "📖 스크립트를 읽고 있어요...",
              "🎭 등장인물을 분석하고 있어요...",
              "🎬 씬을 구성하고 있어요...",
              "💬 대사와 내레이션을 정리하고 있어요...",
              "🖼️ 컷 구도를 설계하고 있어요...",
              "✨ 스토리보드를 완성하고 있어요...",
            ]} />
          )}
        </div>
      </>
    );
  }

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
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setView("generate")}>
                <Sparkles className="h-4 w-4 mr-1.5" />스토리보드 생성하기
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
