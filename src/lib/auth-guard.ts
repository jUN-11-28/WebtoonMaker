/**
 * 서버 액션 / Route Handler 공통 인증·권한 가드.
 * 모든 생성 엔드포인트에서 반드시 호출.
 */
import { createClient, createServiceClient } from "@/lib/supabase/server";

export class AuthError extends Error {
  constructor(
    public readonly code: "UNAUTHENTICATED" | "NOT_APPROVED" | "INSUFFICIENT_CREDITS" | "FORBIDDEN",
    message: string
  ) {
    super(message);
  }
}

export interface UserContext {
  userId: string;
  credits: number;
  isApproved: boolean;
  role: "user" | "admin";
}

/** 인증 + 승인 + 크레딧 검증. 실패 시 AuthError throw. */
export async function requireCreator(minCredits = 1): Promise<UserContext> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError("UNAUTHENTICATED", "로그인이 필요합니다.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("credits, is_approved, role")
    .eq("id", user.id)
    .single();

  const p = profile as { credits: number; is_approved: boolean; role: string } | null;
  if (!p) throw new AuthError("UNAUTHENTICATED", "프로필을 찾을 수 없습니다.");
  if (!p.is_approved) throw new AuthError("NOT_APPROVED", "관리자 승인 대기 중입니다.");
  if (p.credits < minCredits)
    throw new AuthError("INSUFFICIENT_CREDITS", `크레딧이 부족합니다. (필요: ${minCredits})`);

  return {
    userId: user.id,
    credits: p.credits,
    isApproved: p.is_approved,
    role: p.role as "user" | "admin",
  };
}

/** 크레딧 차감 (원자적 RPC). 실패 시 예외. */
export async function deductCredits(userId: string, amount: number): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.rpc("adjust_credits", {
    target_user_id: userId,
    delta: -amount,
  });
  if (error) throw new Error(`크레딧 차감 실패: ${error.message}`);
}

/** 크레딧 환불 (생성 실패 시). */
export async function refundCredits(userId: string, amount: number): Promise<void> {
  const svc = createServiceClient();
  await svc.rpc("adjust_credits", { target_user_id: userId, delta: amount });
}
