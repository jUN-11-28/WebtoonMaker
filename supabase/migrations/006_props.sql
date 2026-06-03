-- 소품(props) 테이블
CREATE TABLE public.props (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webtoon_id          uuid NOT NULL REFERENCES public.webtoons(id) ON DELETE CASCADE,
  episode_id          uuid REFERENCES public.episodes(id) ON DELETE SET NULL,
  prop_key            text NOT NULL,
  name                text NOT NULL,
  description         text,
  visual_core         text,          -- 영문 이미지 생성용 descriptor
  reference_image_url text,
  locked              boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (webtoon_id, prop_key)
);

CREATE INDEX ON public.props (webtoon_id);

ALTER TABLE public.props ENABLE ROW LEVEL SECURITY;

CREATE POLICY "props: 공개 웹툰 조회"
  ON public.props FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.webtoons w
      WHERE w.id = webtoon_id
        AND (w.visibility = 'public' OR w.author_id = auth.uid())
    )
  );

CREATE POLICY "props: 본인 웹툰에 CUD"
  ON public.props FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.webtoons w
      WHERE w.id = webtoon_id AND w.author_id = auth.uid()
    )
  );
