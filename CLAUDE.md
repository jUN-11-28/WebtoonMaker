@AGENTS.md

# WebtoonMaker

AI 웹툰 생성·공유 플랫폼. Next.js 16 App Router + Supabase + Tailwind CSS.

## 개발 서버
```
npm run dev
```

## 기술 스택
- **프레임워크**: Next.js 16 (App Router, TypeScript)
- **DB/인증/스토리지**: Supabase (Postgres + Auth + Storage + RLS)
- **스타일**: Tailwind CSS v4 + shadcn/ui + Pretendard 글꼴
- **AI**: Gemini (`@google/genai`) + OpenAI SDK

## 환경변수 (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=        # Supabase Publishable URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # Supabase Publishable key
SUPABASE_SERVICE_ROLE_KEY=       # Supabase Secret key — 서버 전용
OPENAI_API_KEY=                  # 서버 전용
GEMINI_API_KEY=                  # 서버 전용
OPENAI_IMAGE_MODEL=gpt-image-2
GEMINI_IMAGE_MODEL_STANDARD=...
GEMINI_IMAGE_MODEL_PRO=...
GEMINI_TEXT_MODEL=gemini-2.5-flash
IP_HASH_SALT=                    # 좋아요/댓글 IP 해시 salt
RATE_LIMIT_GENERATION_PER_MINUTE=5
```

## 보안 원칙 (위반 금지)
1. `OPENAI_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` → 절대 NEXT_PUBLIC_ 금지
2. 모든 AI 호출 → `src/app/api/` Route Handler 경유만
3. 크레딧 차감·승인 여부 → 100% 서버(`requireCreator`, `assertAdmin`) 검증
4. Service role 클라이언트 → `createServiceClient()` (서버 전용)
5. 모델 ID → 환경변수(`AI_CONFIG`)로만, 코드 하드코딩 금지

## Supabase 마이그레이션
Supabase 대시보드 SQL Editor에서 순서대로 실행:
1. `supabase/migrations/001_initial_schema.sql` — 테이블 + RLS 25개 정책
2. `supabase/migrations/002_make_admin.sql` — 첫 관리자 계정 설정
3. `supabase/migrations/003_storage.sql` — webtoon-images Storage 버킷

## 디렉토리 구조 핵심
```
src/
├── lib/
│   ├── ai/            # text.ts, image.ts, storage.ts, config.ts, story-schema.ts
│   ├── supabase/      # client.ts, server.ts, session.ts, types.ts
│   ├── auth-guard.ts  # requireCreator, deductCredits, refundCredits
│   ├── credits.ts     # CREDIT_COST 상수
│   ├── rate-limit.ts  # 생성 rate limit (인메모리)
│   └── voter.ts       # IP 해시 (서버 전용)
├── app/
│   ├── (auth)/        # 로그인, 가입, 이메일 확인
│   ├── (creator)/     # /create 워크플로우 (4단계)
│   ├── admin/         # 관리자 대시보드
│   ├── my/            # 마이페이지, 발행 설정
│   ├── w/             # 공개 뷰어
│   └── api/           # 모든 AI/데이터 API (클라이언트 직접 호출 금지)
└── components/        # UI 컴포넌트
```
