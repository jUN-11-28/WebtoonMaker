"use client";

import { useState, useEffect, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MessageSquare, Send, Trash2 } from "lucide-react";

interface Comment {
  id: string;
  body: string;
  author_id: string | null;
  nickname: string | null;
  created_at: string;
}

interface CommentSectionProps {
  targetType: "webtoon" | "episode" | "cut";
  targetId: string;
  authorId?: string | null;
  displayName?: string | null;
}

export function CommentSection({ targetType, targetId, authorId, displayName }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [nickname, setNickname] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/comments?target_type=${targetType}&target_id=${targetId}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((d) => setComments(d.comments ?? []))
      .catch(() => {});
    return () => controller.abort();
  }, [targetType, targetId]);

  async function handleDelete(commentId: string) {
    try {
      const res = await fetch(`/api/comments/${commentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "삭제 실패");
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "삭제 실패");
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_type: targetType,
            target_id: targetId,
            body: body.trim(),
            nickname: nickname.trim() || "익명",
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "오류");
        setComments((prev) => [...prev, data.comment]);
        setBody("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "잠시 후 다시 시도해 주세요.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <h3 className="flex items-center gap-2 font-semibold text-base">
        <MessageSquare className="h-4 w-4" />
        댓글 {comments.length > 0 && <span className="text-muted-foreground font-normal text-sm">{comments.length}개</span>}
      </h3>

      {/* 댓글 목록 */}
      <div className="space-y-3">
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            첫 댓글을 남겨보세요!
          </p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="rounded-lg border bg-card px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{c.nickname ?? "익명"}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleString("ko-KR", {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                  {authorId && c.author_id === authorId && (
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm whitespace-pre-wrap">{c.body}</p>
            </div>
          ))
        )}
      </div>

      {/* 댓글 작성 */}
      <form onSubmit={handleSubmit} className="space-y-2">
        {authorId ? (
          <p className="text-xs text-muted-foreground">{displayName ?? "회원"}으로 작성</p>
        ) : (
          <Input
            placeholder="닉네임 (선택)"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
            className="h-9"
          />
        )}
        <div className="flex gap-2">
          <Textarea
            placeholder="댓글을 입력하세요..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={2}
            className="resize-none"
            disabled={pending}
          />
          <Button
            type="submit"
            size="icon"
            disabled={pending || !body.trim()}
            className="shrink-0 self-end"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground text-right">{body.length}/2000</p>
      </form>
    </div>
  );
}
