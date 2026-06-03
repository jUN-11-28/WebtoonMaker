import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getVoterHash, ensureAnonCookie } from "@/lib/voter";
import type { TargetType } from "@/lib/supabase/types";

const VALID_TYPES: TargetType[] = ["webtoon", "episode", "cut"];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { target_type, target_id } = body ?? {};

  if (!VALID_TYPES.includes(target_type) || typeof target_id !== "string") {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }

  const voterHash = await getVoterHash(req.headers);
  const svc = createServiceClient();

  const { data: liked, error } = await svc.rpc("toggle_like", {
    p_target_type: target_type,
    p_target_id: target_id,
    p_voter_hash: voterHash,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 좋아요 수 재조회
  const { count } = await svc
    .from("likes")
    .select("*", { count: "exact", head: true })
    .eq("target_type", target_type)
    .eq("target_id", target_id);

  const res = NextResponse.json({ liked, count: count ?? 0 });

  // 익명 방문자 쿠키가 없으면 발급
  const newVid = ensureAnonCookie(req.headers.get("cookie"));
  if (newVid) {
    res.cookies.set("anon_vid", newVid, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1년
      path: "/",
    });
  }

  return res;
}
