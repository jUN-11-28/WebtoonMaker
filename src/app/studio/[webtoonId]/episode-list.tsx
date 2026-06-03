"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ExternalLink, Trash2, Loader2 } from "lucide-react";

interface Episode {
  id: string;
  episode_number: number;
  title: string;
  status: string;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "초안", generating: "생성 중", ready: "완료", failed: "실패",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary", generating: "outline", ready: "default", failed: "destructive",
};

export function EpisodeList({ episodes, webtoonId }: { episodes: Episode[]; webtoonId: string }) {
  const router = useRouter();
  const [deletingEp, setDeletingEp] = useState<Episode | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmDelete(ep: Episode) {
    setDeletingEp(ep);
  }

  function handleDelete() {
    if (!deletingEp) return;
    const ep = deletingEp;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/episodes/${ep.id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "삭제 실패");
        }
        toast.success(`${ep.episode_number}화 "${ep.title}"이(가) 삭제되었습니다.`);
        setDeletingEp(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "삭제 중 오류가 발생했습니다.");
      }
    });
  }

  if (episodes.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed py-14 text-center text-muted-foreground">
        <p className="font-medium">아직 화가 없습니다</p>
        <p className="text-sm mt-1">소설 텍스트를 입력해 첫 화를 생성하세요</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {episodes.map((ep) => (
          <div
            key={ep.id}
            className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm font-mono text-muted-foreground w-8 shrink-0">{ep.episode_number}화</span>
              <span className="text-sm font-medium truncate">{ep.title}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Badge variant={STATUS_VARIANT[ep.status] ?? "secondary"} className="text-xs">
                {STATUS_LABEL[ep.status] ?? ep.status}
              </Badge>
              {ep.status === "ready" && (
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild>
                  <Link href={`/w/${webtoonId}/${ep.id}`} target="_blank">
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 text-xs" asChild>
                <Link href={`/studio/${webtoonId}/episodes/${ep.id}`}>편집</Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => confirmDelete(ep)}
                title="에피소드 삭제"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!deletingEp} onOpenChange={(v) => !pending && !v && setDeletingEp(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>에피소드 삭제</DialogTitle>
            <DialogDescription>
              이 작업은 되돌릴 수 없습니다. 생성된 컷 이미지를 포함한 모든 데이터가 삭제됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {deletingEp && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                <strong>{deletingEp.episode_number}화 "{deletingEp.title}"</strong>의 모든 컷 이미지와 스토리보드가 삭제됩니다.
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeletingEp(null)} disabled={pending}>
                취소
              </Button>
              <Button variant="destructive" className="flex-1 gap-1.5" onClick={handleDelete} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {pending ? "삭제 중..." : "삭제"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
