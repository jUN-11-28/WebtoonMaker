-- 웹툰 프로젝트 기획안 (brief) 컬럼 추가
ALTER TABLE public.webtoons ADD COLUMN IF NOT EXISTS brief TEXT;
