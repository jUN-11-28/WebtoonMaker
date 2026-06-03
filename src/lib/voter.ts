import { createHash } from "crypto";
import { cookies } from "next/headers";
import { v4 as uuidv4 } from "uuid";

const SALT = process.env.IP_HASH_SALT ?? "default-salt-change-me";
const COOKIE_NAME = "anon_vid"; // anonymous visitor id

/**
 * IP + UA 기반 voter_hash 생성 (서버 전용).
 * NAT/공유 IP로 인해 완벽한 식별은 불가능 — best-effort.
 * IP는 평문 저장 없이 해시만 사용.
 */
export function buildVoterHash(ip: string, ua: string): string {
  return createHash("sha256")
    .update(`${SALT}:${ip}:${ua}`)
    .digest("hex");
}

/** 요청 헤더에서 실제 IP 추출 (Vercel / 일반 프록시 지원) */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-real-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/**
 * 최종 voter_hash: IP해시 OR 쿠키 익명토큰 중 더 안정적인 것 사용.
 * 쿠키가 있으면 쿠키 우선(IP 변동 대응).
 */
export async function getVoterHash(headers: Headers): Promise<string> {
  const ip = getClientIp(headers);
  const ua = headers.get("user-agent") ?? "";
  const ipHash = buildVoterHash(ip, ua);

  try {
    const cookieStore = await cookies();
    const vid = cookieStore.get(COOKIE_NAME)?.value;
    if (vid) return createHash("sha256").update(`${SALT}:${vid}`).digest("hex");
  } catch {
    // Route Handler 밖에서 호출된 경우 IP 해시로 폴백
  }

  return ipHash;
}

/** 익명 방문자 토큰을 쿠키에 발급 (없을 때만). 클라이언트 컴포넌트에서 호출. */
export function ensureAnonCookie(cookieHeader: string | null): string | null {
  // 이미 있으면 null 반환 (새로 발급 불필요)
  if (cookieHeader?.includes(COOKIE_NAME)) return null;
  return uuidv4();
}
