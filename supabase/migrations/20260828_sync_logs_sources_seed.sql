-- ============================================================
-- Migration: sync_logs table + sources seed + cron job
-- Radar de Licitações
-- ============================================================

-- === sync_logs ===
-- Criada aqui caso não tenha sido incluída na migration inicial.
-- Usa IF NOT EXISTS para ser idempotente.

create table if not exists public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  started_at timestamptz,
  finished_at timestamptz,
  status text not null default 'running',  -- 'running' | 'success' | 'error'
  opportunities_found int default 0,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_synclog_source on public.sync_logs (source_id);
create index if not exists idx_synclog_started on public.sync_logs (started_at);

alter table public.sync_logs enable row level security;

-- Leitura pelo Operador autenticado; escrita apenas service_role
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'sync_logs' and policyname = 'sync_logs_select_authenticated'
  ) then
    create policy "sync_logs_select_authenticated" on public.sync_logs
      for select to authenticated using (true);
  end if;
end
$$;

-- ============================================================
-- Seeds de Sources (fontes oficiais de licitação)
-- PNCP — API REST pública, Lei 14.133/2021
-- ComprasNet/Compras.gov.br — Dados Abertos, Decreto 8.777/2016
-- ============================================================

insert into public.sources (slug, name, base_url, integration_type, is_active)
values
  (
    'pncp',
    'PNCP — Portal Nacional de Contratações Públicas',
    'https://pncp.gov.br/api/pncp/v1',
    'api',
    true
  ),
  (
    'comprasnet',
    'ComprasNet / Compras.gov.br (Dados Abertos)',
    'https://compras.dados.gov.br/licitacoes/v1',
    'api',
    true
  )
on conflict (slug) do update set
  name = excluded.name,
  base_url = excluded.base_url,
  integration_type = excluded.integration_type,
  is_active = excluded.is_active;

-- ============================================================
-- Cron jobs via pg_cron (3x ao dia: 06h, 12h, 18h BRT = UTC-3)
-- Requer extensão pg_cron habilitada no Supabase (Project Settings → Extensions)
-- A chamada usa net.http_post (extensão pg_net) para invocar a Edge Function.
-- Substitua <PROJECT-REF> pelo ID do projeto Supabase.
-- ============================================================

-- Descomente e ajuste quando o pg_cron e pg_net estiverem habilitados:

/*
select cron.schedule(
  'sync-sources-morning',
  '0 9 * * *',  -- 09:00 UTC = 06:00 BRT
  $$
    select net.http_post(
      url := 'https://<PROJECT-REF>.supabase.co/functions/v1/sync-sources',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := '{"trigger": "cron"}'::jsonb
    )
  $$
);

select cron.schedule(
  'sync-sources-afternoon',
  '0 15 * * *',  -- 15:00 UTC = 12:00 BRT
  $$
    select net.http_post(
      url := 'https://<PROJECT-REF>.supabase.co/functions/v1/sync-sources',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := '{"trigger": "cron"}'::jsonb
    )
  $$
);

select cron.schedule(
  'sync-sources-evening',
  '0 21 * * *',  -- 21:00 UTC = 18:00 BRT
  $$
    select net.http_post(
      url := 'https://<PROJECT-REF>.supabase.co/functions/v1/sync-sources',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := '{"trigger": "cron"}'::jsonb
    )
  $$
);
*/
