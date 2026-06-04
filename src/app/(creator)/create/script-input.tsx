"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Sparkles, Coins, Loader2 } from "lucide-react";
import { CREDIT_COST, estimateTotalCost } from "@/lib/credits";
import type { StoryJson } from "@/lib/ai/story-schema";

async function pollJob(jobId: string, onProgress?: (msg: string) => void): Promise<StoryJson> {
  const INTERVAL = 2500;
  const TIMEOUT = 5 * 60 * 1000;
  const start = Date.now();

  while (Date.now() - start < TIMEOUT) {
    await new Promise((r) => setTimeout(r, INTERVAL));
    const res = await fetch(`/api/jobs/${jobId}`);
    if (!res.ok) throw new Error("Job 상태 조회 실패");
    const job = await res.json() as { status: string; error?: string; storyJson?: StoryJson };
    if (job.status === "done") {
      if (!job.storyJson) throw new Error("스토리보드 데이터가 없습니다.");
      return job.storyJson;
    }
    if (job.status === "failed") throw new Error(job.error ?? "JSON 생성 실패");
    onProgress?.("스토리보드 생성 중...");
  }
  throw new Error("생성 시간 초과. 나중에 다시 시도하세요.");
}

interface ScriptInputProps {
  userId: string;
  credits: number;
  onComplete: (webtoonId: string, episodeId: string, json: StoryJson) => void;
}

export function ScriptInput({ credits, onComplete }: ScriptInputProps) {
  const [pending, startTransition] = useTransition();
  const [script, setScript] = useState("");
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState<"gemini" | "openai">("openai");
  const [statusMsg, setStatusMsg] = useState("");

  const scriptLen = script.trim().length;
  const isReady = title.trim().length >= 1 && scriptLen >= 50;

  function handleGenerate() {
    if (!isReady) return;
    startTransition(async () => {
      try {
        setStatusMsg("웹툰 초기화 중...");

        // 1. 웹툰 + 에피소드 생성
        const initRes = await fetch("/api/webtoon/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim(), provider }),
        });
        if (!initRes.ok) {
          const d = await initRes.json();
          throw new Error(d.error ?? "초기화 실패");
        }
        const { webtoonId } = await initRes.json();

        const epRes = await fetch("/api/webtoon/episode/new", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ webtoonId, episodeNumber: 1, title: "1화" }),
        });
        if (!epRes.ok) throw new Error((await epRes.json()).error ?? "에피소드 생성 실패");
        const { episodeId } = await epRes.json();

        // 2. story_json 생성 job 시작
        setStatusMsg("스토리보드 생성 중...");
        const genRes = await fetch("/api/generate/json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ script, webtoonId, episodeId }),
        });
        if (!genRes.ok) {
          const d = await genRes.json();
          throw new Error(d.error ?? "JSON 생성 실패");
        }
        const { jobId } = await genRes.json();

        // 3. job 완료 대기
        const storyJson = await pollJob(jobId, setStatusMsg);
        setStatusMsg("");
        toast.success("스토리보드 JSON이 생성되었습니다!");
        onComplete(webtoonId, episodeId, storyJson);
      } catch (e) {
        setStatusMsg("");
        toast.error(e instanceof Error ? e.message : "생성 중 오류가 발생했습니다.");
      }
    });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-2">
        <Label htmlFor="title">웹툰 제목</Label>
        <Input
          id="title"
          placeholder="내 웹툰 제목"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={60}
          disabled={pending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="script">소설 / 스크립트</Label>
        <Textarea
          id="script"
          placeholder="소설 원고나 시나리오 스크립트를 붙여넣으세요. AI가 자동으로 씬과 컷을 분석해 스토리보드 JSON을 만들어 드립니다."
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={14}
          className="resize-y font-mono text-sm"
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground text-right">{scriptLen.toLocaleString()}자</p>
      </div>

      <div className="space-y-2">
        <Label>이미지 생성 엔진</Label>
        <Select value={provider} onValueChange={(v) => setProvider(v as "gemini" | "openai")}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="openai">OpenAI gpt-image-2 (기본)</SelectItem>
            <SelectItem value="gemini">Gemini (레퍼런스 다수 지원)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 비용 안내 */}
      <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-1">
        <p className="font-medium flex items-center gap-1.5">
          <Coins className="h-4 w-4" />
          크레딧 안내
        </p>
        <p className="text-muted-foreground">
          · JSON 생성: {CREDIT_COST.generateJson} 크레딧
        </p>
        <p className="text-muted-foreground">
          · 레퍼런스/컷 이미지: 각 {CREDIT_COST.generateReference} 크레딧 (다음 단계에서 확인)
        </p>
        <p className="text-muted-foreground">
          보유 크레딧: <strong className="text-foreground">{credits}</strong>
        </p>
      </div>

      <Button
        onClick={handleGenerate}
        disabled={!isReady || pending || credits < CREDIT_COST.generateJson}
        size="lg"
        className="gap-2"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {pending ? (statusMsg || "스토리보드 생성 중...") : `스토리보드 생성 (${CREDIT_COST.generateJson} 크레딧)`}
      </Button>
    </div>
  );
}
