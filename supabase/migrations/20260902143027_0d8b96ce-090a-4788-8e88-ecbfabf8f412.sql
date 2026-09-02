
-- índice full-text para busca por palavra-chave
CREATE INDEX IF NOT EXISTS idx_opportunities_object_fts
  ON public.opportunities
  USING gin (to_tsvector('portuguese', coalesce(object_description, '')));

-- =========================================================
-- get_dashboard_metrics(period_days int)
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(period_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH base AS (
  SELECT o.*, pi.is_favorite, pi.is_discarded, pi.stage, s.score, s.classification
  FROM public.opportunities o
  LEFT JOIN public.pipeline_items pi
    ON pi.opportunity_id = o.id AND pi.owner_id = o.owner_id
  LEFT JOIN public.opportunity_scores s ON s.opportunity_id = o.id
  WHERE coalesce(pi.is_discarded, false) = false
)
SELECT jsonb_build_object(
  'new_opportunities', (SELECT count(*) FROM base WHERE created_at >= now() - make_interval(days => greatest(coalesce(period_days, 7), 1))),
  'closing_today', (SELECT count(*) FROM base WHERE closing_date IS NOT NULL AND closing_date::date = current_date),
  'closing_next_days', (SELECT count(*) FROM base WHERE closing_date IS NOT NULL AND closing_date::date > current_date AND closing_date::date <= current_date + 7),
  'total_value', (SELECT coalesce(sum(estimated_value), 0) FROM base),
  'favorites_count', (SELECT count(*) FROM base WHERE is_favorite IS TRUE),
  'in_pipeline_count', (SELECT count(*) FROM base WHERE stage IS NOT NULL),
  'by_category', coalesce((
    SELECT jsonb_agg(t) FROM (
      SELECT coalesce(category, 'Sem categoria') AS category, count(*) AS count,
             coalesce(sum(estimated_value), 0) AS total_value
      FROM base GROUP BY 1 ORDER BY 2 DESC LIMIT 8
    ) t), '[]'::jsonb),
  'by_agency', coalesce((
    SELECT jsonb_agg(t) FROM (
      SELECT coalesce(agency_name, 'Não informado') AS agency_name, count(*) AS count,
             coalesce(sum(estimated_value), 0) AS total_value
      FROM base GROUP BY 1 ORDER BY 2 DESC LIMIT 8
    ) t), '[]'::jsonb),
  'by_modality', coalesce((
    SELECT jsonb_agg(t) FROM (
      SELECT coalesce(modality, 'Não informado') AS modality, count(*) AS count,
             coalesce(sum(estimated_value), 0) AS total_value
      FROM base GROUP BY 1 ORDER BY 2 DESC LIMIT 8
    ) t), '[]'::jsonb),
  'by_state', coalesce((
    SELECT jsonb_agg(t) FROM (
      SELECT coalesce(state, '--') AS state, count(*) AS count,
             coalesce(sum(estimated_value), 0) AS total_value
      FROM base GROUP BY 1 ORDER BY 2 DESC LIMIT 10
    ) t), '[]'::jsonb),
  'by_score_classification', coalesce((
    SELECT jsonb_agg(t) FROM (
      SELECT coalesce(classification, 'unranked') AS classification, count(*) AS count
      FROM base GROUP BY 1 ORDER BY 2 DESC
    ) t), '[]'::jsonb)
);
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(integer) TO authenticated;

-- =========================================================
-- search_opportunities(filters jsonb)
-- =========================================================
CREATE OR REPLACE FUNCTION public.search_opportunities(filters jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (
  id uuid,
  agency_name text,
  process_number text,
  modality text,
  object_description text,
  category text,
  catmat_catser_code text,
  estimated_value numeric,
  quantity numeric,
  state text,
  city text,
  session_date timestamptz,
  delivery_deadline_days integer,
  payment_deadline_days integer,
  status_situation text,
  is_me_epp boolean,
  requires_sample boolean,
  requires_certificate boolean,
  requires_warranty boolean,
  requires_min_capital boolean,
  closing_date timestamptz,
  is_compatible boolean,
  source_url text,
  source_slug text,
  score integer,
  classification text,
  reasons text[],
  is_favorite boolean,
  is_discarded boolean,
  stage text,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH f AS (SELECT coalesce(filters, '{}'::jsonb) AS j),
rows AS (
  SELECT
    o.id, o.agency_name, o.process_number, o.modality, o.object_description,
    o.category, o.catmat_catser_code, o.estimated_value, o.quantity,
    o.state, o.city, o.session_date, o.delivery_deadline_days, o.payment_deadline_days,
    o.status_situation, o.is_me_epp, o.requires_sample, o.requires_certificate,
    o.requires_warranty, o.requires_min_capital, o.closing_date, o.is_compatible,
    o.source_url, src.slug AS source_slug,
    coalesce(sc.score, 0)::int AS score,
    coalesce(sc.classification, 'red')::text AS classification,
    coalesce(sc.reasons, '{}'::text[]) AS reasons,
    coalesce(pi.is_favorite, false) AS is_favorite,
    coalesce(pi.is_discarded, false) AS is_discarded,
    coalesce(pi.stage, 'novas')::text AS stage,
    count(*) OVER () AS total_count
  FROM public.opportunities o
  CROSS JOIN f
  LEFT JOIN public.sources src ON src.id = o.source_id
  LEFT JOIN public.opportunity_scores sc ON sc.opportunity_id = o.id
  LEFT JOIN public.pipeline_items pi ON pi.opportunity_id = o.id AND pi.owner_id = o.owner_id
  WHERE
    (f.j->>'keyword' IS NULL OR
      to_tsvector('portuguese', coalesce(o.object_description, '')) @@ plainto_tsquery('portuguese', f.j->>'keyword')
      OR o.object_description ILIKE '%' || (f.j->>'keyword') || '%')
    AND (f.j->>'category' IS NULL OR o.category ILIKE '%' || (f.j->>'category') || '%')
    AND (f.j->>'catmat_catser_code' IS NULL OR o.catmat_catser_code = f.j->>'catmat_catser_code')
    AND (f.j->>'value_min' IS NULL OR o.estimated_value >= (f.j->>'value_min')::numeric)
    AND (f.j->>'value_max' IS NULL OR o.estimated_value <= (f.j->>'value_max')::numeric)
    AND (f.j->>'state' IS NULL OR o.state = f.j->>'state')
    AND (f.j->>'city' IS NULL OR o.city ILIKE '%' || (f.j->>'city') || '%')
    AND (f.j->>'agency_name' IS NULL OR o.agency_name ILIKE '%' || (f.j->>'agency_name') || '%')
    AND (f.j->>'modality' IS NULL OR o.modality = f.j->>'modality')
    AND (f.j->>'session_date_from' IS NULL OR o.session_date >= (f.j->>'session_date_from')::timestamptz)
    AND (f.j->>'session_date_to' IS NULL OR o.session_date <= (f.j->>'session_date_to')::timestamptz)
    AND (f.j->>'delivery_deadline_max_days' IS NULL OR o.delivery_deadline_days <= (f.j->>'delivery_deadline_max_days')::int)
    AND (f.j->>'payment_deadline_max_days' IS NULL OR o.payment_deadline_days <= (f.j->>'payment_deadline_max_days')::int)
    AND (f.j->>'quantity_min' IS NULL OR o.quantity >= (f.j->>'quantity_min')::numeric)
    AND (f.j->>'status_situation' IS NULL OR o.status_situation = f.j->>'status_situation')
    AND (f.j->>'is_me_epp' IS NULL OR o.is_me_epp = (f.j->>'is_me_epp')::boolean)
    AND (f.j->>'requires_sample' IS NULL OR o.requires_sample = (f.j->>'requires_sample')::boolean)
    AND (f.j->>'requires_certificate' IS NULL OR o.requires_certificate = (f.j->>'requires_certificate')::boolean)
    AND (f.j->>'requires_warranty' IS NULL OR o.requires_warranty = (f.j->>'requires_warranty')::boolean)
    AND (f.j->>'requires_min_capital' IS NULL OR o.requires_min_capital = (f.j->>'requires_min_capital')::boolean)
    AND (f.j->>'source_slug' IS NULL OR src.slug = f.j->>'source_slug')
    AND (f.j->>'only_compatible' IS NULL OR (f.j->>'only_compatible')::boolean IS NOT TRUE OR o.is_compatible IS TRUE)
    AND (f.j->>'is_favorite' IS NULL OR coalesce(pi.is_favorite, false) = (f.j->>'is_favorite')::boolean)
    AND (f.j->>'is_discarded' IS NULL OR coalesce(pi.is_discarded, false) = (f.j->>'is_discarded')::boolean)
    AND (f.j->>'classification' IS NULL OR coalesce(sc.classification, 'red') = f.j->>'classification')
    AND (f.j->>'score_min' IS NULL OR coalesce(sc.score, 0) >= (f.j->>'score_min')::int)
)
SELECT * FROM rows
ORDER BY
  CASE WHEN coalesce(filters->>'sort', 'score_desc') = 'score_asc' THEN score END ASC NULLS LAST,
  CASE WHEN coalesce(filters->>'sort', 'score_desc') = 'value_desc' THEN estimated_value END DESC NULLS LAST,
  CASE WHEN coalesce(filters->>'sort', 'score_desc') = 'value_asc' THEN estimated_value END ASC NULLS LAST,
  CASE WHEN coalesce(filters->>'sort', 'score_desc') = 'closing_asc' THEN closing_date END ASC NULLS LAST,
  CASE WHEN coalesce(filters->>'sort', 'score_desc') = 'session_asc' THEN session_date END ASC NULLS LAST,
  CASE WHEN coalesce(filters->>'sort', 'score_desc') = 'score_desc' THEN score END DESC NULLS LAST,
  closing_date ASC NULLS LAST
LIMIT greatest(coalesce((filters->>'limit')::int, 50), 1)
OFFSET greatest(coalesce((filters->>'offset')::int, 0), 0);
$$;

GRANT EXECUTE ON FUNCTION public.search_opportunities(jsonb) TO authenticated;

-- =========================================================
-- upsert_pipeline_flag: favoritar / descartar
-- =========================================================
CREATE OR REPLACE FUNCTION public.upsert_pipeline_flag(
  p_opportunity_id uuid,
  p_favorite boolean DEFAULT NULL,
  p_discard boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_row public.pipeline_items;
BEGIN
  INSERT INTO public.pipeline_items (owner_id, opportunity_id, stage, is_favorite, is_discarded)
  VALUES (auth.uid(), p_opportunity_id, 'novas', coalesce(p_favorite, false), coalesce(p_discard, false))
  ON CONFLICT (opportunity_id) DO UPDATE
    SET is_favorite = coalesce(p_favorite, public.pipeline_items.is_favorite),
        is_discarded = coalesce(p_discard, public.pipeline_items.is_discarded)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('id', v_row.opportunity_id, 'is_favorite', v_row.is_favorite, 'is_discarded', v_row.is_discarded);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_pipeline_flag(uuid, boolean, boolean) TO authenticated;
