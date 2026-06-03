"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import type { StoryJson } from "@/lib/ai/story-schema";

interface StoryEditorProps {
  initialJson: StoryJson;
  episodeId: string;
  onConfirm: (json: StoryJson) => void;
  onBack: () => void;
}

export function StoryEditor({ initialJson, episodeId, onConfirm, onBack }: StoryEditorProps) {
  const [raw, setRaw] = useState(() => JSON.stringify(initialJson, null, 2));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function validate(): StoryJson | null {
    try {
      const parsed = JSON.parse(raw) as StoryJson;
      if (!parsed.scenes || !parsed.character_bible) {
        throw new Error("scenes 또는 character_bible 필드가 없습니다.");
      }
      setError(null);
      return parsed;
    } catch (e) {
      setError(e instanceof Error ? e.message : "JSON 파싱 오류");
      return null;
    }
  }

  async function handleConfirm() {
    const parsed = validate();
    if (!parsed) return;

    setSaving(true);
    try {
      // 수정된 JSON을 서버에 저장
      const res = await fetch(`/api/episodes/${episodeId}/story-json`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyJson: parsed }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "저장 실패");
      }
      toast.success("스토리보드가 저장되었습니다.");
      onConfirm(parsed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "저장 중 오류");
    } finally {
      setSaving(false);
    }
  }

  const totalCuts = (() => {
    try {
      const p = JSON.parse(raw) as StoryJson;
      return p.scenes?.reduce((sum, s) => sum + (s.cuts?.length ?? 0), 0) ?? 0;
    } catch {
      return 0;
    }
  })();

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="font-medium mb-1">스토리보드 JSON 검토</p>
        <p className="text-muted-foreground">
          AI가 생성한 JSON을 직접 수정할 수 있습니다.
          character_bible의 <code className="text-xs bg-muted rounded px-1">visual_core</code>와 각 컷의{" "}
          <code className="text-xs bg-muted rounded px-1">visual_prompt</code>가 이미지 생성에 그대로 사용됩니다.
        </p>
        <p className="mt-1 text-muted-foreground">
          총 <strong className="text-foreground">{totalCuts}컷</strong> · 다음 단계에서 레퍼런스 이미지를 생성합니다.
        </p>
      </div>

      <Textarea
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setError(null);
        }}
        rows={28}
        className="font-mono text-xs resize-y"
        spellCheck={false}
      />

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          뒤로
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => validate()} disabled={saving}>
            JSON 유효성 검사
          </Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving ? "저장 중..." : "확인 후 레퍼런스 생성"}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
