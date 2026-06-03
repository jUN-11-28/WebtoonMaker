/** API 응답에서 안전하게 에러 메시지 추출 (빈 body도 처리) */
export async function getErrorMessage(res: Response, fallback = "오류가 발생했습니다."): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return fallback;
    const data = JSON.parse(text);
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

/** 응답 JSON 파싱 (빈 body면 null 반환) */
export async function safeJson<T = unknown>(res: Response): Promise<T | null> {
  try {
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
