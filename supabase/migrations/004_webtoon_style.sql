-- 웹툰 프로젝트에 style 컬럼 추가 (화풍/아트스타일)
ALTER TABLE public.webtoons ADD COLUMN IF NOT EXISTS style TEXT;
