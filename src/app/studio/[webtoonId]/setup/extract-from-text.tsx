"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Wand2, Plus, Check, Users, MapPin } from "lucide-react";

interface ExtractedChar {
  char_key: string; name: string; visual_core: string;
  wardrobe: string; personality: string; expression: string;
}
interface ExtractedLoc { loc_key: string; name: string; description: string }

interface ExtractFromTextProps {
  webtoonId: string;
  onExtracted: (chars: ExtractedChar[], locs: ExtractedLoc[]) => void;
}

export function ExtractFromText({ webtoonId, onExtracted }: ExtractFromTextProps) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ characters: ExtractedChar[]; locations: ExtractedLoc[] } | null>(null);
  const [selected, setSelected] = useState<{ chars: Set<string>; locs: Set<string> }>({ chars: new Set(), locs: new Set() });
  const [pending, startTransition] = useTransition();
  const [adding, startAdding] = useTransition();

  function extract() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/webtoon/${webtoonId}/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        const data = await res.json();
        setResult(data);
        setSelected({
          chars: new Set(data.characters.map((c: ExtractedChar) => c.char_key)),
          locs: new Set(data.locations.map((l: ExtractedLoc) => l.loc_key)),
        });
        toast.success(`캐릭터 ${data.characters.length}명, 장소 ${data.locations.length}개 추출됨`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "추출 실패");
      }
    });
  }

  function addSelected() {
    if (!result) return;
    startAdding(async () => {
      const chars = result.characters.filter((c) => selected.chars.has(c.char_key));
      const locs = result.locations.filter((l) => selected.locs.has(l.loc_key));

      // DB 저장 후 실제 id가 포함된 객체 수집
      const savedChars: ExtractedChar[] = [];
      for (const c of chars) {
        const res = await fetch(`/api/webtoon/${webtoonId}/characters`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(c),
        });
        if (res.ok) {
          const { character } = await res.json();
          savedChars.push(character);
        }
      }
      const savedLocs: ExtractedLoc[] = [];
      for (const l of locs) {
        const res = await fetch(`/api/webtoon/${webtoonId}/locations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(l),
        });
        if (res.ok) {
          const { location } = await res.json();
          savedLocs.push(location);
        }
      }

      onExtracted(savedChars, savedLocs);
      toast.success(`${savedChars.length}명 캐릭터, ${savedLocs.length}개 장소가 추가되었습니다.`);
      setResult(null);
      setText("");
    });
  }

  function toggleChar(key: string) {
    setSelected((s) => {
      const next = new Set(s.chars);
      next.has(key) ? next.delete(key) : next.add(key);
      return { ...s, chars: next };
    });
  }
  function toggleLoc(key: string) {
    setSelected((s) => {
      const next = new Set(s.locs);
      next.has(key) ? next.delete(key) : next.add(key);
      return { ...s, locs: next };
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">소설 텍스트에서 캐릭터·장소 자동 추출</p>
        원고 앞부분을 붙여넣으면 AI가 등장인물과 장소를 추출합니다.
        추출 후 원하는 항목만 선택해서 프로젝트에 추가하세요.
      </div>

      <Textarea
        placeholder="소설 텍스트를 붙여넣으세요 (앞 8,000자가 분석됩니다)..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="font-mono text-sm"
        disabled={pending}
      />

      <Button onClick={extract} disabled={text.trim().length < 20 || pending} className="gap-2">
        <Wand2 className="h-4 w-4" />
        {pending ? "분석 중..." : "캐릭터·장소 추출"}
      </Button>

      {result && (
        <div className="space-y-5 rounded-xl border p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">추출 결과</h3>
            <p className="text-xs text-muted-foreground">추가할 항목을 선택하세요</p>
          </div>

          {result.characters.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Users className="h-4 w-4" />캐릭터 ({result.characters.length})
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {result.characters.map((c) => {
                  const on = selected.chars.has(c.char_key);
                  return (
                    <button key={c.char_key} onClick={() => toggleChar(c.char_key)}
                      className={`text-left rounded-lg border p-3 transition-colors text-sm ${on ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{c.char_key}</p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{c.visual_core}</p>
                        </div>
                        {on && <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {result.locations.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />장소 ({result.locations.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {result.locations.map((l) => {
                  const on = selected.locs.has(l.loc_key);
                  return (
                    <button key={l.loc_key} onClick={() => toggleLoc(l.loc_key)}
                      className={`rounded-lg border px-3 py-2 text-sm transition-colors flex items-center gap-1.5 ${on ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                      {on && <Check className="h-3 w-3 text-primary" />}
                      <span className="font-medium">{l.name}</span>
                      <span className="text-xs text-muted-foreground">({l.loc_key})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <Button onClick={addSelected}
            disabled={adding || (selected.chars.size === 0 && selected.locs.size === 0)}
            className="gap-2 w-full">
            <Plus className="h-4 w-4" />
            {adding ? "추가 중..." : `선택 항목 추가 (캐릭터 ${selected.chars.size}명 + 장소 ${selected.locs.size}개)`}
          </Button>
        </div>
      )}
    </div>
  );
}
