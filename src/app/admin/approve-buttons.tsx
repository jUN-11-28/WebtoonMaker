"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { approveUser, rejectUser } from "./actions";
import { toast } from "sonner";

export function ApproveButtons({ userId }: { userId: string }) {
  const [pending, startTransition] = useTransition();

  function handleApprove() {
    startTransition(async () => {
      try {
        await approveUser(userId);
        toast.success("승인되었습니다.");
      } catch {
        toast.error("처리 중 오류가 발생했습니다.");
      }
    });
  }

  function handleReject() {
    startTransition(async () => {
      try {
        await rejectUser(userId);
        toast.info("거절되었습니다.");
      } catch {
        toast.error("처리 중 오류가 발생했습니다.");
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Button size="sm" disabled={pending} onClick={handleApprove}>
        승인
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={handleReject}>
        거절
      </Button>
    </div>
  );
}
