-- ============================================================
-- Migration: Postgres RPC Functions for Radar de Licitações
-- ============================================================

-- 1. move_pipeline_stage
create or replace function public.move_pipeline_stage(
  p_opportunity_id uuid,
  p_stage text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_res record;
  v_valid_stages text[] := array[
    'novas', 'analisando', 'interessante', 'cotacao', 'participar',
    'vencida', 'compra', 'entrega', 'pagamento', 'concluida', 'perdida', 'descartada'
  ];
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Não autorizado. Usuário não autenticado.';
  end if;

  if not (p_stage = any(v_valid_stages)) then
    raise exception 'Etapa inválida: %. Etapas permitidas: %', p_stage, array_to_string(v_valid_stages, ', ');
  end if;

  -- Verifica se a oportunidade pertence ao usuário
  if not exists (select 1 from public.opportunities where id = p_opportunity_id and owner_id = v_user_id) then
    raise exception 'Oportunidade não encontrada ou não pertence ao usuário logado.';
  end if;

  insert into public.pipeline_items (owner_id, opportunity_id, stage, updated_at)
  values (v_user_id, p_opportunity_id, p_stage, now())
  on conflict (opportunity_id)
  do update set
    stage = excluded.stage,
    updated_at = now()
  returning id, opportunity_id, stage, is_favorite, is_discarded, updated_at into v_res;

  return jsonb_build_object(
    'id', v_res.id,
    'opportunity_id', v_res.opportunity_id,
    'stage', v_res.stage,
    'is_favorite', v_res.is_favorite,
    'is_discarded', v_res.is_discarded,
    'updated_at', v_res.updated_at
  );
end;
$$;

grant execute on function public.move_pipeline_stage(uuid, text) to authenticated;

-- 2. upsert_pipeline_flag
create or replace function public.upsert_pipeline_flag(
  p_opportunity_id uuid,
  p_favorite boolean default null,
  p_discard boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_res record;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Não autorizado. Usuário não autenticado.';
  end if;

  -- Verifica ownership
  if not exists (select 1 from public.opportunities where id = p_opportunity_id and owner_id = v_user_id) then
    raise exception 'Oportunidade não encontrada ou não pertence ao usuário.';
  end if;

  insert into public.pipeline_items (
    owner_id,
    opportunity_id,
    stage,
    is_favorite,
    is_discarded,
    updated_at
  )
  values (
    v_user_id,
    p_opportunity_id,
    'novas',
    coalesce(p_favorite, false),
    coalesce(p_discard, false),
    now()
  )
  on conflict (opportunity_id)
  do update set
    is_favorite = coalesce(p_favorite, public.pipeline_items.is_favorite),
    is_discarded = coalesce(p_discard, public.pipeline_items.is_discarded),
    updated_at = now()
  returning id, opportunity_id, stage, is_favorite, is_discarded, updated_at into v_res;

  return jsonb_build_object(
    'id', v_res.id,
    'opportunity_id', v_res.opportunity_id,
    'stage', v_res.stage,
    'is_favorite', v_res.is_favorite,
    'is_discarded', v_res.is_discarded,
    'updated_at', v_res.updated_at
  );
end;
$$;

grant execute on function public.upsert_pipeline_flag(uuid, boolean, boolean) to authenticated;

-- 3. get_top_10_opportunities
create or replace function public.get_top_10_opportunities()
returns table (
  id uuid,
  agency_name text,
  process_number text,
  modality text,
  object_description text,
  category text,
  estimated_value numeric,
  delivery_deadline_days int,
  state text,
  city text,
  session_date timestamptz,
  closing_date timestamptz,
  is_me_epp boolean,
  source_url text,
  score int,
  classification text,
  reasons text[],
  risk_points text[],
  estimated_profit numeric,
  required_capital numeric,
  is_favorite boolean,
  stage text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Não autorizado.';
  end if;

  return query
  select
    o.id,
    o.agency_name,
    o.process_number,
    o.modality,
    o.object_description,
    o.category,
    o.estimated_value,
    o.delivery_deadline_days,
    o.state,
    o.city,
    o.session_date,
    o.closing_date,
    o.is_me_epp,
    o.source_url,
    coalesce(sc.score, 0) as score,
    coalesce(sc.classification, 'red') as classification,
    coalesce(sc.reasons, '{}'::text[]) as reasons,
    coalesce(ea.risk_points, '{}'::text[]) as risk_points,
    fs.profit as estimated_profit,
    fs.required_capital as required_capital,
    coalesce(pi.is_favorite, false) as is_favorite,
    coalesce(pi.stage, 'novas') as stage
  from public.opportunities o
  left join public.opportunity_scores sc on sc.opportunity_id = o.id
  left join public.edital_analyses ea on ea.opportunity_id = o.id
  left join lateral (
    select f.profit, f.required_capital
    from public.financial_simulations f
    where f.opportunity_id = o.id and f.owner_id = v_user_id
    order by f.created_at desc
    limit 1
  ) fs on true
  left join public.pipeline_items pi on pi.opportunity_id = o.id and pi.owner_id = v_user_id
  where o.owner_id = v_user_id
    and o.is_compatible = true
    and coalesce(pi.is_discarded, false) = false
    and (o.closing_date is null or o.closing_date > now())
  order by
    coalesce(sc.score, 0) desc,
    o.estimated_value desc nulls last,
    o.created_at desc
  limit 10;
end;
$$;

grant execute on function public.get_top_10_opportunities() to authenticated;

-- 4. get_dashboard_metrics
create or replace function public.get_dashboard_metrics(
  period_days int default 7
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_new_opps int := 0;
  v_closing_today int := 0;
  v_closing_next int := 0;
  v_total_val numeric(14,2) := 0;
  v_favs int := 0;
  v_in_pipeline int := 0;
  v_by_cat jsonb := '[]'::jsonb;
  v_by_agency jsonb := '[]'::jsonb;
  v_by_modality jsonb := '[]'::jsonb;
  v_by_state jsonb := '[]'::jsonb;
  v_by_score jsonb := '[]'::jsonb;
  v_cutoff_date timestamptz;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Não autorizado.';
  end if;

  v_cutoff_date := now() - (coalesce(period_days, 7) || ' days')::interval;

  -- Contagens principais
  select
    count(case when o.created_at >= v_cutoff_date then 1 end),
    count(case when o.closing_date::date = current_date then 1 end),
    count(case when o.closing_date > current_date and o.closing_date <= (current_date + interval '7 days') then 1 end),
    coalesce(sum(o.estimated_value), 0)
  into
    v_new_opps,
    v_closing_today,
    v_closing_next,
    v_total_val
  from public.opportunities o
  left join public.pipeline_items pi on pi.opportunity_id = o.id and pi.owner_id = v_user_id
  where o.owner_id = v_user_id
    and o.is_compatible = true
    and coalesce(pi.is_discarded, false) = false;

  -- Favoritas
  select count(1) into v_favs
  from public.pipeline_items pi
  where pi.owner_id = v_user_id
    and pi.is_favorite = true
    and pi.is_discarded = false;

  -- No Pipeline
  select count(1) into v_in_pipeline
  from public.pipeline_items pi
  where pi.owner_id = v_user_id
    and pi.is_discarded = false
    and pi.stage not in ('novas', 'descartada');

  -- Por Categoria
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_by_cat
  from (
    select
      coalesce(nullif(trim(o.category), ''), 'Outros') as category,
      count(1) as count,
      coalesce(sum(o.estimated_value), 0) as total_value
    from public.opportunities o
    left join public.pipeline_items pi on pi.opportunity_id = o.id and pi.owner_id = v_user_id
    where o.owner_id = v_user_id
      and o.is_compatible = true
      and coalesce(pi.is_discarded, false) = false
    group by coalesce(nullif(trim(o.category), ''), 'Outros')
    order by count desc
    limit 6
  ) sub;

  -- Por Órgão
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_by_agency
  from (
    select
      coalesce(nullif(trim(o.agency_name), ''), 'Não informado') as agency_name,
      count(1) as count,
      coalesce(sum(o.estimated_value), 0) as total_value
    from public.opportunities o
    left join public.pipeline_items pi on pi.opportunity_id = o.id and pi.owner_id = v_user_id
    where o.owner_id = v_user_id
      and o.is_compatible = true
      and coalesce(pi.is_discarded, false) = false
    group by coalesce(nullif(trim(o.agency_name), ''), 'Não informado')
    order by count desc
    limit 6
  ) sub;

  -- Por Modalidade
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_by_modality
  from (
    select
      coalesce(nullif(trim(o.modality), ''), 'Outras') as modality,
      count(1) as count,
      coalesce(sum(o.estimated_value), 0) as total_value
    from public.opportunities o
    left join public.pipeline_items pi on pi.opportunity_id = o.id and pi.owner_id = v_user_id
    where o.owner_id = v_user_id
      and o.is_compatible = true
      and coalesce(pi.is_discarded, false) = false
    group by coalesce(nullif(trim(o.modality), ''), 'Outras')
    order by count desc
    limit 6
  ) sub;

  -- Por Estado
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_by_state
  from (
    select
      coalesce(nullif(trim(o.state), ''), 'ND') as state,
      count(1) as count,
      coalesce(sum(o.estimated_value), 0) as total_value
    from public.opportunities o
    left join public.pipeline_items pi on pi.opportunity_id = o.id and pi.owner_id = v_user_id
    where o.owner_id = v_user_id
      and o.is_compatible = true
      and coalesce(pi.is_discarded, false) = false
    group by coalesce(nullif(trim(o.state), ''), 'ND')
    order by count desc
    limit 8
  ) sub;

  -- Por Classificação de Score
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_by_score
  from (
    select
      coalesce(sc.classification, 'unranked') as classification,
      count(1) as count
    from public.opportunities o
    left join public.opportunity_scores sc on sc.opportunity_id = o.id
    left join public.pipeline_items pi on pi.opportunity_id = o.id and pi.owner_id = v_user_id
    where o.owner_id = v_user_id
      and o.is_compatible = true
      and coalesce(pi.is_discarded, false) = false
    group by coalesce(sc.classification, 'unranked')
    order by count desc
  ) sub;

  return jsonb_build_object(
    'new_opportunities', v_new_opps,
    'closing_today', v_closing_today,
    'closing_next_days', v_closing_next,
    'total_value', v_total_val,
    'favorites_count', v_favs,
    'in_pipeline_count', v_in_pipeline,
    'by_category', v_by_cat,
    'by_agency', v_by_agency,
    'by_modality', v_by_modality,
    'by_state', v_by_state,
    'by_score_classification', v_by_score
  );
end;
$$;

grant execute on function public.get_dashboard_metrics(int) to authenticated;

-- 5. search_opportunities
create or replace function public.search_opportunities(
  filters jsonb default '{}'::jsonb
)
returns table (
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
  delivery_deadline_days int,
  payment_deadline_days int,
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
  score int,
  classification text,
  reasons text[],
  is_favorite boolean,
  is_discarded boolean,
  stage text,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_keyword text;
  v_category text;
  v_catmat text;
  v_val_min numeric;
  v_val_max numeric;
  v_state text;
  v_city text;
  v_agency text;
  v_modality text;
  v_sess_from timestamptz;
  v_sess_to timestamptz;
  v_delivery_max int;
  v_payment_max int;
  v_is_me_epp boolean;
  v_req_sample boolean;
  v_req_cert boolean;
  v_req_warr boolean;
  v_req_cap boolean;
  v_src_slug text;
  v_score_min int;
  v_class text;
  v_fav boolean;
  v_discard boolean;
  v_stage text;
  v_only_comp boolean;
  v_sort text;
  v_limit int;
  v_offset int;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Não autorizado.';
  end if;

  -- Extrair parâmetros
  v_keyword := nullif(trim(filters->>'keyword'), '');
  v_category := nullif(trim(filters->>'category'), '');
  v_catmat := nullif(trim(filters->>'catmat_catser_code'), '');
  v_val_min := (filters->>'value_min')::numeric;
  v_val_max := (filters->>'value_max')::numeric;
  v_state := nullif(trim(filters->>'state'), '');
  v_city := nullif(trim(filters->>'city'), '');
  v_agency := nullif(trim(filters->>'agency_name'), '');
  v_modality := nullif(trim(filters->>'modality'), '');
  v_sess_from := (filters->>'session_date_from')::timestamptz;
  v_sess_to := (filters->>'session_date_to')::timestamptz;
  v_delivery_max := (filters->>'delivery_deadline_max_days')::int;
  v_payment_max := (filters->>'payment_deadline_max_days')::int;
  v_is_me_epp := (filters->>'is_me_epp')::boolean;
  v_req_sample := (filters->>'requires_sample')::boolean;
  v_req_cert := (filters->>'requires_certificate')::boolean;
  v_req_warr := (filters->>'requires_warranty')::boolean;
  v_req_cap := (filters->>'requires_min_capital')::boolean;
  v_src_slug := nullif(trim(filters->>'source_slug'), '');
  v_score_min := (filters->>'score_min')::int;
  v_class := nullif(trim(filters->>'classification'), '');
  v_fav := (filters->>'is_favorite')::boolean;
  v_discard := (filters->>'is_discarded')::boolean;
  v_stage := nullif(trim(filters->>'stage'), '');
  v_only_comp := coalesce((filters->>'only_compatible')::boolean, false);
  v_sort := coalesce(nullif(trim(filters->>'sort'), ''), 'score_desc');
  v_limit := coalesce((filters->>'limit')::int, 50);
  v_offset := coalesce((filters->>'offset')::int, 0);

  return query
  with filtered as (
    select
      o.id,
      o.agency_name,
      o.process_number,
      o.modality,
      o.object_description,
      o.category,
      o.catmat_catser_code,
      o.estimated_value,
      o.quantity,
      o.state,
      o.city,
      o.session_date,
      o.delivery_deadline_days,
      o.payment_deadline_days,
      o.status_situation,
      o.is_me_epp,
      o.requires_sample,
      o.requires_certificate,
      o.requires_warranty,
      o.requires_min_capital,
      o.closing_date,
      o.is_compatible,
      o.source_url,
      src.slug as source_slug,
      coalesce(sc.score, 0) as score,
      coalesce(sc.classification, 'red') as classification,
      coalesce(sc.reasons, '{}'::text[]) as reasons,
      coalesce(pi.is_favorite, false) as is_favorite,
      coalesce(pi.is_discarded, false) as is_discarded,
      coalesce(pi.stage, 'novas') as stage,
      count(*) over() as total_count
    from public.opportunities o
    left join public.sources src on src.id = o.source_id
    left join public.opportunity_scores sc on sc.opportunity_id = o.id
    left join public.pipeline_items pi on pi.opportunity_id = o.id and pi.owner_id = v_user_id
    where o.owner_id = v_user_id
      and (v_only_comp = false or o.is_compatible = true)
      and (v_keyword is null or to_tsvector('portuguese', coalesce(o.object_description, '')) @@ plainto_tsquery('portuguese', v_keyword) or o.object_description ilike '%' || v_keyword || '%')
      and (v_category is null or o.category ilike '%' || v_category || '%')
      and (v_catmat is null or o.catmat_catser_code ilike '%' || v_catmat || '%')
      and (v_val_min is null or o.estimated_value >= v_val_min)
      and (v_val_max is null or o.estimated_value <= v_val_max)
      and (v_state is null or o.state = v_state)
      and (v_city is null or o.city ilike '%' || v_city || '%')
      and (v_agency is null or o.agency_name ilike '%' || v_agency || '%')
      and (v_modality is null or o.modality ilike '%' || v_modality || '%')
      and (v_sess_from is null or o.session_date >= v_sess_from)
      and (v_sess_to is null or o.session_date <= v_sess_to)
      and (v_delivery_max is null or o.delivery_deadline_days <= v_delivery_max)
      and (v_payment_max is null or o.payment_deadline_days <= v_payment_max)
      and (v_is_me_epp is null or o.is_me_epp = v_is_me_epp)
      and (v_req_sample is null or o.requires_sample = v_req_sample)
      and (v_req_cert is null or o.requires_certificate = v_req_cert)
      and (v_req_warr is null or o.requires_warranty = v_req_warr)
      and (v_req_cap is null or o.requires_min_capital = v_req_cap)
      and (v_src_slug is null or src.slug = v_src_slug)
      and (v_score_min is null or coalesce(sc.score, 0) >= v_score_min)
      and (v_class is null or sc.classification = v_class)
      and (v_fav is null or coalesce(pi.is_favorite, false) = v_fav)
      and (v_discard is null or coalesce(pi.is_discarded, false) = v_discard)
      and (v_stage is null or coalesce(pi.stage, 'novas') = v_stage)
  )
  select *
  from filtered
  order by
    case when v_sort = 'score_desc' then score end desc nulls last,
    case when v_sort = 'score_asc' then score end asc nulls last,
    case when v_sort = 'value_desc' then estimated_value end desc nulls last,
    case when v_sort = 'value_asc' then estimated_value end asc nulls last,
    case when v_sort = 'closing_asc' then closing_date end asc nulls last,
    case when v_sort = 'session_asc' then session_date end asc nulls last,
    id desc
  limit v_limit
  offset v_offset;
end;
$$;

grant execute on function public.search_opportunities(jsonb) to authenticated;

-- 6. get_intelligence_report
create or replace function public.get_intelligence_report(
  date_from timestamptz default null,
  date_to timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_total int := 0;
  v_won int := 0;
  v_lost int := 0;
  v_disqualified int := 0;
  v_canceled int := 0;
  v_win_rate numeric(5,2) := 0;
  v_total_revenue numeric(14,2) := 0;
  v_total_profit numeric(14,2) := 0;
  v_avg_profit numeric(14,2) := 0;
  v_avg_margin numeric(5,2) := 0;
  v_avg_competitors numeric(5,2) := 0;
  v_top_products jsonb := '[]'::jsonb;
  v_top_agencies jsonb := '[]'::jsonb;
  v_by_modality jsonb := '[]'::jsonb;
  v_monthly_history jsonb := '[]'::jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Não autorizado.';
  end if;

  -- Totais e Médias
  select
    count(1),
    count(case when ph.result = 'won' then 1 end),
    count(case when ph.result = 'lost' then 1 end),
    count(case when ph.result = 'disqualified' then 1 end),
    count(case when ph.result = 'canceled' then 1 end),
    coalesce(sum(case when ph.result = 'won' then ph.winning_value else 0 end), 0),
    coalesce(sum(case when ph.result = 'won' then ph.actual_profit else 0 end), 0),
    coalesce(avg(case when ph.result = 'won' then ph.actual_profit end), 0),
    coalesce(avg(case when ph.result = 'won' then ph.actual_margin_pct end), 0),
    coalesce(avg(ph.competitors_count), 0)
  into
    v_total,
    v_won,
    v_lost,
    v_disqualified,
    v_canceled,
    v_total_revenue,
    v_total_profit,
    v_avg_profit,
    v_avg_margin,
    v_avg_competitors
  from public.participation_history ph
  where ph.owner_id = v_user_id
    and (date_from is null or ph.recorded_at >= date_from)
    and (date_to is null or ph.recorded_at <= date_to);

  if v_total > 0 then
    v_win_rate := round((v_won::numeric / v_total::numeric) * 100, 2);
  else
    v_win_rate := 0;
  end if;

  -- Produtos Mais Lucrativos
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_top_products
  from (
    select
      p.id as product_id,
      p.name as product_name,
      p.category as product_category,
      count(1) as total_participations,
      count(case when ph.result = 'won' then 1 end) as wins,
      coalesce(sum(case when ph.result = 'won' then ph.actual_profit else 0 end), 0) as total_profit,
      coalesce(avg(case when ph.result = 'won' then ph.actual_margin_pct end), 0) as avg_margin_pct
    from public.participation_history ph
    join public.products p on p.id = ph.main_product_id
    where ph.owner_id = v_user_id
      and (date_from is null or ph.recorded_at >= date_from)
      and (date_to is null or ph.recorded_at <= date_to)
    group by p.id, p.name, p.category
    order by total_profit desc, wins desc
    limit 6
  ) sub;

  -- Órgãos que mais compram
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_top_agencies
  from (
    select
      coalesce(nullif(trim(ph.agency_name), ''), 'Órgão Desconhecido') as agency_name,
      count(1) as participations,
      count(case when ph.result = 'won' then 1 end) as wins,
      coalesce(sum(case when ph.result = 'won' then ph.winning_value else 0 end), 0) as total_value_won,
      coalesce(sum(case when ph.result = 'won' then ph.actual_profit else 0 end), 0) as total_profit
    from public.participation_history ph
    where ph.owner_id = v_user_id
      and (date_from is null or ph.recorded_at >= date_from)
      and (date_to is null or ph.recorded_at <= date_to)
    group by coalesce(nullif(trim(ph.agency_name), ''), 'Órgão Desconhecido')
    order by wins desc, total_value_won desc
    limit 6
  ) sub;

  -- Histórico Mensal
  select coalesce(jsonb_agg(sub), '[]'::jsonb) into v_monthly_history
  from (
    select
      to_char(ph.recorded_at, 'YYYY-MM') as month,
      count(1) as participations,
      count(case when ph.result = 'won' then 1 end) as wins,
      coalesce(sum(case when ph.result = 'won' then ph.winning_value else 0 end), 0) as revenue,
      coalesce(sum(case when ph.result = 'won' then ph.actual_profit else 0 end), 0) as profit
    from public.participation_history ph
    where ph.owner_id = v_user_id
      and (date_from is null or ph.recorded_at >= date_from)
      and (date_to is null or ph.recorded_at <= date_to)
    group by to_char(ph.recorded_at, 'YYYY-MM')
    order by month asc
    limit 12
  ) sub;

  return jsonb_build_object(
    'total_participations', v_total,
    'won_count', v_won,
    'lost_count', v_lost,
    'disqualified_count', v_disqualified,
    'canceled_count', v_canceled,
    'win_rate_pct', v_win_rate,
    'total_revenue_won', v_total_revenue,
    'total_profit_realized', v_total_profit,
    'avg_profit', round(v_avg_profit, 2),
    'avg_margin_pct', round(v_avg_margin, 2),
    'avg_competitors', round(v_avg_competitors, 1),
    'most_profitable_products', v_top_products,
    'top_buying_agencies', v_top_agencies,
    'monthly_history', v_monthly_history
  );
end;
$$;

grant execute on function public.get_intelligence_report(timestamptz, timestamptz) to authenticated;
