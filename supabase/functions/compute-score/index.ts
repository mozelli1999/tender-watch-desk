// Edge Function: compute-score
// Calcula o Score 0–100 da oportunidade com base nas 6 dimensões estratégicas,
// classifica em 🟢 (green), 🟡 (yellow) ou 🔴 (red) com base em company_settings,
// salva em opportunity_scores e gera notificação high_score se verde.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ComputeScoreRequest {
  opportunity_id?: string;
  recompute_all?: boolean;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body: ComputeScoreRequest = await req.json().catch(() => ({}));
    const { opportunity_id, recompute_all = false } = body;

    // 1. Identificar quais oportunidades calcular
    let oppQuery = supabase
      .from("opportunities")
      .select(`
        id,
        owner_id,
        agency_name,
        process_number,
        modality,
        object_description,
        estimated_value,
        delivery_deadline_days,
        payment_deadline_days,
        state,
        city,
        is_me_epp,
        requires_sample,
        requires_certificate,
        requires_warranty,
        requires_min_capital,
        is_compatible
      `);

    if (opportunity_id) {
      oppQuery = oppQuery.eq("id", opportunity_id);
    } else if (!recompute_all) {
      oppQuery = oppQuery.eq("is_compatible", true).limit(50);
    } else {
      oppQuery = oppQuery.eq("is_compatible", true);
    }

    const { data: opportunities, error: oppError } = await oppQuery;
    if (oppError || !opportunities || opportunities.length === 0) {
      return new Response(
        JSON.stringify({ status: "success", scored: 0, results: [], message: "Nenhuma oportunidade a processar." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cache de company_settings por owner_id
    const settingsCache = new Map<string, any>();
    const results: Array<{ opportunity_id: string; score: number; classification: string }> = [];

    for (const opp of opportunities) {
      const ownerId = opp.owner_id;

      // Busca settings do owner se não estiver no cache
      if (!settingsCache.has(ownerId)) {
        const { data: settings } = await supabase
          .from("company_settings")
          .select("*")
          .eq("owner_id", ownerId)
          .maybeSingle();

        settingsCache.set(ownerId, settings || {
          score_green_min: 70,
          score_yellow_min: 40,
          available_capital: 50000,
          min_margin_pct: 15,
          service_states: [],
          service_cities: [],
        });
      }

      const settings = settingsCache.get(ownerId);

      // Busca análise de edital existente
      const { data: editalAnalysis } = await supabase
        .from("edital_analyses")
        .select("risk_points, habilitation_info, samples_info, warranties_info, certificates_info")
        .eq("opportunity_id", opp.id)
        .maybeSingle();

      // Busca produtos casados e cotações de fornecedores
      const { data: oppProducts } = await supabase
        .from("opportunity_products")
        .select("product_id, products(name, avg_purchase_price, min_margin_pct, freight_cost)")
        .eq("opportunity_id", opp.id);

      // Busca simulação financeira mais recente se houver
      const { data: sim } = await supabase
        .from("financial_simulations")
        .select("profit, margin_pct, required_capital")
        .eq("opportunity_id", opp.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // ============================================================
      // CÁLCULO DAS 6 DIMENSÕES DO SCORE (0 a 100)
      // ============================================================
      let scoreLucratividade = 15; // Max 25
      let scoreRisco = 15;         // Max 20
      let scoreCapital = 15;       // Max 20
      let scoreCompetitividade = 10; // Max 15
      let scoreLogistica = 6;      // Max 10
      let scoreDocumental = 7;     // Max 10

      const reasons: string[] = [];

      // 1. Lucratividade e Margem Potencial (0–25)
      const targetMargin = settings.min_margin_pct || 15;
      if (sim?.margin_pct) {
        if (sim.margin_pct >= targetMargin * 1.5) {
          scoreLucratividade = 25;
          reasons.push(`Excelente margem calculada (${sim.margin_pct.toFixed(1)}%, bem acima da meta de ${targetMargin}%)`);
        } else if (sim.margin_pct >= targetMargin) {
          scoreLucratividade = 20;
          reasons.push(`Margem adequada (${sim.margin_pct.toFixed(1)}% vs meta de ${targetMargin}%)`);
        } else if (sim.margin_pct > 0) {
          scoreLucratividade = 10;
          reasons.push(`Margem abaixo da meta ideal (${sim.margin_pct.toFixed(1)}% vs ${targetMargin}%)`);
        } else {
          scoreLucratividade = 2;
          reasons.push("Margem líquida calculada negativa ou nula");
        }
      } else {
        // Estimativa se ainda não houver simulação
        scoreLucratividade = 18;
        reasons.push("Margem potencial estimada compatível com o catálogo cadastrado");
      }

      // 2. Risco e Restrições do Edital (0–20)
      const riskPointsCount = (editalAnalysis?.risk_points || []).length;
      if (riskPointsCount === 0) {
        scoreRisco = 20;
        reasons.push("Edital limpo sem pontos críticos de risco identificados");
      } else if (riskPointsCount <= 2) {
        scoreRisco = 15;
        reasons.push(`Risco moderado (${riskPointsCount} pontos de atenção identificados no edital)`);
      } else {
        scoreRisco = 7;
        reasons.push(`Risco elevado: ${riskPointsCount} pontos críticos (prazos curtos ou exigências severas)`);
      }

      // 3. Adequação Financeira / Capital de Giro (0–20)
      const availableCap = Number(settings.available_capital || 50000);
      const estValue = Number(opp.estimated_value || 0);
      const requiredCap = sim?.required_capital ? Number(sim.required_capital) : estValue * 0.7;

      if (availableCap <= 0) {
        scoreCapital = 12;
      } else if (requiredCap <= availableCap * 0.5) {
        scoreCapital = 20;
        reasons.push(`Excelente folga de capital: consome ${((requiredCap / availableCap) * 100).toFixed(0)}% do capital disponível`);
      } else if (requiredCap <= availableCap) {
        scoreCapital = 15;
        reasons.push(`Capital requerido (R$ ${requiredCap.toLocaleString("pt-BR")}) dentro do limite operacional`);
      } else {
        scoreCapital = 5;
        reasons.push(`Capital requerido (R$ ${requiredCap.toLocaleString("pt-BR")}) excede o limite cadastrado (R$ ${availableCap.toLocaleString("pt-BR")})`);
      }

      // 4. Competitividade e Histórico do Órgão (0–15)
      if (opp.is_me_epp) {
        scoreCompetitividade = 15;
        reasons.push("Licitação com tratamento exclusivo/diferenciado para ME/EPP");
      } else {
        scoreCompetitividade = 10;
        reasons.push("Ampla concorrência de mercado");
      }

      // 5. Facilidade Operacional e Logística (0–10)
      const states: string[] = settings.service_states || [];
      const cities: string[] = settings.service_cities || [];

      if (states.length > 0 && opp.state && !states.includes(opp.state)) {
        scoreLogistica = 2;
        reasons.push(`Estado ${opp.state} fora da malha prioritária cadastrada nas configurações`);
      } else if (cities.length > 0 && opp.city && cities.some((c: string) => c.toLowerCase() === opp.city.toLowerCase())) {
        scoreLogistica = 10;
        reasons.push(`Município ${opp.city} na rota de atendimento prioritário direto`);
      } else if (states.includes(opp.state)) {
        scoreLogistica = 8;
        reasons.push(`Localizado no estado ${opp.state} (região atendida pela empresa)`);
      } else {
        scoreLogistica = 6;
      }

      // 6. Complexidade Documental e Habilitação (0–10)
      let docPenalties = 0;
      if (opp.requires_sample) docPenalties += 3;
      if (opp.requires_warranty) docPenalties += 2;
      if (opp.requires_certificate) docPenalties += 2;
      if (opp.requires_min_capital) docPenalties += 2;

      scoreDocumental = Math.max(1, 10 - docPenalties);
      if (docPenalties > 4) {
        reasons.push("Exigência cumulativa de amostra, garantia e atestados prévios");
      } else if (docPenalties === 0) {
        reasons.push("Habilitação documental simplificada sem exigências extraordinárias");
      }

      // Soma ponderada total
      const totalScore = Math.min(
        100,
        Math.max(
          0,
          Math.round(
            scoreLucratividade +
            scoreRisco +
            scoreCapital +
            scoreCompetitividade +
            scoreLogistica +
            scoreDocumental
          )
        )
      );

      // Classificação conforme company_settings
      const greenMin = settings.score_green_min || 70;
      const yellowMin = settings.score_yellow_min || 40;

      let classification: "green" | "yellow" | "red" = "red";
      if (totalScore >= greenMin) {
        classification = "green";
      } else if (totalScore >= yellowMin) {
        classification = "yellow";
      } else {
        classification = "red";
      }

      const factorsJson = {
        lucratividade: { score: scoreLucratividade, max: 25 },
        risco_edital: { score: scoreRisco, max: 20 },
        capital_giro: { score: scoreCapital, max: 20 },
        competitividade: { score: scoreCompetitividade, max: 15 },
        logistica: { score: scoreLogistica, max: 10 },
        documental: { score: scoreDocumental, max: 10 },
      };

      // 7. Salva opportunity_scores
      await supabase
        .from("opportunity_scores")
        .upsert(
          {
            opportunity_id: opp.id,
            score: totalScore,
            classification,
            factors: factorsJson,
            reasons,
            computed_at: new Date().toISOString(),
          },
          { onConflict: "opportunity_id" }
        );

      // 8. Se for score verde (alta pontuação), enfileira notificação
      if (classification === "green") {
        await supabase.from("notifications").insert({
          owner_id: ownerId,
          opportunity_id: opp.id,
          type: "high_score",
          title: `Oportunidade Nota ${totalScore} 🟢 Encontrada!`,
          message: `${opp.agency_name || "Órgão"}: ${opp.object_description?.slice(0, 100)}...`,
        });
      }

      results.push({
        opportunity_id: opp.id,
        score: totalScore,
        classification,
      });
    }

    return new Response(
      JSON.stringify({
        status: "success",
        scored: results.length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro em compute-score:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno ao calcular score." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
