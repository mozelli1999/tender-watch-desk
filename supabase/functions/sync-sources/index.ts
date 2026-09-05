// Edge Function: sync-sources
// COLETAR → NORMALIZAR → DEDUPLICAR → gravar. Nenhuma IA é usada aqui.
//
// Arquitetura modular: cada fonte é um conector independente em ./connectors/,
// registrado em ./connectors/registry.ts. Adicionar fonte nova = novo arquivo + registro.
//
// Fontes com API/dados abertos oficiais: PNCP e Compras.gov.br.
// Portais privados (Portal de Compras Públicas, BLL, Licitanet, Licitações-e, Compras BR)
// não expõem API pública de consulta: ficam registrados aguardando acesso oficial e suas
// licitações chegam via PNCP com o portal de origem identificado. Nada de scraping que
// contorne login, CAPTCHA ou proteções.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { getConnector } from "./connectors/registry.ts";
import type { NormalizedOpportunity } from "./connectors/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json().catch(() => ({}));
    const { source_slug, trigger = "manual" } = body as {
      source_slug?: string;
      trigger?: string;
    };

    // ─── Identificar o Operador (single-tenant) ────────────────────────────
    let ownerId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const authedClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data } = await authedClient.auth.getUser();
      ownerId = data?.user?.id ?? null;
    }

    if (!ownerId) {
      const { data: users } = await supabase.auth.admin.listUsers();
      if (users?.users?.length) ownerId = users.users[0].id;
    }

    if (!ownerId) {
      return json({ error: "Não foi possível identificar o proprietário da conta." }, 400);
    }

    // ─── Fontes ativas ────────────────────────────────────────────────────
    let sourcesQuery = supabase.from("sources").select("*").eq("is_active", true);
    if (source_slug) sourcesQuery = supabase.from("sources").select("*").eq("slug", source_slug);
    const { data: sources, error: sourcesError } = await sourcesQuery;

    if (sourcesError) throw sourcesError;
    if (!sources || sources.length === 0) {
      return json({
        status: "success",
        sources_processed: 0,
        opportunities_found: 0,
        opportunities_new: 0,
        duplicates_linked: 0,
        per_source: [],
      });
    }

    let totalFound = 0;
    let totalNew = 0;
    let totalDuplicates = 0;
    const perSource: Array<Record<string, unknown>> = [];
    const allTouchedIds: string[] = [];

    for (const source of sources as any[]) {
      const startedAt = new Date().toISOString();
      const connector = getConnector(source.slug);

      const { data: logEntry } = await supabase
        .from("sync_logs")
        .insert({
          source_id: source.id,
          started_at: startedAt,
          status: "running",
          opportunities_found: 0,
        })
        .select("id")
        .single();
      const logId = logEntry?.id;

      if (!connector) {
        const msg = `Nenhum conector registrado para a fonte "${source.slug}".`;
        await finishLog(supabase, logId, "error", 0, msg);
        perSource.push({ slug: source.slug, status: "error", message: msg, found: 0, new: 0 });
        continue;
      }

      const { items, error: adapterError, endpointUsed } = await connector.run({
        sourceId: source.id,
        ownerId,
        baseUrl: source.base_url ?? "",
        env: (name: string) => Deno.env.get(name) ?? undefined,
      });

      if (items.length === 0) {
        const status = adapterError ? "error" : "success";
        await finishLog(supabase, logId, status, 0, adapterError);
        perSource.push({
          slug: source.slug,
          status,
          message: adapterError,
          endpoint: endpointUsed ?? null,
          found: 0,
          new: 0,
        });
        continue;
      }

      totalFound += items.length;

      // ─── Gravação + deduplicação ────────────────────────────────────────
      const { inserted, duplicates, touchedIds, error: writeError } = await persistItems(
        supabase,
        items,
        source,
      );

      totalNew += inserted;
      totalDuplicates += duplicates;
      allTouchedIds.push(...touchedIds);

      await finishLog(
        supabase,
        logId,
        writeError ? "error" : "success",
        items.length,
        writeError ?? adapterError,
      );

      await supabase
        .from("sources")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", source.id);

      perSource.push({
        slug: source.slug,
        status: writeError ? "error" : "success",
        message: writeError ?? adapterError ?? null,
        endpoint: endpointUsed ?? null,
        found: items.length,
        new: inserted,
        duplicates_linked: duplicates,
      });
    }

    // ─── Encadeia apenas o cruzamento com o catálogo (SEM IA) ──────────────
    if (allTouchedIds.length > 0) {
      fetch(`${supabaseUrl}/functions/v1/match-opportunities`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ opportunity_ids: allTouchedIds.slice(0, 500), reason: trigger }),
      }).catch((err) => console.error("Falha ao encadear match-opportunities:", err));
    }

    return json({
      status: "success",
      sources_processed: sources.length,
      opportunities_found: totalFound,
      opportunities_new: totalNew,
      duplicates_linked: totalDuplicates,
      per_source: perSource,
    });
  } catch (error) {
    console.error("Erro inesperado em sync-sources:", error);
    return json({ error: "Internal Server Error", details: String(error) }, 500);
  }
});

// ─── Persistência com deduplicação ──────────────────────────────────────────
async function persistItems(
  supabase: any,
  items: NormalizedOpportunity[],
  source: any,
): Promise<{ inserted: number; duplicates: number; touchedIds: string[]; error: string | null }> {
  let inserted = 0;
  let duplicates = 0;
  const touchedIds: string[] = [];

  const BATCH = 50;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);

    const { data: upserted, error } = await supabase
      .from("opportunities")
      .upsert(batch, { onConflict: "source_id,source_external_id", ignoreDuplicates: false })
      .select("id, business_key, source_id, canonical_id, created_at");

    if (error) {
      console.error(`Erro ao gravar lote da fonte ${source.slug}:`, error);
      return { inserted, duplicates, touchedIds, error: String(error.message ?? error) };
    }

    const rows = upserted ?? [];
    inserted += rows.length;
    touchedIds.push(...rows.map((r: any) => r.id));

    // Deduplicação: mesma chave de negócio em fontes diferentes → uma principal
    const keys = [...new Set(rows.map((r: any) => r.business_key).filter(Boolean))];
    if (keys.length === 0) continue;

    const { data: siblings } = await supabase
      .from("opportunities")
      .select("id, business_key, source_id, canonical_id, created_at")
      .eq("owner_id", batch[0].owner_id)
      .in("business_key", keys as string[]);

    if (!siblings) continue;

    const bySourcePriority = new Map<string, number>();
    const { data: allSources } = await supabase.from("sources").select("id, priority");
    for (const s of allSources ?? []) bySourcePriority.set(s.id, s.priority ?? 100);

    const groups = new Map<string, any[]>();
    for (const row of siblings) {
      const list = groups.get(row.business_key) ?? [];
      list.push(row);
      groups.set(row.business_key, list);
    }

    for (const [, group] of groups) {
      if (group.length < 2) continue;

      // Principal = fonte de maior prioridade (menor número), empate pela mais antiga
      const sorted = [...group].sort((a, b) => {
        const pa = bySourcePriority.get(a.source_id) ?? 100;
        const pb = bySourcePriority.get(b.source_id) ?? 100;
        if (pa !== pb) return pa - pb;
        return String(a.created_at).localeCompare(String(b.created_at));
      });
      const canonical = sorted[0];

      for (const row of sorted.slice(1)) {
        if (row.canonical_id === canonical.id) continue;
        const { error: linkError } = await supabase
          .from("opportunities")
          .update({ canonical_id: canonical.id })
          .eq("id", row.id);
        if (!linkError) duplicates++;
      }

      if (canonical.canonical_id !== null) {
        await supabase.from("opportunities").update({ canonical_id: null }).eq("id", canonical.id);
      }
    }
  }

  return { inserted, duplicates, touchedIds, error: null };
}

async function finishLog(
  supabase: any,
  logId: string | undefined,
  status: string,
  found: number,
  errorMessage?: string | null,
) {
  if (!logId) return;
  await supabase
    .from("sync_logs")
    .update({
      finished_at: new Date().toISOString(),
      status,
      opportunities_found: found,
      error_message: errorMessage ?? null,
    })
    .eq("id", logId);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
