"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface GeneratingOverlayProps {
  messages: string[];
  className?: string;
}

/** 단계별 메시지를 순환하며 보여주는 생성 중 인디케이터 */
export function GeneratingOverlay({ messages, className }: GeneratingOverlayProps) {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // 각 메시지를 2.4초씩 보여주고 fade 전환
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % messages.length);
        setVisible(true);
      }, 300);
    }, 2400);
    return () => clearInterval(interval);
  }, [messages.length]);

  return (
    <div className={cn("flex flex-col items-center justify-center gap-5 py-14", className)}>
      {/* 빙글빙글 원형 스피너 */}
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 rounded-full border-4 border-muted" />
        <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center text-lg">✨</div>
      </div>

      {/* 순환 메시지 */}
      <p
        className={cn(
          "text-sm font-medium text-center transition-opacity duration-300 max-w-xs",
          visible ? "opacity-100" : "opacity-0"
        )}
      >
        {messages[idx]}
      </p>

      {/* 점 애니메이션 */}
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

/** 컷 카드 스켈레톤 shimmer */
export function CutSkeleton() {
  return (
    <div className="rounded-lg border overflow-hidden animate-pulse">
      <div className="aspect-video bg-muted relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-shimmer" />
      </div>
      <div className="px-2 py-1.5 flex items-center justify-between gap-2">
        <div className="h-3 w-12 rounded bg-muted" />
        <div className="h-4 w-10 rounded-full bg-muted" />
      </div>
    </div>
  );
}
