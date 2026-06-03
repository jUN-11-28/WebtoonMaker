"use client";

import { useState, useTransition } from "react";
import { getErrorMessage } from "@/lib/safe-fetch";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ChevronDown, ChevronUp } from "lucide-react";

export function NewProjectForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [artStyle, setArtStyle] = useState("");
  const [brief, setBrief] = useState("");
  const [showBrief, setShowBrief] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/webtoon/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            artStyle: artStyle.trim() || null,
            brief: brief.trim() || null,
          }),
        });
        if (!res.ok) throw new Error(await getErrorMessage(res, "생성 실패"));
        const { webtoonId } = await res.json();
        toast.success("프로젝트가 생성되었습니다!");
        router.push(`/studio/${webtoonId}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "오류가 발생했습니다.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="title">웹툰 제목 *</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 나는 귀족이다" maxLength={60} required disabled={pending} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="desc">작품 소개 <span className="text-muted-foreground text-xs">(선택)</span></Label>
        <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)}
          placeholder="간단한 줄거리나 분위기" rows={2} disabled={pending} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="style">화풍/스타일 <span className="text-muted-foreground text-xs">(선택)</span></Label>
        <Input id="style" value={artStyle} onChange={(e) => setArtStyle(e.target.value)}
          placeholder="예: 세미리얼, 어두운 판타지, 순정 만화체" disabled={pending} />
      </div>

      {/* 기획안 — 접기/펼치기 */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setShowBrief((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          {showBrief ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          기획안 첨부 <span className="text-xs font-normal">(선택 — AI가 화 생성 시 참고)</span>
        </button>
        {showBrief && (
          <div className="space-y-1.5">
            <Textarea
              id="brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder={`세계관 설정, 주요 등장인물 소개, 전체 줄거리 개요 등을 자유롭게 작성하세요.\n각 화(話) 생성 시 AI가 이 내용을 바탕으로 씬을 구성합니다.\n\n예시:\n- 배경: 근미래 한국, 능력자가 존재하는 세계\n- 주인공 이준혁: 25세, 잠재된 능력 보유...\n- 전체 스토리: 1화 - 능력 각성, 2화 - 첫 번째 시련...`}
              rows={10}
              className="text-sm"
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              최대한 자세히 작성할수록 일관성 있는 웹툰이 생성됩니다. 나중에 대시보드에서 수정 가능합니다.
            </p>
          </div>
        )}
      </div>

      <Button type="submit" disabled={!title.trim() || pending} className="w-full" size="lg">
        {pending ? "생성 중..." : "프로젝트 만들기 →"}
      </Button>
    </form>
  );
}
