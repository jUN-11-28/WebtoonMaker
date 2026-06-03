"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScriptInput } from "./script-input";
import { StoryEditor } from "./story-editor";
import { ReferencesPhase } from "./references-phase";
import { CutsPhase } from "./cuts-phase";
import type { StoryJson } from "@/lib/ai/story-schema";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

const STEPS = [
  { id: "input", label: "① 입력" },
  { id: "review", label: "② JSON 검토" },
  { id: "references", label: "③ 레퍼런스" },
  { id: "generate", label: "④ 컷 생성" },
];

interface CreateWorkflowProps {
  userId: string;
  credits: number;
}

export function CreateWorkflow({ userId, credits }: CreateWorkflowProps) {
  const [step, setStep] = useState<"input" | "review" | "references" | "generate">("input");
  const [webtoonId, setWebtoonId] = useState<string | null>(null);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [storyJson, setStoryJson] = useState<StoryJson | null>(null);

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="space-y-6">
      {/* 진행 단계 표시 */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2 shrink-0">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold border-2 transition-colors",
                i < stepIndex
                  ? "bg-primary border-primary text-primary-foreground"
                  : i === stepIndex
                  ? "border-primary text-primary"
                  : "border-muted-foreground/30 text-muted-foreground/50"
              )}
            >
              {i < stepIndex ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <span
              className={cn(
                "text-sm",
                i === stepIndex ? "font-medium" : "text-muted-foreground"
              )}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={cn(
                "h-px w-8 transition-colors",
                i < stepIndex ? "bg-primary" : "bg-border"
              )} />
            )}
          </div>
        ))}
      </div>

      {/* 단계별 콘텐츠 */}
      {step === "input" && (
        <ScriptInput
          userId={userId}
          credits={credits}
          onComplete={(wId, eId, json) => {
            setWebtoonId(wId);
            setEpisodeId(eId);
            setStoryJson(json);
            setStep("review");
          }}
        />
      )}
      {step === "review" && storyJson && episodeId && webtoonId && (
        <StoryEditor
          initialJson={storyJson}
          episodeId={episodeId}
          onConfirm={(json) => {
            setStoryJson(json);
            setStep("references");
          }}
          onBack={() => setStep("input")}
        />
      )}
      {step === "references" && storyJson && episodeId && webtoonId && (
        <ReferencesPhase
          storyJson={storyJson}
          webtoonId={webtoonId}
          episodeId={episodeId}
          onComplete={() => setStep("generate")}
          onBack={() => setStep("review")}
        />
      )}
      {step === "generate" && episodeId && webtoonId && storyJson && (
        <CutsPhase
          storyJson={storyJson}
          webtoonId={webtoonId}
          episodeId={episodeId}
        />
      )}
    </div>
  );
}
