// Edge Function: compute-score
// Score 0–100 SEM IA — calculado apenas com dados do banco e do perfil do operador.
//
// Dimensões:
//   compatibilidade de categoria/produto ... 30
//   valor dentro da faixa desejada ......... 20
//   localização (UF / município) ........... 15
//   modalidade preferida ................... 10
//   prazo de entrega ....................... 10
//   ME/EPP ................................. 10
//   exigências documentais ................. 5
//
// Classificação: 🟢 80–100 | 🟡 60–79 | 🟠 40–59 | 🔴 0–39

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ComputeScoreRequest {
  opportunity_id?: string;
  opportunity_ids?: string[];
  recompute_all?: boolean;
}

function classify(score: number): "green" | "yellow" | "orange" | "red" {
  if (score >= 80) return "green";
  if (score >= 60) return "yellow";
  if (score >= 40) return "orange";
  return "red";
}

const norm = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body: ComputeScoreRequest = await req.json().catch(() => ({}));
    const { opportunity_id, opportunity_ids, recompute_all = false } = body;

    let oppQuery = supabase.from("opportunities").select(`
      id, owner_id, agency_name, modality, object_description, category,
      estimated_value, delivery_deadline_days, payment_deadline_days,
      state, city, is_me_epp, is_srp, requires_sample, requires_certificate,
      requires_warranty, requires_min_capital, is_compatible, canonical_id
    `);

    if (opportunity_id) {
      oppQuery = oppQuery.eq("id", opportunity_id);
    } else if (opportunity_ids?.length) {
      oppQuery = oppQuery.in("id", opportunity_ids);
    } else if (!recompute_all) {
      oppQuery = oppQuery.order("created_at", { ascending: false }).limit(200);
    }

    const { data: opportunities, error: oppError } = await oppQuery;
    if (oppError) throw oppError;
    if (!opportunities || opportunities.length === 0) {
      return json({ status: "success", scored: 0, results: [], message: "Nenhuma oportunidade a processar." });
    }

    const settingsCache = new Map<string, any>();
    const productsCache = new Map<string, any[]>();
    const results: Array<{ opportunity_id: string; score: number; classification: string }> = [];

    for (const opp of opportunities as any[]) {
      const ownerId = opp.owner_id;

      if (!settingsCache.has(ownerId)) {
        const { data: settings } = await supabase
          .from("company_settings")
          .select("*")
          .eq("owner_id", ownerId)
          .maybeSingle();
        settingsCache.set(ownerId, settings ?? {});
      }
      const st = settingsCache.get(ownerId) ?? {};

      if (!productsCache.has(ownerId)) {
        const { data: prods } = await supabase
          .from("products")
          .select("name, category, keywords")
          .eq("owner_id", ownerId)
          .eq("is_active", true);
        productsCache.set(ownerId, prods ?? []);
      }
      const products = productsCache.get(ownerId) ?? [];

      const { data: matched } = await supabase
        .from("opportunity_products")
        .select("product_id, match_reason")
        .eq("opportunity_id", opp.id);

      const reasons: string[] = [];
      const haystack = `${norm(opp.object_description)} ${norm(opp.category)}`;

      // 1. Compatibilidade de categoria/produto (0–30)
      let fCompat = 0;
      const matchReasons = (matched ?? []).map((m: any) => m.match_reason);
      const prefCats: string[] = st.preferred_categories ?? [];
      const catHit = prefCats.some((c) => haystack.includes(norm(c)));

      if (matchReasons.includes("catmat")) {
        fCompat = 30;
        reasons.push("Produto do catálogo casado pelo código CATMAT/CATSER");
      } else if (matchReasons.includes("category") || catHit) {
        fCompat = 25;
        reasons.push("Categoria compatível com o perfil cadastrado");
      } else if (matchReasons.includes("keyword")) {
        fCompat = 20;
        reasons.push("Objeto menciona palavras-chave dos produtos cadastrados");
      } else if (
        products.some(
          (p: any) =>
            (p.keywords ?? []).some((k: string) => k.length > 2 && haystack.includes(norm(k))) ||
            (p.category && haystack.includes(norm(p.category))),
        )
      ) {
        fCompat = 15;
        reasons.push("Aderência parcial ao catálogo de produtos");
      } else {
        reasons.push("Sem correspondência clara com o catálogo cadastrado");
      }

      // 2. Valor dentro da faixa (0–20)
      let fValue = 8;
      const value = Number(opp.estimated_value ?? 0);
      const minV = st.min_value != null ? Number(st.min_value) : null;
      const maxV = st.max_value != null ? Number(st.max_value) : null;
      const capital = st.available_capital != null ? Number(st.available_capital) : null;

      if (!value) {
        fValue = 8;
        reasons.push("Valor estimado não informado pela fonte");
      } else if ((minV === null || value >= minV) && (maxV === null || value <= maxV)) {
        fValue = 20;
        reasons.push(`Valor estimado dentro da faixa desejada (R$ ${value.toLocaleString("pt-BR")})`);
      } else if (maxV !== null && value > maxV) {
        fValue = value <= maxV * 1.5 ? 10 : 3;
        reasons.push(`Valor acima do teto cadastrado (R$ ${value.toLocaleString("pt-BR")})`);
      } else {
        fValue = 10;
        reasons.push(`Valor abaixo do mínimo cadastrado (R$ ${value.toLocaleString("pt-BR")})`);
      }
      if (capital && value && value > capital) {
        fValue = Math.min(fValue, 8);
        reasons.push("Valor exige capital de giro acima do disponível cadastrado");
      }

      // 3. Localização (0–15)
      let fLocation = 7;
      const states: string[] = st.service_states ?? [];
      const cities: string[] = st.service_cities ?? [];
      if (cities.length && opp.city && cities.some((c: string) => norm(c) === norm(opp.city))) {
        fLocation = 15;
        reasons.push(`Município atendido diretamente (${opp.city})`);
      } else if (states.length && opp.state && states.includes(opp.state)) {
        fLocation = 13;
        reasons.push(`Estado atendido (${opp.state})`);
      } else if (states.length && opp.state) {
        fLocation = 3;
        reasons.push(`Estado ${opp.state} fora da área de atendimento cadastrada`);
      }

      // 4. Modalidade preferida (0–10)
      let fModality = 6;
      const prefMods: string[] = st.preferred_modalities ?? [];
      if (prefMods.length && opp.modality) {
        if (prefMods.some((m) => norm(opp.modality).includes(norm(m)))) {
          fModality = 10;
          reasons.push(`Modalidade preferida (${opp.modality})`);
        } else {
          fModality = 3;
          reasons.push(`Modalidade ${opp.modality} fora das preferências`);
        }
      }

      // 5. Prazo de entrega (0–10)
      let fDeadline = 6;
      const maxDelivery = st.max_delivery_days != null ? Number(st.max_delivery_days) : null;
      if (opp.delivery_deadline_days == null) {
        fDeadline = 6;
      } else if (maxDelivery === null) {
        fDeadline = opp.delivery_deadline_days >= 15 ? 9 : 5;
      } else if (opp.delivery_deadline_days >= maxDelivery) {
        fDeadline = 10;
        reasons.push(`Prazo de entrega confortável (${opp.delivery_deadline_days} dias)`);
      } else {
        fDeadline = 3;
        reasons.push(`Prazo de entrega apertado (${opp.delivery_deadline_days} dias)`);
      }

      // 6. ME/EPP (0–10)
      let fMeEpp = 5;
      if (opp.is_me_epp === true) {
        fMeEpp = 10;
        reasons.push("Exclusiva/diferenciada para ME/EPP");
      } else if (st.prefer_me_epp && opp.is_me_epp === false) {
        fMeEpp = 2;
        reasons.push("Ampla concorrência (perfil prefere ME/EPP)");
      }

      // 7. Exigências documentais (0–5)
      let penalties = 0;
      if (opp.requires_sample) penalties += 2;
      if (opp.requires_certificate) penalties += 1;
      if (opp.requires_warranty) penalties += 1;
      if (opp.requires_min_capital) penalties += 1;
      const fDocs = Math.max(0, 5 - penalties);
      if (penalties >= 3) reasons.push("Exigências documentais acumuladas (amostra/atestado/garantia)");
      if (penalties === 0) reasons.push("Sem exigências documentais extraordinárias");
      if (opp.is_srp) reasons.push("Sistema de Registro de Preços (SRP)");

      const totalScore = Math.max(
        0,
        Math.min(100, Math.round(fCompat + fValue + fLocation + fModality + fDeadline + fMeEpp + fDocs)),
      );
      const classification = classify(totalScore);

      await supabase.from("opportunity_scores").upsert(
        {
          opportunity_id: opp.id,
          score: totalScore,
          classification,
          factors: {
            compatibilidade: { score: fCompat, max: 30 },
            valor: { score: fValue, max: 20 },
            localizacao: { score: fLocation, max: 15 },
            modalidade: { score: fModality, max: 10 },
            prazo_entrega: { score: fDeadline, max: 10 },
            me_epp: { score: fMeEpp, max: 10 },
            documental: { score: fDocs, max: 5 },
          },
          reasons,
          computed_at: new Date().toISOString(),
        },
        { onConflict: "opportunity_id" },
      );

      // Notificação apenas para oportunidades excelentes e não duplicadas
      if (classification === "green" && !opp.canonical_id) {
        const { data: already } = await supabase
          .from("notifications")
          .select("id")
          .eq("opportunity_id", opp.id)
          .eq("type", "high_score")
          .maybeSingle();

        if (!already) {
          await supabase.from("notifications").insert({
            owner_id: ownerId,
            opportunity_id: opp.id,
            type: "high_score",
            title: `Oportunidade excelente (${totalScore}) 🟢`,
            message: `${opp.agency_name ?? "Órgão"}: ${(opp.object_description ?? "").slice(0, 120)}`,
          });
        }
      }

      results.push({ opportunity_id: opp.id, score: totalScore, classification });
    }

    return json({ status: "success", scored: results.length, results });
  } catch (error: any) {
    console.error("Erro em compute-score:", error);
    return json({ error: error?.message ?? "Erro interno ao calcular score." }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
