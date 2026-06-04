-- generation_jobs에 result 저장용 metadata 컬럼 추가
-- references job 완료 시 imageUrl 저장, json job은 episodes.story_json 참조
alter table public.generation_jobs add column if not exists metadata jsonb;
