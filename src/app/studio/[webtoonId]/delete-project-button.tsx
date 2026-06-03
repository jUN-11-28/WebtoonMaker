"use client";

import { useState, useTransition } from "react";
import { getErrorMessage } from "@/lib/safe-fetch";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

interface DeleteProjectButtonProps {
  webtoonId: string;
  webtoonTitle: string;
}

export function DeleteProjectButton({ webtoonId, webtoonTitle }: DeleteProjectButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      try {
        const res = await fetch(`/api/webtoon/${webtoonId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await getErrorMessage(res, "삭제 실패"));
        toast.success("프로젝트가 삭제되었습니다.");
        router.push("/studio");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "삭제 중 오류가 발생했습니다.");
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-destructive hover:text-destructive border-destructive/30 hover:border-destructive/60"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4 mr-1" />삭제
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); setConfirm(""); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>프로젝트 삭제</DialogTitle>
            <DialogDescription>
              이 작업은 되돌릴 수 없습니다. 모든 에피소드, 캐릭터, 컷 이미지가 함께 삭제됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              <strong>"{webtoonTitle}"</strong>와 관련된 모든 데이터가 삭제됩니다.
            </div>
            <div className="space-y-1.5">
              <p className="text-sm text-muted-foreground">
                확인을 위해 프로젝트 제목을 입력하세요:
              </p>
              <Input
                placeholder={webtoonTitle}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setOpen(false); setConfirm(""); }}
                disabled={pending}
              >
                취소
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={confirm !== webtoonTitle || pending}
                onClick={handleDelete}
              >
                {pending ? "삭제 중..." : "삭제"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
