"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageLightboxProps {
  src: string;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  className?: string;
  objectFit?: "cover" | "contain";
  /** fill 사용 시 필수 — 컨텍스트에 맞게 전달 */
  sizes?: string;
  /** 화면에 즉시 보이는 LCP 이미지에 true */
  priority?: boolean;
}

export function ImageLightbox({
  src,
  alt,
  fill,
  width,
  height,
  className,
  objectFit = "cover",
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
  priority = false,
}: ImageLightboxProps) {
  const [open, setOpen] = useState(false);

  // Escape 키로 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // 스크롤 잠금
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* 트리거 */}
      <button
        onClick={() => setOpen(true)}
        className={cn("group relative block w-full h-full cursor-zoom-in", className)}
        aria-label="이미지 확대"
      >
        {fill ? (
          <Image
            src={src} alt={alt} fill
            sizes={sizes}
            priority={priority}
            className={cn("transition-transform duration-300 group-hover:scale-105", objectFit === "cover" ? "object-cover" : "object-contain")}
          />
        ) : (
          <Image
            src={src} alt={alt} width={width!} height={height!}
            priority={priority}
            className={cn("transition-transform duration-300 group-hover:scale-105", objectFit === "cover" ? "object-cover" : "object-contain")}
          />
        )}
        {/* hover 오버레이 */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <ZoomIn className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
        </div>
      </button>

      {/* 라이트박스 오버레이 */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-[fade-in_0.15s_ease-out]"
          onClick={() => setOpen(false)}
        >
          {/* 닫기 버튼 */}
          <button
            className="absolute top-4 right-4 rounded-full bg-white/10 hover:bg-white/20 p-2 text-white transition-colors"
            onClick={() => setOpen(false)}
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>

          {/* 이미지 */}
          <div
            className="relative max-w-[90vw] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={src}
              alt={alt}
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />
            {alt && (
              <p className="absolute bottom-0 left-0 right-0 text-center text-white/70 text-xs py-2 bg-black/40 rounded-b-lg">
                {alt}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
