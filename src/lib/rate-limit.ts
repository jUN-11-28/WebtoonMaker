/**
 * 인메모리 rate limiter — 단일 인스턴스용.
 * 프로덕션 멀티 인스턴스 환경에서는 Redis/Upstash로 교체 권장.
 */
const store = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count += 1;
  const allowed = entry.count <= maxRequests;
  return {
    allowed,
    remaining: Math.max(0, maxRequests - entry.count),
    resetAt: entry.resetAt,
  };
}

/** 생성 엔드포인트 전용: 사용자당 분당 N회 */
const GENERATION_LIMIT = parseInt(
  process.env.RATE_LIMIT_GENERATION_PER_MINUTE ?? "5",
  10
);

export function checkGenerationLimit(userId: string) {
  return rateLimit(`gen:${userId}`, GENERATION_LIMIT, 60_000);
}
