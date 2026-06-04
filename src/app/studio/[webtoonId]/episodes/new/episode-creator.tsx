"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Sparkles, Users, Coins, ChevronLeft, Check, Lock, Unlock } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CREDIT_COST } from "@/lib/credits";
import { GeneratingOverlay } from "@/components/generating-overlay";
import { StoryReview } from "./story-review";
import { EpisodeReferences } from "./episode-references";
import { CutsPhase } from "@/app/(creator)/create/cuts-phase";
import type { StoryJson } from "@/lib/ai/story-schema";
import { cn } from "@/lib/utils";

interface Character {
  id: string; char_key: string; name: string;
  bible: Record<string, string> | null;
  locked: boolean; reference_image_url: string | null;
}

interface EpisodeCreatorProps {
  webtoonId: string;
  webtoonTitle: string;
  episodeNumber: number;
  credits: number;
  characters: Character[];
  projectBrief: string | null;
}

const STEPS = [
  { id: "input", label: "① 스크립트" },
  { id: "review", label: "② 씬·컷 검토" },
  { id: "references", label: "③ 레퍼런스" },
  { id: "cuts", label: "④ 이미지 생성" },
];

export function EpisodeCreator({ webtoonId, webtoonTitle, episodeNumber, credits, characters, projectBrief }: EpisodeCreatorProps) {
  const router = useRouter();
  const [step, setStep] = useState<"input" | "review" | "references" | "cuts">("input");
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [storyJson, setStoryJson] = useState<StoryJson | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingJobId, setGeneratingJobId] = useState<string | null>(null);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);

  const [epTitle, setEpTitle] = useState(`${episodeNumber}화`);
  const [script, setScript] = useState("");
  const [textProvider, setTextProvider] = useState<"gemini" | "openai">("gemini");
  const [pending, startTransition] = useTransition();

  // 이번 화에 포함할 기존 캐릭터 선택 (체크박스)
  const [selectedCharKeys, setSelectedCharKeys] = useState<Set<string>>(
    new Set(characters.map((c) => c.char_key))
  );

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const lockedChars = characters.filter((c) => c.locked);

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

  function toggleChar(key: string) {
    setSelectedCharKeys((prev) => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }

  function generateJson() {
    if (!script.trim() || script.trim().length < 10) {
      toast.error("스크립트를 입력하세요.");
      return;
    }
    startTransition(async () => {
      try {
        const initRes = await fetch("/api/webtoon/episode/new", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ webtoonId, episodeNumber, title: epTitle.trim() }),
        });
        if (!initRes.ok) throw new Error((await initRes.json()).error ?? "에피소드 생성 실패");
        const { episodeId: newEpId } = await initRes.json();
        setEpisodeId(newEpId);

        const genRes = await fetch("/api/generate/json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            script,
            webtoonId,
            episodeId: newEpId,
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
          const job = await pollRes.json() as { status: string; error?: string; storyJson?: unknown };
          if (job.status === "done") {
            if (!job.storyJson) throw new Error("스토리보드 데이터가 없습니다.");
            setStoryJson(job.storyJson as import("@/lib/ai/story-schema").StoryJson);
            toast.success("스토리보드 생성 완료! 씬·컷을 검토하세요.");
            setStep("review");
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

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={handleBack} className="gap-1">
          <ChevronLeft className="h-4 w-4" />
          {webtoonTitle}
        </Button>
        <span className="text-muted-foreground">·</span>
        <span className="text-sm font-medium">{episodeNumber}화 추가</span>
      </div>

      {/* 생성 중 이탈 확인 다이얼로그 */}
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

      {/* 단계 표시 */}
      <div className="flex items-center gap-2 overflow-x-auto">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2 shrink-0">
            <div className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold border-2 transition-colors",
              i < stepIndex ? "bg-primary border-primary text-primary-foreground"
                : i === stepIndex ? "border-primary text-primary"
                : "border-muted-foreground/30 text-muted-foreground/50"
            )}>
              {i < stepIndex ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <span className={cn("text-sm", i === stepIndex ? "font-medium" : "text-muted-foreground")}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={cn("h-px w-6", i < stepIndex ? "bg-primary" : "bg-border")} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: 스크립트 입력 */}
      {step === "input" && (
        <div className="space-y-5">
          {/* 기획안 표시 */}
          {projectBrief && (
            <div className="rounded-lg border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 p-4 text-sm">
              <p className="font-medium text-blue-700 dark:text-blue-300 mb-1">📋 기획안 적용 중</p>
              <p className="text-blue-600 dark:text-blue-400 text-xs line-clamp-2">{projectBrief}</p>
            </div>
          )}

          {/* 이번 화 등장 캐릭터 선택 */}
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
            <Label htmlFor="ep-title">화 제목</Label>
            <Input id="ep-title" value={epTitle} onChange={(e) => setEpTitle(e.target.value)}
              placeholder={`${episodeNumber}화`} maxLength={60} disabled={pending} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="script">이번 화 소설/스크립트 *</Label>
            <Textarea id="script" value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="이번 화에 해당하는 소설 텍스트를 붙여넣으세요."
              rows={14} className="font-mono text-sm resize-y" disabled={pending} />
            <p className="text-xs text-muted-foreground text-right">{script.trim().length.toLocaleString()}자</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">씬/컷 분석 엔진</Label>
            <Select value={textProvider} onValueChange={(v) => setTextProvider(v as "gemini" | "openai")} disabled={pending}>
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

          {!pending && (
            <Button onClick={generateJson}
              disabled={script.trim().length < 10 || credits < CREDIT_COST.generateJson}
              size="lg" className="w-full gap-2">
              <Sparkles className="h-4 w-4" />
              스토리보드 생성 ({CREDIT_COST.generateJson} 크레딧)
            </Button>
          )}

          {pending && (
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
      )}

      {/* Step 2: 씬·컷 검토 */}
      {step === "review" && storyJson && episodeId && (
        <StoryReview
          storyJson={storyJson}
          episodeId={episodeId}
          webtoonId={webtoonId}
          onComplete={(updated) => { setStoryJson(updated); setStep("references"); }}
          onSavedBack={() => router.push(`/studio/${webtoonId}`)}
        />
      )}

      {/* Step 3: 레퍼런스 이미지 생성 */}
      {step === "references" && storyJson && episodeId && (
        <EpisodeReferences
          storyJson={storyJson}
          webtoonId={webtoonId}
          episodeId={episodeId}
          onComplete={() => setStep("cuts")}
        />
      )}

      {/* Step 4: 컷 이미지 생성 */}
      {step === "cuts" && episodeId && storyJson && (
        <div className="space-y-4">
          <CutsPhase
            storyJson={storyJson}
            webtoonId={webtoonId}
            episodeId={episodeId}
            onGeneratingChange={(generating, jobId) => {
              setIsGenerating(generating);
              setGeneratingJobId(jobId);
            }}
          />
        </div>
      )}
    </div>
  );
}
