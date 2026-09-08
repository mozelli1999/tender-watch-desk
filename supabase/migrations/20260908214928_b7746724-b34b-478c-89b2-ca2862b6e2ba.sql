CREATE OR REPLACE FUNCTION public.search_opportunities(filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(id uuid, agency_name text, agency_document text, process_number text, modality text, object_description text, category text, catmat_catser_code text, estimated_value numeric, quantity numeric, state text, city text, session_date timestamp with time zone, published_at timestamp with time zone, delivery_deadline_days integer, payment_deadline_days integer, status_situation text, is_me_epp boolean, is_srp boolean, requires_sample boolean, requires_certificate boolean, requires_warranty boolean, requires_min_capital boolean, closing_date timestamp with time zone, is_compatible boolean, source_url text, source_slug text, origin_portal text, sources_count bigint, score integer, classification text, reasons text[], is_favorite boolean, is_discarded boolean, stage text, has_analysis boolean, total_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH f AS (SELECT coalesce(filters, '{}'::jsonb) AS j),
dup AS (
  SELECT owner_id, business_key, count(*) AS c
  FROM public.opportunities
  WHERE business_key IS NOT NULL
  GROUP BY 1, 2
),
rows AS (
  SELECT
    o.id, o.agency_name, o.agency_document, o.process_number, o.modality, o.object_description,
    o.category, o.catmat_catser_code, o.estimated_value, o.quantity,
    o.state, o.city, o.session_date, o.published_at, o.delivery_deadline_days, o.payment_deadline_days,
    o.status_situation, o.is_me_epp, o.is_srp, o.requires_sample, o.requires_certificate,
    o.requires_warranty, o.requires_min_capital, o.closing_date, o.is_compatible,
    o.source_url, src.slug AS source_slug, o.origin_portal,
    coalesce(dup.c, 1) AS sources_count,
    coalesce(sc.score, 0)::int AS score,
    coalesce(sc.classification, 'red')::text AS classification,
    coalesce(sc.reasons, '{}'::text[]) AS reasons,
    coalesce(pi.is_favorite, false) AS is_favorite,
    coalesce(pi.is_discarded, false) AS is_discarded,
    coalesce(pi.stage, 'novas')::text AS stage,
    (ea.id IS NOT NULL AND ea.status = 'done') AS has_analysis,
    count(*) OVER () AS total_count
  FROM public.opportunities o
  CROSS JOIN f
  LEFT JOIN public.sources src ON src.id = o.source_id
  LEFT JOIN public.opportunity_scores sc ON sc.opportunity_id = o.id
  LEFT JOIN public.pipeline_items pi ON pi.opportunity_id = o.id AND pi.owner_id = o.owner_id
  LEFT JOIN public.edital_analyses ea ON ea.opportunity_id = o.id
  LEFT JOIN dup ON dup.owner_id = o.owner_id AND dup.business_key = o.business_key
  WHERE
    o.canonical_id IS NULL
    AND (f.j->>'keyword' IS NULL OR
      to_tsvector('portuguese', coalesce(o.object_description, '')) @@ plainto_tsquery('portuguese', f.j->>'keyword')
      OR o.object_description ILIKE '%' || (f.j->>'keyword') || '%')
    AND (f.j->>'category' IS NULL OR o.category ILIKE '%' || (f.j->>'category') || '%')
    AND (f.j->'categories' IS NULL OR jsonb_array_length(f.j->'categories') = 0 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(f.j->'categories') c
      WHERE o.category ILIKE '%' || c || '%' OR o.object_description ILIKE '%' || c || '%'
    ))
    AND (f.j->>'catmat_catser_code' IS NULL OR o.catmat_catser_code = f.j->>'catmat_catser_code')
    AND (f.j->>'value_min' IS NULL OR o.estimated_value >= (f.j->>'value_min')::numeric)
    AND (f.j->>'value_max' IS NULL OR o.estimated_value <= (f.j->>'value_max')::numeric)
    AND (f.j->>'state' IS NULL OR o.state = f.j->>'state')
    AND (f.j->'states' IS NULL OR jsonb_array_length(f.j->'states') = 0 OR o.state IN (
      SELECT jsonb_array_elements_text(f.j->'states')
    ))
    AND (f.j->>'city' IS NULL OR o.city ILIKE '%' || (f.j->>'city') || '%')
    AND (f.j->>'agency_name' IS NULL OR o.agency_name ILIKE '%' || (f.j->>'agency_name') || '%')
    AND (f.j->>'modality' IS NULL OR o.modality ILIKE '%' || (f.j->>'modality') || '%')
    AND (f.j->'modalities' IS NULL OR jsonb_array_length(f.j->'modalities') = 0 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(f.j->'modalities') m WHERE o.modality ILIKE '%' || m || '%'
    ))
    AND (f.j->>'session_date_from' IS NULL OR o.session_date >= (f.j->>'session_date_from')::timestamptz)
    AND (f.j->>'session_date_to' IS NULL OR o.session_date <= (f.j->>'session_date_to')::timestamptz)
    AND (f.j->>'delivery_deadline_max_days' IS NULL OR o.delivery_deadline_days <= (f.j->>'delivery_deadline_max_days')::int)
    AND (f.j->>'payment_deadline_max_days' IS NULL OR o.payment_deadline_days <= (f.j->>'payment_deadline_max_days')::int)
    AND (f.j->>'quantity_min' IS NULL OR o.quantity >= (f.j->>'quantity_min')::numeric)
    AND (f.j->>'status_situation' IS NULL OR o.status_situation = f.j->>'status_situation')
    AND (f.j->>'is_me_epp' IS NULL OR o.is_me_epp = (f.j->>'is_me_epp')::boolean)
    AND (f.j->>'is_srp' IS NULL OR o.is_srp = (f.j->>'is_srp')::boolean)
    AND (f.j->>'requires_sample' IS NULL OR o.requires_sample = (f.j->>'requires_sample')::boolean)
    AND (f.j->>'requires_certificate' IS NULL OR o.requires_certificate = (f.j->>'requires_certificate')::boolean)
    AND (f.j->>'requires_warranty' IS NULL OR o.requires_warranty = (f.j->>'requires_warranty')::boolean)
    AND (f.j->>'requires_min_capital' IS NULL OR o.requires_min_capital = (f.j->>'requires_min_capital')::boolean)
    AND (f.j->>'source_slug' IS NULL OR src.slug = f.j->>'source_slug')
    AND (f.j->>'origin_portal' IS NULL OR o.origin_portal = f.j->>'origin_portal')
    AND (f.j->>'only_compatible' IS NULL OR (f.j->>'only_compatible')::boolean IS NOT TRUE OR o.is_compatible IS TRUE)
    AND (f.j->>'is_favorite' IS NULL OR coalesce(pi.is_favorite, false) = (f.j->>'is_favorite')::boolean)
    AND (f.j->>'is_discarded' IS NULL OR coalesce(pi.is_discarded, false) = (f.j->>'is_discarded')::boolean)
    AND (f.j->>'classification' IS NULL OR coalesce(sc.classification, 'red') = f.j->>'classification')
    AND (f.j->>'score_min' IS NULL OR coalesce(sc.score, 0) >= (f.j->>'score_min')::int)
    AND (f.j->>'closing_in_days' IS NULL OR (
      o.closing_date IS NOT NULL
      AND o.closing_date >= now()
      AND o.closing_date <= now() + make_interval(days => (f.j->>'closing_in_days')::int)
    ))
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
$function$;