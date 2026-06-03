import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getVoterHash, ensureAnonCookie, getClientIp } from "@/lib/voter";
import type { TargetType } from "@/lib/supabase/types";

const VALID_TYPES: TargetType[] = ["webtoon", "episode", "cut"];
const RATE_LIMIT_WINDOW_MS = 60_000; // 1분
const RATE_LIMIT_MAX = 5; // 비회원 분당 5개
const BANNED_WORDS = ["스팸", "광고", "도박"]; // 최소 금칙어 예시

// 간단한 인메모리 rate limit (단일 인스턴스용; 프로덕션에선 Redis 권장)
const rateLimitMap = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(key) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  if (timestamps.length >= RATE_LIMIT_MAX) return true;
  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  return false;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const target_type = searchParams.get("target_type") as TargetType | null;
  const target_id = searchParams.get("target_id");

  if (!target_type || !target_id || !VALID_TYPES.includes(target_type)) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("comments")
    .select("id, body, author_id, nickname, created_at")
    .eq("target_type", target_type)
    .eq("target_id", target_id)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: data });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { target_type, target_id, body: commentBody, nickname } = body ?? {};

  if (
    !VALID_TYPES.includes(target_type) ||
    typeof target_id !== "string" ||
    typeof commentBody !== "string"
  ) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }

  const trimmed = commentBody.trim();
  if (trimmed.length < 1 || trimmed.length > 2000) {
    return NextResponse.json({ error: "댓글은 1~2000자입니다." }, { status: 400 });
  }

  // 금칙어 체크
  if (BANNED_WORDS.some((w) => trimmed.includes(w))) {
    return NextResponse.json({ error: "금칙어가 포함된 댓글입니다." }, { status: 400 });
  }

  const ip = getClientIp(req.headers);
  const voterHash = await getVoterHash(req.headers);

  // 회원인지 확인
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 비회원 rate limit (IP 기준)
  if (!user) {
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 429 });
    }
  }

  const svc = createServiceClient();

  let resolvedNickname: string | null = null;
  if (user) {
    const { data: profile } = await svc
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    resolvedNickname = (profile as { display_name: string | null } | null)?.display_name ?? "회원";
  } else {
    resolvedNickname = typeof nickname === "string" && nickname.trim() ? nickname.trim().slice(0, 20) : "익명";
  }

  const { data, error } = await svc
    .from("comments")
    .insert({
      target_type,
      target_id,
      body: trimmed,
      author_id: user?.id ?? null,
      voter_hash: user ? null : voterHash,
      nickname: resolvedNickname,
    })
    .select("id, body, author_id, nickname, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const res = NextResponse.json({ comment: data }, { status: 201 });

  const newVid = ensureAnonCookie(req.headers.get("cookie"));
  if (newVid) {
    res.cookies.set("anon_vid", newVid, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }

  return res;
}
