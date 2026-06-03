"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FileText, ChevronDown, ChevronUp, Save } from "lucide-react";

interface BriefEditorProps {
  webtoonId: string;
  initialBrief: string;
}

export function BriefEditor({ webtoonId, initialBrief }: BriefEditorProps) {
  const [open, setOpen] = useState(!!initialBrief);
  const [brief, setBrief] = useState(initialBrief);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/webtoon/${webtoonId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brief: brief.trim() || null }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        toast.success("기획안이 저장되었습니다.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "저장 실패");
      }
    });
  }

  return (
    <section className="rounded-xl border bg-card p-5 space-y-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full"
      >
        <h2 className="font-semibold flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4" />
          프로젝트 기획안
          {brief && <span className="text-xs font-normal text-green-600 dark:text-green-400">저장됨</span>}
          {!brief && <span className="text-xs font-normal text-muted-foreground">(없음 — AI가 스크립트만 참고)</span>}
        </h2>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="space-y-2">
          <Textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder={`세계관 설정, 주요 등장인물, 전체 줄거리 개요 등을 자유롭게 작성하세요.\n각 화 생성 시 AI가 이 내용을 바탕으로 씬을 구성합니다.\n\n예시:\n- 배경: 근미래 한국, 능력자 존재\n- 주인공: 이준혁(25세, 잠재 능력자)...\n- 스토리: 1화-각성, 2화-첫 대결...`}
            rows={8}
            className="text-sm"
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">
            자세히 작성할수록 각 화의 일관성이 높아집니다.
          </p>
          <Button size="sm" onClick={save} disabled={pending} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            {pending ? "저장 중..." : "저장"}
          </Button>
        </div>
      )}
    </section>
  );
}
