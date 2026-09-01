// Edge Function: run-financial-simulation
// Calcula a simulação financeira de uma oportunidade de licitação.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization header required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cliente autenticado como o Operador (para validar ownership e RLS)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Cliente service_role para leituras cruzadas (ex: product_suppliers via RLS de owner)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Identificar o Operador atual
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const {
      opportunity_id,
      selected_supplier_id,
      overrides = {},
      save = false,
    } = body;

    if (!opportunity_id) {
      return new Response(JSON.stringify({ error: "opportunity_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Buscar a oportunidade (valida ownership via RLS)
    const { data: opportunity, error: oppError } = await supabase
      .from("opportunities")
      .select("*")
      .eq("id", opportunity_id)
      .single();

    if (oppError || !opportunity) {
      return new Response(JSON.stringify({ error: "Opportunity not found or access denied" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Buscar configurações da empresa do Operador
    const { data: settings } = await supabase
      .from("company_settings")
      .select("*")
      .eq("owner_id", user.id)
      .single();

    const defaultTaxPct = settings?.default_tax_pct ?? 0;
    const companyMinMargin = settings?.min_margin_pct ?? 15;

    // 3. Buscar fornecedor selecionado ou o mais vantajoso para o produto compatível
    let selectedSupplier: any = null;
    let supplierLink: any = null;

    if (selected_supplier_id) {
      // Validar que o fornecedor pertence ao Operador
      const { data: sup } = await supabase
        .from("suppliers")
        .select("*")
        .eq("id", selected_supplier_id)
        .eq("owner_id", user.id)
        .single();

      selectedSupplier = sup;

      // Buscar vínculo produto ↔ fornecedor para a oportunidade
      // Primeiro identificar o produto compatível
      const { data: oppProducts } = await supabase
        .from("opportunity_products")
        .select("product_id")
        .eq("opportunity_id", opportunity_id)
        .limit(1);

      if (oppProducts && oppProducts.length > 0) {
        const { data: link } = await supabase
          .from("product_suppliers")
          .select("*")
          .eq("product_id", oppProducts[0].product_id)
          .eq("supplier_id", selected_supplier_id)
          .eq("owner_id", user.id)
          .single();

        supplierLink = link;
      }
    } else {
      // Buscar produto compatível com melhor fornecedor (menor preço)
      const { data: oppProducts } = await supabase
        .from("opportunity_products")
        .select("product_id")
        .eq("opportunity_id", opportunity_id)
        .limit(1);

      if (oppProducts && oppProducts.length > 0) {
        const { data: links } = await supabase
          .from("product_suppliers")
          .select("*, supplier:suppliers(*)")
          .eq("product_id", oppProducts[0].product_id)
          .eq("owner_id", user.id)
          .order("unit_price", { ascending: true })
          .limit(1);

        if (links && links.length > 0) {
          supplierLink = links[0];
          selectedSupplier = links[0].supplier;
        }
      }
    }

    // 4. Calcular a Simulação Financeira
    const estimatedValue = opportunity.estimated_value ?? 0;
    const quantity = opportunity.quantity ?? 1;

    // Receita: usa bid_value se fornecido, senão valor estimado do edital
    const revenue = overrides.bid_value
      ? Number(overrides.bid_value)
      : estimatedValue;

    // Custo do produto: unitPrice * quantidade
    const unitPrice = supplierLink?.unit_price ?? 0;
    const productCost = unitPrice * quantity;

    // Frete: override > vínculo específico > padrão do fornecedor > 0
    const freightCostRaw = overrides.freight_cost !== undefined
      ? Number(overrides.freight_cost)
      : (supplierLink?.freight_cost ?? selectedSupplier?.default_freight_cost ?? 0);
    const freightCost = Number(freightCostRaw) * quantity;

    // Impostos: override > configuração da empresa
    const taxPct = overrides.tax_pct !== undefined
      ? Number(overrides.tax_pct)
      : defaultTaxPct;
    const taxCost = (revenue * taxPct) / 100;

    // Outros custos
    const otherCosts = overrides.other_costs !== undefined
      ? Number(overrides.other_costs)
      : 0;

    // Cálculo do lucro
    const totalCosts = productCost + freightCost + taxCost + otherCosts;
    const profit = revenue - totalCosts;
    const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;

    // Capital necessário = custo do produto + frete (desembolso antes do recebimento)
    const requiredCapital = productCost + freightCost + otherCosts;

    // Lance máximo recomendado: quanto máximo podemos cobrar mantendo a margem mínima
    // max_bid = total_cost / (1 - min_margin_pct/100)
    const effectiveMinMargin = companyMinMargin / 100;
    const maxRecommendedBid = totalCosts > 0
      ? totalCosts / (1 - effectiveMinMargin)
      : 0;

    // Impacto no Fluxo de Caixa
    const supplierPaymentDay = supplierLink?.payment_terms_days
      ?? selectedSupplier?.payment_terms_days
      ?? 30;
    const agencyReceiptDay = opportunity.payment_deadline_days ?? 30;
    const gapDays = agencyReceiptDay - supplierPaymentDay;
    const capitalLocked = gapDays > 0 ? requiredCapital : 0; // só há "travamento" se pagar antes de receber

    const cashFlowImpact = {
      supplier_payment_day: supplierPaymentDay,
      agency_receipt_day: agencyReceiptDay,
      gap_days: gapDays,
      capital_locked: capitalLocked,
    };

    const simulationResult = {
      revenue: round2(revenue),
      product_cost: round2(productCost),
      freight_cost: round2(freightCost),
      tax_cost: round2(taxCost),
      other_costs: round2(otherCosts),
      profit: round2(profit),
      margin_pct: round2(marginPct),
      required_capital: round2(requiredCapital),
      max_recommended_bid: round2(maxRecommendedBid),
      cash_flow_impact: cashFlowImpact,
      selected_supplier_id: selectedSupplier?.id ?? null,
      selected_supplier_name: selectedSupplier?.name ?? null,
      simulation_id: null as string | null,
    };

    // 5. Salvar em financial_simulations se solicitado
    if (save) {
      const payload = {
        owner_id: user.id,
        opportunity_id,
        selected_supplier_id: selectedSupplier?.id ?? null,
        revenue: simulationResult.revenue,
        product_cost: simulationResult.product_cost,
        freight_cost: simulationResult.freight_cost,
        tax_cost: simulationResult.tax_cost,
        other_costs: simulationResult.other_costs,
        profit: simulationResult.profit,
        margin_pct: simulationResult.margin_pct,
        required_capital: simulationResult.required_capital,
        max_recommended_bid: simulationResult.max_recommended_bid,
        cash_flow_impact: cashFlowImpact,
      };

      const { data: savedSim, error: saveError } = await supabase
        .from("financial_simulations")
        .insert(payload)
        .select("id")
        .single();

      if (saveError) {
        console.error("Error saving simulation:", saveError);
        // Retornamos o resultado mesmo sem salvar
      } else {
        simulationResult.simulation_id = savedSim.id;
      }
    }

    return new Response(JSON.stringify(simulationResult), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error in run-financial-simulation:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error", details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
