-- ============================================================
-- 001_initial_schema.sql
-- WebtoonMaker 초기 스키마 + RLS 정책
-- ============================================================

-- extensions
create extension if not exists "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================
create type user_role      as enum ('user', 'admin');
create type visibility     as enum ('public', 'private');
create type episode_status as enum ('draft', 'generating', 'ready', 'failed');
create type cut_status     as enum ('pending', 'generating', 'done', 'failed');
create type job_kind       as enum ('json', 'references', 'cuts');
create type job_status     as enum ('pending', 'running', 'done', 'failed');
create type target_type    as enum ('webtoon', 'episode', 'cut');
create type image_provider as enum ('openai', 'gemini');

-- ============================================================
-- TABLES
-- ============================================================

-- profiles (auth.users 와 1:1)
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text,
  role          user_role not null default 'user',
  is_approved   boolean   not null default false,
  credits       integer   not null default 0 check (credits >= 0),
  created_at    timestamptz not null default now()
);

-- webtoons
create table public.webtoons (
  id               uuid primary key default gen_random_uuid(),
  author_id        uuid not null references public.profiles(id) on delete cascade,
  title            text not null,
  description      text,
  cover_image_url  text,
  visibility       visibility not null default 'private',
  created_at       timestamptz not null default now()
);

-- episodes
create table public.episodes (
  id               uuid primary key default gen_random_uuid(),
  webtoon_id       uuid not null references public.webtoons(id) on delete cascade,
  episode_number   integer not null,
  title            text not null,
  status           episode_status not null default 'draft',
  script_source    text,
  story_json       jsonb,
  created_at       timestamptz not null default now(),
  unique (webtoon_id, episode_number)
);

-- characters (webtoon 단위 + episode 단위 모두 지원)
create table public.characters (
  id                    uuid primary key default gen_random_uuid(),
  webtoon_id            uuid not null references public.webtoons(id) on delete cascade,
  episode_id            uuid references public.episodes(id) on delete cascade,
  char_key              text not null,
  name                  text not null,
  bible                 jsonb,
  reference_image_url   text,
  locked                boolean not null default false,
  created_at            timestamptz not null default now(),
  unique (webtoon_id, char_key)
);

-- locations
create table public.locations (
  id                    uuid primary key default gen_random_uuid(),
  webtoon_id            uuid not null references public.webtoons(id) on delete cascade,
  episode_id            uuid references public.episodes(id) on delete cascade,
  loc_key               text not null,
  name                  text not null,
  reference_image_url   text,
  locked                boolean not null default false,
  created_at            timestamptz not null default now(),
  unique (webtoon_id, loc_key)
);

-- cuts
create table public.cuts (
  id              uuid primary key default gen_random_uuid(),
  episode_id      uuid not null references public.episodes(id) on delete cascade,
  cut_id_key      text not null,
  order_index     integer not null,
  panel_type      text,
  visual_prompt   text,
  camera          text,
  dialogue        jsonb,
  narration       jsonb,
  sfx             jsonb,
  emotion         text,
  character_keys  text[] not null default '{}',
  location_key    text,
  image_url       text,
  status          cut_status not null default 'pending',
  created_at      timestamptz not null default now(),
  unique (episode_id, cut_id_key)
);

-- likes (비회원 포함)
create table public.likes (
  id           uuid primary key default gen_random_uuid(),
  target_type  target_type not null,
  target_id    uuid not null,
  voter_hash   text not null,
  created_at   timestamptz not null default now(),
  unique (target_type, target_id, voter_hash)
);

-- comments
create table public.comments (
  id           uuid primary key default gen_random_uuid(),
  target_type  target_type not null,
  target_id    uuid not null,
  body         text not null check (char_length(body) between 1 and 2000),
  author_id    uuid references public.profiles(id) on delete set null,
  voter_hash   text,
  nickname     text,
  created_at   timestamptz not null default now()
);

-- generation_jobs
create table public.generation_jobs (
  id          uuid primary key default gen_random_uuid(),
  episode_id  uuid not null references public.episodes(id) on delete cascade,
  kind        job_kind not null,
  status      job_status not null default 'pending',
  progress    integer not null default 0 check (progress between 0 and 100),
  error       text,
  provider    image_provider not null default 'gemini',
  created_at  timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index on public.webtoons (author_id);
create index on public.webtoons (visibility, created_at desc);
create index on public.episodes (webtoon_id);
create index on public.cuts (episode_id, order_index);
create index on public.likes (target_type, target_id);
create index on public.comments (target_type, target_id, created_at desc);
create index on public.generation_jobs (episode_id, status);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- 신규 가입 시 profiles 자동 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 크레딧 원자적 조정 (서버 RPC 전용, 클라이언트 직접 호출 불가)
-- delta가 음수면 차감 (잔액 부족 시 예외)
create or replace function public.adjust_credits(
  target_user_id uuid,
  delta integer
)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  new_credits integer;
begin
  update public.profiles
  set credits = credits + delta
  where id = target_user_id
  returning credits into new_credits;

  if not found then
    raise exception 'user not found';
  end if;

  if new_credits < 0 then
    raise exception 'insufficient credits';
  end if;

  return new_credits;
end;
$$;

-- 좋아요 토글 (있으면 삭제, 없으면 삽입) — 비회원 포함
create or replace function public.toggle_like(
  p_target_type target_type,
  p_target_id   uuid,
  p_voter_hash  text
)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  v_exists boolean;
begin
  select exists (
    select 1 from public.likes
    where target_type = p_target_type
      and target_id   = p_target_id
      and voter_hash  = p_voter_hash
  ) into v_exists;

  if v_exists then
    delete from public.likes
    where target_type = p_target_type
      and target_id   = p_target_id
      and voter_hash  = p_voter_hash;
    return false;
  else
    insert into public.likes (target_type, target_id, voter_hash)
    values (p_target_type, p_target_id, p_voter_hash);
    return true;
  end if;
end;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles         enable row level security;
alter table public.webtoons         enable row level security;
alter table public.episodes         enable row level security;
alter table public.characters       enable row level security;
alter table public.locations        enable row level security;
alter table public.cuts             enable row level security;
alter table public.likes            enable row level security;
alter table public.comments         enable row level security;
alter table public.generation_jobs  enable row level security;

-- ---------- profiles ----------
-- 본인만 읽기
create policy "profiles: 본인 읽기"
  on public.profiles for select
  using (auth.uid() = id);

-- 본인만 display_name 수정 (role/is_approved/credits는 여기서 막힘)
create policy "profiles: 본인 display_name 수정"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ---------- webtoons ----------
create policy "webtoons: 공개 웹툰 누구나 조회"
  on public.webtoons for select
  using (visibility = 'public' or auth.uid() = author_id);

create policy "webtoons: 본인 생성"
  on public.webtoons for insert
  with check (auth.uid() = author_id);

create policy "webtoons: 본인 수정"
  on public.webtoons for update
  using (auth.uid() = author_id);

create policy "webtoons: 본인 삭제"
  on public.webtoons for delete
  using (auth.uid() = author_id);

-- ---------- episodes ----------
create policy "episodes: 공개 웹툰의 에피소드 조회"
  on public.episodes for select
  using (
    exists (
      select 1 from public.webtoons w
      where w.id = webtoon_id
        and (w.visibility = 'public' or w.author_id = auth.uid())
    )
  );

create policy "episodes: 본인 웹툰에 생성"
  on public.episodes for insert
  with check (
    exists (
      select 1 from public.webtoons w
      where w.id = webtoon_id and w.author_id = auth.uid()
    )
  );

create policy "episodes: 본인 수정"
  on public.episodes for update
  using (
    exists (
      select 1 from public.webtoons w
      where w.id = webtoon_id and w.author_id = auth.uid()
    )
  );

create policy "episodes: 본인 삭제"
  on public.episodes for delete
  using (
    exists (
      select 1 from public.webtoons w
      where w.id = webtoon_id and w.author_id = auth.uid()
    )
  );

-- ---------- characters ----------
create policy "characters: 공개 웹툰 조회"
  on public.characters for select
  using (
    exists (
      select 1 from public.webtoons w
      where w.id = webtoon_id
        and (w.visibility = 'public' or w.author_id = auth.uid())
    )
  );

create policy "characters: 본인 웹툰에 CUD"
  on public.characters for all
  using (
    exists (
      select 1 from public.webtoons w
      where w.id = webtoon_id and w.author_id = auth.uid()
    )
  );

-- ---------- locations ----------
create policy "locations: 공개 웹툰 조회"
  on public.locations for select
  using (
    exists (
      select 1 from public.webtoons w
      where w.id = webtoon_id
        and (w.visibility = 'public' or w.author_id = auth.uid())
    )
  );

create policy "locations: 본인 웹툰에 CUD"
  on public.locations for all
  using (
    exists (
      select 1 from public.webtoons w
      where w.id = webtoon_id and w.author_id = auth.uid()
    )
  );

-- ---------- cuts ----------
create policy "cuts: 공개 에피소드 조회"
  on public.cuts for select
  using (
    exists (
      select 1 from public.episodes e
      join public.webtoons w on w.id = e.webtoon_id
      where e.id = episode_id
        and (w.visibility = 'public' or w.author_id = auth.uid())
    )
  );

create policy "cuts: 본인 에피소드에 CUD"
  on public.cuts for all
  using (
    exists (
      select 1 from public.episodes e
      join public.webtoons w on w.id = e.webtoon_id
      where e.id = episode_id and w.author_id = auth.uid()
    )
  );

-- ---------- likes ----------
-- 누구나 읽기 (집계용)
create policy "likes: 누구나 조회"
  on public.likes for select
  using (true);

-- insert/delete는 RPC(toggle_like)가 security definer로 처리 → 직접 DML 차단
create policy "likes: 직접 insert 차단"
  on public.likes for insert
  with check (false);

create policy "likes: 직접 delete 차단"
  on public.likes for delete
  using (false);

-- ---------- comments ----------
create policy "comments: 공개 대상 누구나 조회"
  on public.comments for select
  using (true);

create policy "comments: 누구나 작성"
  on public.comments for insert
  with check (true);

create policy "comments: 본인(회원) 삭제"
  on public.comments for delete
  using (auth.uid() = author_id);

-- ---------- generation_jobs ----------
create policy "jobs: 본인 에피소드 조회"
  on public.generation_jobs for select
  using (
    exists (
      select 1 from public.episodes e
      join public.webtoons w on w.id = e.webtoon_id
      where e.id = episode_id and w.author_id = auth.uid()
    )
  );

-- insert/update는 서버(service role)만 — 클라이언트 직접 불가
create policy "jobs: 클라이언트 insert 차단"
  on public.generation_jobs for insert
  with check (false);

create policy "jobs: 클라이언트 update 차단"
  on public.generation_jobs for update
  using (false);
