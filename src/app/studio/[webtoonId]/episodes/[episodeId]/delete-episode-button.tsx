"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Loader2 } from "lucide-react";

interface DeleteEpisodeButtonProps {
  episodeId: string;
  webtoonId: string;
  episodeTitle: string;
}

export function DeleteEpisodeButton({ episodeId, webtoonId, episodeTitle }: DeleteEpisodeButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/episodes/${episodeId}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "삭제 실패");
        }
        toast.success("에피소드가 삭제되었습니다.");
        router.push(`/studio/${webtoonId}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "삭제 중 오류가 발생했습니다.");
      }
    });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4 mr-1" />삭제
      </Button>

      <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>에피소드 삭제</DialogTitle>
            <DialogDescription>
              이 작업은 되돌릴 수 없습니다. 생성된 컷 이미지를 포함한 모든 데이터가 삭제됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              <strong>"{episodeTitle}"</strong>의 모든 컷 이미지와 스토리보드가 삭제됩니다.
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                취소
              </Button>
              <Button
                variant="destructive"
                className="flex-1 gap-1.5"
                disabled={pending}
                onClick={handleDelete}
              >
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
