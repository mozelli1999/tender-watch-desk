// Edge Function: sync-sources
// Varre as fontes ativas de licitação (PNCP e ComprasNet/Compras.gov.br),
// normaliza e faz UPSERT das oportunidades captadas, depois encadeia match-opportunities.
//
// ─── FONTES LEGALMENTE PERMITIDAS ───────────────────────────────────────────
//
// 1. PNCP (Portal Nacional de Contratações Públicas)
//    API REST pública, sem autenticação:
//    https://pncp.gov.br/api/pncp/v1/contratacoes/publicadas
//    Documentação oficial: https://pncp.gov.br/app/editais
//    Termos: dados públicos obrigatórios pela Lei 14.133/2021.
//
// 2. ComprasNet / Compras.gov.br
//    A API pública do Compras.gov.br (ex-ComprasNet) disponível em:
//    https://compras.dados.gov.br/docs/home.html  (INDE/dados.gov.br)
//    Endpoint de licitações abertas via CKAN/dados.gov.br:
//    https://api.dados.gov.br/api/catalogo/v2/catalogo/comprasnet (descontinuado)
//    Alternativa atual:
//    Portal de Compras.gov.br Feed de dados abertos — dados.gov.br
//    https://compras.dados.gov.br/licitacoes/v1/licitacoes.json
//    Termos: Dados Abertos do Governo Federal (LAI, Decreto 8.777/2016).
//
// NOTA: Se os endpoints mudarem ou o órgão os remover, sync-sources retorna
// error no sync_log dessa source sem derrubar as demais.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Tipos internos ───────────────────────────────────────────────────────────
interface NormalizedOpportunity {
  owner_id: string;
  source_id: string;
  source_external_id: string;
  source_url: string;
  agency_name: string | null;
  process_number: string | null;
  modality: string | null;
  object_description: string | null;
  category: string | null;
  catmat_catser_code: string | null;
  estimated_value: number | null;
  quantity: number | null;
  state: string | null;
  city: string | null;
  session_date: string | null;
  delivery_deadline_days: number | null;
  payment_deadline_days: number | null;
  status_situation: string | null;
  is_me_epp: boolean | null;
  requires_sample: boolean | null;
  requires_certificate: boolean | null;
  requires_warranty: boolean | null;
  requires_min_capital: boolean | null;
  closing_date: string | null;
  is_compatible: boolean;
  raw_payload: unknown;
}

// ─── Adaptador PNCP ───────────────────────────────────────────────────────────
// API REST pública — https://pncp.gov.br/api/pncp/v1
// Não requer autenticação. Dados obrigatórios por Lei 14.133/2021.
async function fetchPNCP(
  sourceId: string,
  ownerId: string,
  baseUrl: string
): Promise<{ items: NormalizedOpportunity[]; error: string | null }> {
  const items: NormalizedOpportunity[] = [];

  try {
    // Busca contratações publicadas nos últimos 2 dias (paginado)
    const dataInicio = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");
    const dataFim = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    // Página 1 (até 500 por chamada na API PNCP)
    const url = `${baseUrl}/contratacoes/publicadas?dataInicial=${dataInicio}&dataFinal=${dataFim}&pagina=1&tamanhoPagina=100`;

    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "RadarLicitacoes/1.0" },
    });

    if (!res.ok) {
      return { items, error: `PNCP HTTP ${res.status}: ${await res.text().catch(() => "")}` };
    }

    const payload = await res.json();
    const registros: any[] = payload?.data ?? payload?.registros ?? [];

    for (const r of registros) {
      // O PNCP retorna objeto "contratacao" com campos padronizados pela API oficial
      const orgao = r.orgaoEntidade ?? {};
      const unidade = r.unidadeOrgao ?? {};
      const contrato = r.contratacao ?? r;

      items.push({
        owner_id: ownerId,
        source_id: sourceId,
        source_external_id: String(r.sequencialContratacao ?? r.numeroContratacao ?? r.id ?? ""),
        source_url: r.linkSistemaOrigem ?? `https://pncp.gov.br/app/editais/${r.sequencialContratacao ?? ""}`,
        agency_name: orgao.razaoSocial ?? orgao.nomeOrgao ?? r.orgaoNome ?? null,
        process_number: r.numeroContratacao ?? r.sequencialContratacao ?? null,
        modality: r.modalidadeId
          ? modalityName(r.modalidadeId)
          : r.modalidadeNome ?? null,
        object_description: r.objetoCompra ?? r.objeto ?? null,
        category: r.categoriaItemNome ?? null,
        catmat_catser_code: r.codigoItem ?? r.codigoCatmat ?? null,
        estimated_value: parseFloat(r.valorTotalEstimado ?? r.valorEstimado ?? "0") || null,
        quantity: parseFloat(r.quantidadeTotalItem ?? r.quantidade ?? "0") || null,
        state: unidade.ufSigla ?? r.uf ?? null,
        city: unidade.municipioNome ?? r.municipio ?? null,
        session_date: r.dataAberturaProposta ?? r.dataPublicacaoPncp ?? null,
        delivery_deadline_days: r.prazoEntregaDias ?? null,
        payment_deadline_days: r.prazoPagamentoDias ?? null,
        status_situation: r.situacaoCompraId === 1
          ? "Divulgada no PNCP"
          : r.situacaoCompraNome ?? "Publicada",
        is_me_epp: r.srp === false ? false : r.amparoLegalMeEpp ?? null,
        requires_sample: null,
        requires_certificate: null,
        requires_warranty: null,
        requires_min_capital: null,
        closing_date: r.dataEncerramentoProposta ?? null,
        is_compatible: false,
        raw_payload: r,
      });
    }

    return { items, error: null };
  } catch (err) {
    return { items, error: String(err) };
  }
}

// ─── Adaptador ComprasNet / dados.gov.br ─────────────────────────────────────
// Fonte: Portal de Dados Abertos do Governo Federal (dados.gov.br)
// Endpoint: https://compras.dados.gov.br/licitacoes/v1/licitacoes.json
// Termos: Dados Abertos — Decreto 8.777/2016 / LAI (Lei 12.527/2011).
async function fetchComprasNet(
  sourceId: string,
  ownerId: string,
  baseUrl: string
): Promise<{ items: NormalizedOpportunity[]; error: string | null }> {
  const items: NormalizedOpportunity[] = [];

  try {
    // API de Dados Abertos do Compras.gov.br
    const url = `${baseUrl}/licitacoes.json?_limit=100&situacao=aberta`;

    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "RadarLicitacoes/1.0" },
    });

    if (!res.ok) {
      return { items, error: `ComprasNet HTTP ${res.status}: ${await res.text().catch(() => "")}` };
    }

    const payload = await res.json();
    const registros: any[] = Array.isArray(payload) ? payload : (payload?.results ?? payload?.data ?? []);

    for (const r of registros) {
      const externalId = String(r.id_licitacao ?? r.numero ?? r.id ?? "");
      if (!externalId) continue;

      items.push({
        owner_id: ownerId,
        source_id: sourceId,
        source_external_id: externalId,
        source_url: r.link_externo ?? r.url ?? `https://compras.dados.gov.br/licitacoes/id/${externalId}`,
        agency_name: r.nome_orgao ?? r.orgao ?? null,
        process_number: r.numero_processo ?? r.numero ?? null,
        modality: r.modalidade ?? null,
        object_description: r.objeto ?? r.descricao ?? null,
        category: r.tipo_objeto ?? null,
        catmat_catser_code: r.codigo_catmat ?? null,
        estimated_value: parseFloat(r.valor_estimado ?? r.valor ?? "0") || null,
        quantity: null,
        state: r.uf ?? null,
        city: r.municipio ?? null,
        session_date: r.data_abertura ?? null,
        delivery_deadline_days: null,
        payment_deadline_days: null,
        status_situation: r.situacao ?? "Aberta",
        is_me_epp: r.exclusivo_me_epp === "S" ? true : r.exclusivo_me_epp === "N" ? false : null,
        requires_sample: null,
        requires_certificate: null,
        requires_warranty: null,
        requires_min_capital: null,
        closing_date: r.data_encerramento ?? r.data_abertura ?? null,
        is_compatible: false,
        raw_payload: r,
      });
    }

    return { items, error: null };
  } catch (err) {
    return { items, error: String(err) };
  }
}

// ─── Roteador de adaptadores ─────────────────────────────────────────────────
async function runAdapter(
  slug: string,
  sourceId: string,
  ownerId: string,
  baseUrl: string
): Promise<{ items: NormalizedOpportunity[]; error: string | null }> {
  switch (slug) {
    case "pncp":
      return fetchPNCP(sourceId, ownerId, baseUrl ?? "https://pncp.gov.br/api/pncp/v1");
    case "comprasnet":
    case "compras_gov":
      return fetchComprasNet(sourceId, ownerId, baseUrl ?? "https://compras.dados.gov.br/licitacoes/v1");
    default:
      return { items: [], error: `Adaptador desconhecido para source slug: ${slug}` };
  }
}

// ─── Servidor principal ───────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const { source_slug, trigger = "manual" } = body as {
      source_slug?: string;
      trigger?: string;
    };

    // Identificar o Operador (owner_id) — para associar as oportunidades
    // O frontend envia o JWT; fallback para service_role que usa o único owner ativo
    let ownerId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const authedClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user } } = await authedClient.auth.getUser();
      ownerId = user?.id ?? null;
    }

    // Fallback: buscar o único usuário ativo (single-tenant)
    if (!ownerId) {
      const { data: users } = await supabase.auth.admin.listUsers();
      if (users?.users && users.users.length > 0) {
        ownerId = users.users[0].id;
      }
    }

    if (!ownerId) {
      return json({ error: "Não foi possível identificar o proprietário da conta." }, 400);
    }

    // ─── Buscar fontes ativas ─────────────────────────────────────────────
    let sourcesQuery = supabase.from("sources").select("*").eq("is_active", true);
    if (source_slug) sourcesQuery = sourcesQuery.eq("slug", source_slug);
    const { data: sources, error: sourcesError } = await sourcesQuery;

    if (sourcesError) throw sourcesError;
    if (!sources || sources.length === 0) {
      return json({ status: "success", sources_processed: 0, opportunities_found: 0, opportunities_new: 0, sync_log_ids: [] });
    }

    // ─── Processar cada fonte ─────────────────────────────────────────────
    let totalFound = 0;
    let totalNew = 0;
    const syncLogIds: string[] = [];
    const allNewOppIds: string[] = [];

    for (const source of sources as any[]) {
      const startedAt = new Date().toISOString();

      // Criar log inicial
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
      if (logId) syncLogIds.push(logId);

      // Executar adaptador
      const { items, error: adapterError } = await runAdapter(
        source.slug,
        source.id,
        ownerId,
        source.base_url ?? ""
      );

      if (adapterError) {
        // Gravar falha no log
        if (logId) {
          await supabase
            .from("sync_logs")
            .update({
              finished_at: new Date().toISOString(),
              status: "error",
              error_message: adapterError,
            })
            .eq("id", logId);
        }
        console.error(`Source ${source.slug} error:`, adapterError);
        continue;
      }

      totalFound += items.length;

      // ─── UPSERT das oportunidades ─────────────────────────────────────
      let newCount = 0;
      const newOppIds: string[] = [];

      // Processar em batches de 50 para evitar payload gigante
      const BATCH = 50;
      for (let i = 0; i < items.length; i += BATCH) {
        const batch = items.slice(i, i + BATCH);

        const { data: upserted, error: upsertError } = await supabase
          .from("opportunities")
          .upsert(batch, {
            onConflict: "source_id,source_external_id",
            ignoreDuplicates: false, // Atualiza campos mutáveis (situação, datas, valor)
          })
          .select("id, is_compatible");

        if (upsertError) {
          console.error(`Upsert error for source ${source.slug} batch ${i}:`, upsertError);
          continue;
        }

        // IDs das oportunidades recém-inseridas (nunca marcadas como compatíveis)
        const freshIds = (upserted ?? [])
          .filter((o: any) => !o.is_compatible)
          .map((o: any) => o.id);

        newOppIds.push(...freshIds);
        newCount += freshIds.length;
      }

      totalNew += newCount;
      allNewOppIds.push(...newOppIds);

      // Atualizar log com sucesso
      if (logId) {
        await supabase
          .from("sync_logs")
          .update({
            finished_at: new Date().toISOString(),
            status: "success",
            opportunities_found: items.length,
          })
          .eq("id", logId);
      }

      // Atualizar last_synced_at na fonte
      await supabase
        .from("sources")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", source.id);
    }

    // ─── Encadear match-opportunities para as novas ───────────────────────
    if (allNewOppIds.length > 0) {
      supabase.functions
        .invoke("match-opportunities", {
          body: { opportunity_ids: allNewOppIds, reason: trigger === "cron" ? "sync" : "sync" },
        })
        .catch((err: Error) =>
          console.error("Failed to invoke match-opportunities:", err)
        );
    }

    return json({
      status: "success",
      sources_processed: sources.length,
      opportunities_found: totalFound,
      opportunities_new: totalNew,
      sync_log_ids: syncLogIds,
    });
  } catch (error) {
    console.error("Unexpected error in sync-sources:", error);
    return json({ error: "Internal Server Error", details: String(error) }, 500);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function modalityName(id: number): string {
  const map: Record<number, string> = {
    1: "Leilão - Eletrônico",
    2: "Diálogo Competitivo",
    3: "Concurso",
    4: "Concorrência - Eletrônica",
    5: "Concorrência - Presencial",
    6: "Pregão - Eletrônico",
    7: "Pregão - Presencial",
    8: "Dispensa de Licitação",
    9: "Inexigibilidade",
    10: "Manifestação de Interesse",
    11: "Pré-qualificação",
    12: "Credenciamento",
    13: "Leilão - Presencial",
  };
  return map[id] ?? `Modalidade ${id}`;
}
