const SUPABASE_HOSTNAME: string | null = (() => {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try { return new URL(raw).hostname; } catch { return null; }
})();

/**
 * reference_image_url 검증 — Supabase Storage HTTPS URL만 허용 (SSRF 방지).
 * null은 "값 지우기"를 의미하므로 허용.
 */
export function isAllowedReferenceUrl(url: unknown): url is string {
  if (url === null || url === undefined) return true;
  if (typeof url !== "string" || url === "") return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    if (!SUPABASE_HOSTNAME) return false;
    return parsed.hostname === SUPABASE_HOSTNAME;
  } catch {
    return false;
  }
}
