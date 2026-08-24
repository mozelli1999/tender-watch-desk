create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- === company_settings ===
create table public.company_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  available_capital numeric(14,2) not null default 0,
  min_margin_pct numeric(5,2) not null default 0,
  service_states text[] not null default '{}',
  service_cities text[] not null default '{}',
  score_green_min int not null default 70,
  score_yellow_min int not null default 40,
  default_tax_pct numeric(5,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index idx_company_settings_owner on public.company_settings (owner_id);
create trigger trg_company_settings_updated_at before update on public.company_settings for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.company_settings to authenticated;
grant all on public.company_settings to service_role;
alter table public.company_settings enable row level security;
create policy "company_settings_select_own" on public.company_settings for select to authenticated using (owner_id = auth.uid());
create policy "company_settings_insert_own" on public.company_settings for insert to authenticated with check (owner_id = auth.uid());
create policy "company_settings_update_own" on public.company_settings for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "company_settings_delete_own" on public.company_settings for delete to authenticated using (owner_id = auth.uid());

-- === products ===
create table public.products (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text,
  catmat_catser_code text,
  avg_purchase_price numeric(14,2),
  min_margin_pct numeric(5,2),
  supply_lead_time_days int,
  freight_cost numeric(14,2),
  keywords text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_products_owner on public.products (owner_id);
create index idx_products_catmat on public.products (catmat_catser_code);
create index idx_products_category on public.products (category);
create index idx_products_keywords on public.products using gin (keywords);
create trigger trg_products_updated_at before update on public.products for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.products to authenticated;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "products_select_own" on public.products for select to authenticated using (owner_id = auth.uid());
create policy "products_insert_own" on public.products for insert to authenticated with check (owner_id = auth.uid());
create policy "products_update_own" on public.products for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "products_delete_own" on public.products for delete to authenticated using (owner_id = auth.uid());

-- === suppliers ===
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  contact_info text,
  payment_terms_days int,
  default_freight_cost numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_suppliers_owner on public.suppliers (owner_id);
create trigger trg_suppliers_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.suppliers to authenticated;
grant all on public.suppliers to service_role;
alter table public.suppliers enable row level security;
create policy "suppliers_select_own" on public.suppliers for select to authenticated using (owner_id = auth.uid());
create policy "suppliers_insert_own" on public.suppliers for insert to authenticated with check (owner_id = auth.uid());
create policy "suppliers_update_own" on public.suppliers for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "suppliers_delete_own" on public.suppliers for delete to authenticated using (owner_id = auth.uid());

-- === sources ===
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  base_url text,
  integration_type text not null,
  is_active boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_sources_updated_at before update on public.sources for each row execute function public.set_updated_at();
grant select on public.sources to authenticated;
grant all on public.sources to service_role;
alter table public.sources enable row level security;
create policy "sources_select_authenticated" on public.sources for select to authenticated using (true);

-- === product_suppliers ===
create table public.product_suppliers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  unit_price numeric(14,2) not null,
  lead_time_days int,
  freight_cost numeric(14,2),
  payment_terms_days int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, supplier_id)
);
create index idx_prodsup_owner on public.product_suppliers (owner_id);
create index idx_prodsup_product on public.product_suppliers (product_id);
create index idx_prodsup_supplier on public.product_suppliers (supplier_id);
create trigger trg_product_suppliers_updated_at before update on public.product_suppliers for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.product_suppliers to authenticated;
grant all on public.product_suppliers to service_role;
alter table public.product_suppliers enable row level security;
create policy "product_suppliers_select_own" on public.product_suppliers for select to authenticated using (owner_id = auth.uid());
create policy "product_suppliers_insert_own" on public.product_suppliers for insert to authenticated with check (owner_id = auth.uid());
create policy "product_suppliers_update_own" on public.product_suppliers for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "product_suppliers_delete_own" on public.product_suppliers for delete to authenticated using (owner_id = auth.uid());

-- === opportunities ===
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.sources(id) on delete restrict,
  source_external_id text not null,
  source_url text not null,
  agency_name text,
  process_number text,
  modality text,
  object_description text,
  category text,
  catmat_catser_code text,
  estimated_value numeric(14,2),
  quantity numeric(14,2),
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
  is_compatible boolean not null default false,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, source_external_id)
);
create index idx_opp_owner on public.opportunities (owner_id);
create index idx_opp_source on public.opportunities (source_id);
create index idx_opp_state on public.opportunities (state);
create index idx_opp_category on public.opportunities (category);
create index idx_opp_catmat on public.opportunities (catmat_catser_code);
create index idx_opp_modality on public.opportunities (modality);
create index idx_opp_value on public.opportunities (estimated_value);
create index idx_opp_session on public.opportunities (session_date);
create index idx_opp_closing on public.opportunities (closing_date);
create index idx_opp_compatible on public.opportunities (is_compatible);
create index idx_opp_raw_payload on public.opportunities using gin (raw_payload);
create index idx_opp_object_fts on public.opportunities using gin (to_tsvector('portuguese', coalesce(object_description, '')));
create trigger trg_opportunities_updated_at before update on public.opportunities for each row execute function public.set_updated_at();
grant select on public.opportunities to authenticated;
grant all on public.opportunities to service_role;
alter table public.opportunities enable row level security;
create policy "opportunities_select_own" on public.opportunities for select to authenticated using (owner_id = auth.uid());

-- === opportunity_products ===
create table public.opportunity_products (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  match_reason text,
  created_at timestamptz not null default now(),
  unique (opportunity_id, product_id)
);
create index idx_oppprod_opp on public.opportunity_products (opportunity_id);
create index idx_oppprod_prod on public.opportunity_products (product_id);
grant select on public.opportunity_products to authenticated;
grant all on public.opportunity_products to service_role;
alter table public.opportunity_products enable row level security;
create policy "opportunity_products_select_own" on public.opportunity_products for select to authenticated using (
  exists (select 1 from public.opportunities o where o.id = opportunity_products.opportunity_id and o.owner_id = auth.uid())
);

-- === opportunity_scores ===
create table public.opportunity_scores (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  score int not null,
  classification text not null,
  factors jsonb not null,
  reasons text[] not null default '{}',
  computed_at timestamptz not null default now(),
  unique (opportunity_id)
);
create index idx_score_value on public.opportunity_scores (score);
create index idx_score_class on public.opportunity_scores (classification);
grant select on public.opportunity_scores to authenticated;
grant all on public.opportunity_scores to service_role;
alter table public.opportunity_scores enable row level security;
create policy "opportunity_scores_select_own" on public.opportunity_scores for select to authenticated using (
  exists (select 1 from public.opportunities o where o.id = opportunity_scores.opportunity_id and o.owner_id = auth.uid())
);

-- === edital_analyses ===
create table public.edital_analyses (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  status text not null default 'pending',
  pdf_storage_path text,
  object_extracted text,
  items_json jsonb,
  values_json jsonb,
  dates_json jsonb,
  delivery_info text,
  payment_info text,
  required_documents text[],
  habilitation_info text,
  samples_info text,
  warranties_info text,
  certificates_info text,
  penalties_info text,
  risk_points text[],
  ai_model_used text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id)
);
create index idx_analysis_status on public.edital_analyses (status);
create trigger trg_edital_analyses_updated_at before update on public.edital_analyses for each row execute function public.set_updated_at();
grant select on public.edital_analyses to authenticated;
grant all on public.edital_analyses to service_role;
alter table public.edital_analyses enable row level security;
create policy "edital_analyses_select_own" on public.edital_analyses for select to authenticated using (
  exists (select 1 from public.opportunities o where o.id = edital_analyses.opportunity_id and o.owner_id = auth.uid())
);

-- === financial_simulations ===
create table public.financial_simulations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  selected_supplier_id uuid references public.suppliers(id) on delete set null,
  revenue numeric(14,2),
  product_cost numeric(14,2),
  freight_cost numeric(14,2),
  tax_cost numeric(14,2),
  other_costs numeric(14,2),
  profit numeric(14,2),
  margin_pct numeric(5,2),
  required_capital numeric(14,2),
  max_recommended_bid numeric(14,2),
  cash_flow_impact jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_sim_owner on public.financial_simulations (owner_id);
create index idx_sim_opp on public.financial_simulations (opportunity_id);
create index idx_sim_supplier on public.financial_simulations (selected_supplier_id);
create trigger trg_financial_simulations_updated_at before update on public.financial_simulations for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.financial_simulations to authenticated;
grant all on public.financial_simulations to service_role;
alter table public.financial_simulations enable row level security;
create policy "financial_simulations_select_own" on public.financial_simulations for select to authenticated using (owner_id = auth.uid());
create policy "financial_simulations_insert_own" on public.financial_simulations for insert to authenticated with check (owner_id = auth.uid());
create policy "financial_simulations_update_own" on public.financial_simulations for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "financial_simulations_delete_own" on public.financial_simulations for delete to authenticated using (owner_id = auth.uid());

-- === pipeline_items ===
create table public.pipeline_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  stage text not null default 'novas',
  is_favorite boolean not null default false,
  is_discarded boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id)
);
create index idx_pipeline_owner on public.pipeline_items (owner_id);
create index idx_pipeline_stage on public.pipeline_items (stage);
create index idx_pipeline_favorite on public.pipeline_items (is_favorite);
create index idx_pipeline_discarded on public.pipeline_items (is_discarded);
create trigger trg_pipeline_items_updated_at before update on public.pipeline_items for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.pipeline_items to authenticated;
grant all on public.pipeline_items to service_role;
alter table public.pipeline_items enable row level security;
create policy "pipeline_items_select_own" on public.pipeline_items for select to authenticated using (owner_id = auth.uid());
create policy "pipeline_items_insert_own" on public.pipeline_items for insert to authenticated with check (owner_id = auth.uid());
create policy "pipeline_items_update_own" on public.pipeline_items for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "pipeline_items_delete_own" on public.pipeline_items for delete to authenticated using (owner_id = auth.uid());

-- === participation_history ===
create table public.participation_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  result text not null,
  winning_value numeric(14,2),
  our_bid_value numeric(14,2),
  actual_profit numeric(14,2),
  actual_margin_pct numeric(5,2),
  competitors_count int,
  agency_name text,
  main_product_id uuid references public.products(id) on delete set null,
  recorded_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_hist_owner on public.participation_history (owner_id);
create index idx_hist_result on public.participation_history (result);
create index idx_hist_product on public.participation_history (main_product_id);
create index idx_hist_opp on public.participation_history (opportunity_id);
create trigger trg_participation_history_updated_at before update on public.participation_history for each row execute function public.set_updated_at();
grant select, insert, update, delete on public.participation_history to authenticated;
grant all on public.participation_history to service_role;
alter table public.participation_history enable row level security;
create policy "participation_history_select_own" on public.participation_history for select to authenticated using (owner_id = auth.uid());
create policy "participation_history_insert_own" on public.participation_history for insert to authenticated with check (owner_id = auth.uid());
create policy "participation_history_update_own" on public.participation_history for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "participation_history_delete_own" on public.participation_history for delete to authenticated using (owner_id = auth.uid());

-- === notifications ===
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  type text not null,
  title text not null,
  message text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_notif_owner on public.notifications (owner_id);
create index idx_notif_unread on public.notifications (owner_id, is_read);
create index idx_notif_created on public.notifications (created_at);
create index idx_notif_opp on public.notifications (opportunity_id);
grant select, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "notifications_select_own" on public.notifications for select to authenticated using (owner_id = auth.uid());
create policy "notifications_update_own" on public.notifications for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "notifications_delete_own" on public.notifications for delete to authenticated using (owner_id = auth.uid());

-- === sync_logs ===
create table public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  started_at timestamptz,
  finished_at timestamptz,
  status text not null,
  opportunities_found int default 0,
  error_message text,
  created_at timestamptz not null default now()
);
create index idx_synclog_source on public.sync_logs (source_id);
create index idx_synclog_started on public.sync_logs (started_at);
grant select on public.sync_logs to authenticated;
grant all on public.sync_logs to service_role;
alter table public.sync_logs enable row level security;
create policy "sync_logs_select_authenticated" on public.sync_logs for select to authenticated using (true);