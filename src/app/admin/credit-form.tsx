"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adjustCredits } from "./actions";
import { toast } from "sonner";

export function CreditForm({
  userId,
  currentCredits,
}: {
  userId: string;
  currentCredits: number;
}) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const delta = parseInt(value, 10);
    if (isNaN(delta) || delta === 0) {
      toast.error("유효한 숫자를 입력하세요 (0 제외)");
      return;
    }
    if (delta < 0 && currentCredits + delta < 0) {
      toast.error("크레딧이 부족합니다.");
      return;
    }
    startTransition(async () => {
      try {
        await adjustCredits(userId, delta);
        toast.success(`크레딧 ${delta > 0 ? "+" : ""}${delta} 완료`);
        setValue("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "오류가 발생했습니다.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5 justify-end">
      <Input
        type="number"
        placeholder="+10 / -5"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-24 h-8 text-sm text-right"
        disabled={pending}
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        적용
      </Button>
    </form>
  );
}
