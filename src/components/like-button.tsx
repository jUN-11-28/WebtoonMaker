"use client";

import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface LikeButtonProps {
  targetType: "webtoon" | "episode" | "cut";
  targetId: string;
  initialCount: number;
}

export function LikeButton({ targetType, targetId, initialCount }: LikeButtonProps) {
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/likes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_type: targetType, target_id: targetId }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setLiked(data.liked);
        setCount(data.count);
      } catch {
        toast.error("잠시 후 다시 시도해 주세요.");
      }
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      disabled={pending}
      className={cn(
        "gap-2 transition-colors",
        liked && "border-rose-400 text-rose-500 hover:text-rose-500"
      )}
    >
      <Heart className={cn("h-4 w-4", liked && "fill-rose-500 text-rose-500")} />
      <span>{count}</span>
    </Button>
  );
}
