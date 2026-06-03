import { NextRequest, NextResponse } from "next/server";
import { requireCreator } from "@/lib/auth-guard";
import { createServiceClient } from "@/lib/supabase/server";
import { generateJSON } from "@/lib/ai/text";

const EXTRACT_PROMPT = `
다음 소설/스크립트 텍스트에서 등장인물과 주요 장소를 추출해 JSON으로 반환하세요.

반환 형식:
{
  "characters": [
    {
      "char_key": "snake_case_영문키",
      "name": "캐릭터 한국어 이름",
      "visual_core": "외형 핵심 영문 descriptor (성별, 나이대, 머리색, 눈색, 체형 등 고정 특징)",
      "wardrobe": "주요 의상 설명",
      "personality": "성격 특징 간단히",
      "expression": "대표 표정/분위기"
    }
  ],
  "locations": [
    {
      "loc_key": "snake_case_영문키",
      "name": "장소 한국어 이름",
      "description": "장소 설명"
    }
  ]
}

규칙:
- visual_core는 이미지 생성에 바로 쓰이므로 영문으로 구체적으로 (예: "young woman, early 20s, long black hair, dark brown eyes, slim build")
- char_key와 loc_key는 영문 snake_case (예: yoon_ajin, abandoned_hospital)
- 주요 등장인물만 추출 (배경 인물 제외)
- 반복 등장하는 장소만 추출
- 순수 JSON만 반환
`.trim();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ webtoonId: string }> }
) {
  const { webtoonId } = await params;

  let ctx;
  try {
    ctx = await requireCreator(0); // 크레딧 소모 없음 (텍스트 추출은 무료)
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }

  const svc = createServiceClient();
  const { data: wt } = await svc.from("webtoons").select("author_id").eq("id", webtoonId).single();
  if (!wt || (wt as { author_id: string }).author_id !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { text } = body ?? {};
  if (typeof text !== "string" || text.trim().length < 20) {
    return NextResponse.json({ error: "텍스트가 너무 짧습니다." }, { status: 400 });
  }

  try {
    const result = await generateJSON<{
      characters: {
        char_key: string; name: string; visual_core: string;
        wardrobe: string; personality: string; expression: string;
      }[];
      locations: { loc_key: string; name: string; description: string }[];
    }>({
      system: EXTRACT_PROMPT,
      prompt: text.slice(0, 8000), // 앞 8000자만 사용 (비용 절감)
      temperature: 0.3,
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
