-- 1. sources: estado de acesso e prioridade
ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'official_api',
  ADD COLUMN IF NOT EXISTS legal_note text,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 100;

-- 2. opportunities: chave de negócio + portal de origem
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS business_key text,
  ADD COLUMN IF NOT EXISTS origin_portal text;

CREATE UNIQUE INDEX IF NOT EXISTS opportunities_owner_business_key_uq
  ON public.opportunities (owner_id, business_key)
  WHERE business_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_opportunities_origin_portal
  ON public.opportunities (origin_portal);

-- 3. Carga das fontes (idempotente por slug)
INSERT INTO public.sources (slug, name, base_url, integration_type, is_active, access_status, legal_note, priority)
VALUES
  ('pncp', 'PNCP — Portal Nacional de Contratações Públicas', 'https://pncp.gov.br/api/consulta/v1', 'api', true, 'official_api',
   'API pública de consulta do PNCP. Publicação obrigatória pela Lei 14.133/2021.', 10),
  ('compras_gov', 'Compras.gov.br / Comprasnet (Dados Abertos)', 'https://dadosabertos.compras.gov.br', 'api', true, 'open_data',
   'Dados Abertos do Governo Federal (Lei 12.527/2011, Decreto 8.777/2016).', 20),
  ('portal_compras_publicas', 'Portal de Compras Públicas', 'https://www.portaldecompraspublicas.com.br', 'api', false, 'awaiting_official_access',
   'Sem API pública de consulta. Licitações captadas via PNCP com atribuição de origem. Conector ativado somente com credenciais oficiais.', 50),
  ('bll', 'BLL Compras', 'https://bll.org.br', 'api', false, 'awaiting_official_access',
   'Sem API pública de consulta. Licitações captadas via PNCP com atribuição de origem. Conector ativado somente com credenciais oficiais.', 50),
  ('licitanet', 'Licitanet', 'https://licitanet.com.br', 'api', false, 'awaiting_official_access',
   'Sem API pública de consulta. Licitações captadas via PNCP com atribuição de origem. Conector ativado somente com credenciais oficiais.', 50),
  ('licitacoes_e', 'Licitações-e (Banco do Brasil)', 'https://www.licitacoes-e.com.br', 'api', false, 'awaiting_official_access',
   'Sem API pública de consulta. Licitações captadas via PNCP com atribuição de origem. Conector ativado somente com credenciais oficiais.', 50),
  ('compras_br', 'Compras BR', 'https://www.comprasbr.com.br', 'api', false, 'awaiting_official_access',
   'Sem API pública de consulta. Licitações captadas via PNCP com atribuição de origem. Conector ativado somente com credenciais oficiais.', 50)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      base_url = EXCLUDED.base_url,
      access_status = EXCLUDED.access_status,
      legal_note = EXCLUDED.legal_note,
      priority = EXCLUDED.priority;

-- Fonte legada 'comprasnet' (se existir) passa a inativa em favor de 'compras_gov'
UPDATE public.sources SET is_active = false, legal_note = 'Substituída por compras_gov (dadosabertos.compras.gov.br).'
WHERE slug = 'comprasnet';

-- 4. search_opportunities: mesmos filtros, agora devolvendo origin_portal
DROP FUNCTION IF EXISTS public.search_opportunities(jsonb);

CREATE FUNCTION public.search_opportunities(filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(id uuid, agency_name text, process_number text, modality text, object_description text, category text, catmat_catser_code text, estimated_value numeric, quantity numeric, state text, city text, session_date timestamp with time zone, delivery_deadline_days integer, payment_deadline_days integer, status_situation text, is_me_epp boolean, requires_sample boolean, requires_certificate boolean, requires_warranty boolean, requires_min_capital boolean, closing_date timestamp with time zone, is_compatible boolean, source_url text, source_slug text, origin_portal text, score integer, classification text, reasons text[], is_favorite boolean, is_discarded boolean, stage text, total_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH f AS (SELECT coalesce(filters, '{}'::jsonb) AS j),
rows AS (
  SELECT
    o.id, o.agency_name, o.process_number, o.modality, o.object_description,
    o.category, o.catmat_catser_code, o.estimated_value, o.quantity,
    o.state, o.city, o.session_date, o.delivery_deadline_days, o.payment_deadline_days,
    o.status_situation, o.is_me_epp, o.requires_sample, o.requires_certificate,
    o.requires_warranty, o.requires_min_capital, o.closing_date, o.is_compatible,
    o.source_url, src.slug AS source_slug, o.origin_portal,
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
    AND (f.j->>'origin_portal' IS NULL OR o.origin_portal = f.j->>'origin_portal')
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
$function$;

GRANT EXECUTE ON FUNCTION public.search_opportunities(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_opportunities(jsonb) TO service_role;