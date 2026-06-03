-- webtoon-images 버킷 생성 (공개 읽기)
insert into storage.buckets (id, name, public)
values ('webtoon-images', 'webtoon-images', true)
on conflict (id) do nothing;

-- 공개 읽기 정책
create policy "webtoon-images: 공개 읽기"
  on storage.objects for select
  using (bucket_id = 'webtoon-images');

-- 서버(service role)만 업로드/삭제 가능 — 클라이언트 직접 업로드 차단
-- (service role은 RLS 우회하므로 별도 정책 불필요)
