// Edge Function: match-opportunities
// Cruza oportunidades com produtos do catálogo e marca as compatíveis.
// Autenticação: service_role (interna) — encadeada por sync-sources.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const {
      opportunity_ids,
      reason = "sync",
    }: {
      opportunity_ids?: string[];
      reason?: string;
    } = body;

    // ─── 1. Buscar oportunidades a avaliar ─────────────────────────────────
    let oppsQuery = supabase
      .from("opportunities")
      .select("id, owner_id, object_description, category, catmat_catser_code");

    if (opportunity_ids && opportunity_ids.length > 0) {
      oppsQuery = oppsQuery.in("id", opportunity_ids);
    } else {
      // Processar apenas as que ainda não foram avaliadas (is_compatible = false e nunca cruzadas)
      // Para re-runs por product_changed, passamos sempre os IDs
      oppsQuery = oppsQuery.eq("is_compatible", false);
    }

    const { data: opportunities, error: oppsError } = await oppsQuery.limit(500);
    if (oppsError) throw oppsError;
    if (!opportunities || opportunities.length === 0) {
      return json({ status: "success", opportunities_evaluated: 0, matches_created: 0, opportunities_marked_compatible: 0 });
    }

    // Agrupar por owner para buscar os produtos do dono
    const ownerIds = [...new Set(opportunities.map((o: any) => o.owner_id))];

    // ─── 2. Buscar TODOS os produtos ativos de cada dono ───────────────────
    const { data: products, error: prodsError } = await supabase
      .from("products")
      .select("id, owner_id, name, category, catmat_catser_code, keywords")
      .in("owner_id", ownerIds)
      .eq("is_active", true);

    if (prodsError) throw prodsError;
    if (!products || products.length === 0) {
      return json({ status: "success", opportunities_evaluated: opportunities.length, matches_created: 0, opportunities_marked_compatible: 0 });
    }

    // ─── 3. Cruzamento: oportunidade × produtos ────────────────────────────
    let matchesCreated = 0;
    let oppsMarkedCompatible = 0;
    const newlyCompatibleIds: string[] = [];

    for (const opp of opportunities as any[]) {
      const ownerProducts = products.filter((p: any) => p.owner_id === opp.owner_id);
      const oppMatches: Array<{ opportunity_id: string; product_id: string; match_reason: string }> = [];

      for (const product of ownerProducts) {
        let matchReason: string | null = null;

        // Critério 1: CATMAT/CATSER (mais preciso — prioridade máxima)
        if (
          opp.catmat_catser_code &&
          product.catmat_catser_code &&
          opp.catmat_catser_code.trim() === product.catmat_catser_code.trim()
        ) {
          matchReason = "catmat";
        }

        // Critério 2: Categoria (normalizada para lowercase)
        if (!matchReason && opp.category && product.category) {
          const oppCat = opp.category.toLowerCase().trim();
          const prodCat = product.category.toLowerCase().trim();
          if (oppCat === prodCat || oppCat.includes(prodCat) || prodCat.includes(oppCat)) {
            matchReason = "category";
          }
        }

        // Critério 3: Palavras-chave (full-text check sobre object_description)
        if (!matchReason && opp.object_description && product.keywords && product.keywords.length > 0) {
          const objDesc = opp.object_description.toLowerCase();
          const hasKeywordMatch = product.keywords.some((kw: string) =>
            kw.trim().length > 2 && objDesc.includes(kw.toLowerCase().trim())
          );
          if (hasKeywordMatch) {
            matchReason = "keyword";
          }
        }

        if (matchReason) {
          oppMatches.push({
            opportunity_id: opp.id,
            product_id: product.id,
            match_reason: matchReason,
          });
        }
      }

      if (oppMatches.length > 0) {
        // Upsert em opportunity_products (ignora duplicatas por unique(opportunity_id, product_id))
        const { error: upsertError } = await supabase
          .from("opportunity_products")
          .upsert(oppMatches, { onConflict: "opportunity_id,product_id", ignoreDuplicates: true });

        if (upsertError) {
          console.error(`Error upserting opportunity_products for opp ${opp.id}:`, upsertError);
        } else {
          matchesCreated += oppMatches.length;

          // Marcar is_compatible = true
          const { error: updateError } = await supabase
            .from("opportunities")
            .update({ is_compatible: true })
            .eq("id", opp.id);

          if (!updateError) {
            oppsMarkedCompatible++;
            newlyCompatibleIds.push(opp.id);
          }
        }
      }
    }

    // ─── 4. Notificações para novas compatíveis ────────────────────────────
    if (newlyCompatibleIds.length > 0) {
      // Buscar detalhes para as notificações
      const { data: newOpps } = await supabase
        .from("opportunities")
        .select("id, owner_id, agency_name, object_description")
        .in("id", newlyCompatibleIds);

      if (newOpps) {
        const notifications = (newOpps as any[]).map((opp) => ({
          owner_id: opp.owner_id,
          opportunity_id: opp.id,
          type: "new_compatible",
          title: "Nova licitação compatível detectada",
          message: `${opp.agency_name || "Órgão"}: ${(opp.object_description || "").slice(0, 120)}`,
          is_read: false,
        }));

        await supabase.from("notifications").insert(notifications);
      }

      // Disparar analyze-edital para cada nova compatível (fire-and-forget)
      for (const oppId of newlyCompatibleIds) {
        supabase.functions
          .invoke("analyze-edital", { body: { opportunity_id: oppId } })
          .catch((err: Error) =>
            console.error(`Failed to invoke analyze-edital for ${oppId}:`, err)
          );
      }
    }

    return json({
      status: "success",
      opportunities_evaluated: opportunities.length,
      matches_created: matchesCreated,
      opportunities_marked_compatible: oppsMarkedCompatible,
    });
  } catch (error) {
    console.error("Unexpected error in match-opportunities:", error);
    return json({ error: "Internal Server Error", details: String(error) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
