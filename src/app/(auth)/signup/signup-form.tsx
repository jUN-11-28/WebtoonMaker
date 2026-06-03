"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

export function SignupForm() {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);

    const form = new FormData(e.currentTarget);
    const email = form.get("email") as string;
    const password = form.get("password") as string;
    const displayName = form.get("display_name") as string;

    if (password.length < 8) {
      toast.error("비밀번호는 8자 이상이어야 합니다.");
      setPending(false);
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: `${location.origin}/auth/confirm`,
      },
    });

    if (error) {
      toast.error(error.message);
      setPending(false);
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="rounded-lg border bg-muted/40 p-4 text-center text-sm">
        <p className="font-medium mb-1">가입 이메일을 확인하세요 ✉️</p>
        <p className="text-muted-foreground">
          이메일 인증 후 관리자 승인을 기다리면 웹툰 생성 기능이 열립니다.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="display_name">닉네임</Label>
        <Input
          id="display_name"
          name="display_name"
          type="text"
          placeholder="웹툰작가"
          required
          minLength={2}
          maxLength={30}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">이메일</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          autoComplete="email"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">비밀번호</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="8자 이상"
          autoComplete="new-password"
        />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "가입 중..." : "가입하기"}
      </Button>
    </form>
  );
}
