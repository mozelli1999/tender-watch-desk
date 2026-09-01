// Edge Function: generate-alerts
// Varre oportunidades encerrando em breve (closing_soon) e processos alterados (process_changed)
// e gera registros na tabela notifications do Operador.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GenerateAlertsRequest {
  window_days?: number;
  types?: string[];
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body: GenerateAlertsRequest = await req.json().catch(() => ({}));
    const windowDays = body.window_days || 3;
    const requestedTypes = body.types || ["closing_soon", "process_changed"];

    let totalCreated = 0;
    const byType: Record<string, number> = {
      closing_soon: 0,
      process_changed: 0,
    };

    const now = new Date();
    const futureLimit = new Date();
    futureLimit.setDate(now.getDate() + windowDays);

    // 1. Processar closing_soon
    if (requestedTypes.includes("closing_soon")) {
      const { data: closingOpps, error: closingError } = await supabase
        .from("opportunities")
        .select("id, owner_id, agency_name, process_number, object_description, closing_date")
        .eq("is_compatible", true)
        .gte("closing_date", now.toISOString())
        .lte("closing_date", futureLimit.toISOString());

      if (!closingError && closingOpps) {
        for (const opp of closingOpps) {
          // Verifica se já gerou alerta para este tipo e oportunidade nas últimas 24h
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { data: existingNotif } = await supabase
            .from("notifications")
            .select("id")
            .eq("opportunity_id", opp.id)
            .eq("type", "closing_soon")
            .gte("created_at", oneDayAgo)
            .maybeSingle();

          if (!existingNotif) {
            const closingDateFormatted = new Date(opp.closing_date).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });

            await supabase.from("notifications").insert({
              owner_id: opp.owner_id,
              opportunity_id: opp.id,
              type: "closing_soon",
              title: `Prazo encerrando: ${opp.agency_name || "Licitação"}`,
              message: `Envio de propostas encerra em ${closingDateFormatted}. Objeto: ${opp.object_description?.slice(0, 80)}...`,
            });

            byType.closing_soon += 1;
            totalCreated += 1;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        notifications_created: totalCreated,
        by_type: byType,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro em generate-alerts:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno ao gerar alertas." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
