// Edge Function: analyze-edital
// Baixa o PDF do edital, armazena no Storage bucket "editais" e extrai dados estruturados via Gemini 2.5 Pro.
// Ao final, encadeia a chamada para compute-score.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AnalyzeEditalRequest {
  opportunity_id: string;
  pdf_url?: string;
  force?: boolean;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY");

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body: AnalyzeEditalRequest = await req.json().catch(() => ({}));
    const { opportunity_id, pdf_url: inputPdfUrl, force = false } = body;

    if (!opportunity_id) {
      return new Response(
        JSON.stringify({ error: "opportunity_id é obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Busca oportunidade
    const { data: opp, error: oppError } = await supabase
      .from("opportunities")
      .select("*, sources(slug, base_url)")
      .eq("id", opportunity_id)
      .single();

    if (oppError || !opp) {
      return new Response(
        JSON.stringify({ error: "Oportunidade não encontrada." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Verifica se já existe análise concluída (se não for force)
    const { data: existingAnalysis } = await supabase
      .from("edital_analyses")
      .select("id, status")
      .eq("opportunity_id", opportunity_id)
      .maybeSingle();

    if (existingAnalysis?.status === "done" && !force) {
      return new Response(
        JSON.stringify({
          status: "done",
          analysis_id: existingAnalysis.id,
          message: "Análise já realizada previamente.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Marca status como 'processing'
    await supabase
      .from("edital_analyses")
      .upsert(
        {
          opportunity_id,
          status: "processing",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "opportunity_id" }
      );

    // 4. Determina a URL do Edital
    let targetPdfUrl = inputPdfUrl || opp.source_url;
    if (opp.raw_payload?.linkSistemaOrigem) {
      targetPdfUrl = opp.raw_payload.linkSistemaOrigem;
    }

    let pdfStoragePath: string | null = null;

    // 5. Tenta baixar o arquivo PDF e salvar no Storage Supabase (bucket "editais")
    try {
      if (targetPdfUrl && targetPdfUrl.startsWith("http")) {
        const downloadRes = await fetch(targetPdfUrl, {
          headers: { "User-Agent": "RadarLicitacoes/1.0" },
        });

        if (downloadRes.ok) {
          const contentType = downloadRes.headers.get("content-type") || "";
          const blob = await downloadRes.blob();
          const ext = contentType.includes("pdf") ? "pdf" : "bin";
          const path = `${opp.owner_id}/${opportunity_id}/edital_${Date.now()}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from("editais")
            .upload(path, blob, {
              contentType: contentType || "application/pdf",
              upsert: true,
            });

          if (!uploadError) {
            pdfStoragePath = path;
          }
        }
      }
    } catch (downloadErr) {
      console.warn("Não foi possível salvar o arquivo no storage:", downloadErr);
    }

    // 6. Extração Estruturada via Gemini ou Heurística
    let analysisResult: any = null;
    let modelUsed = "gemini-2.5-pro";

    const promptText = `Você é um auditor especialista em licitações públicas brasileiras (Lei 14.133/2021 e Lei 8.666/1993).
Analise os dados desta oportunidade de licitação e extraia um relatório estruturado em JSON:

Dados da Licitação:
- Órgão: ${opp.agency_name || "Não informado"}
- Processo: ${opp.process_number || "Não informado"}
- Modalidade: ${opp.modality || "Não informada"}
- Objeto: ${opp.object_description || "Não informado"}
- Valor Estimado: R$ ${opp.estimated_value || 0}
- Prazo de Entrega: ${opp.delivery_deadline_days || "Não especificado"} dias
- Prazo de Pagamento: ${opp.payment_deadline_days || "Não especificado"} dias
- Exclusivo ME/EPP: ${opp.is_me_epp ? "Sim" : "Não"}
- Exige Amostra: ${opp.requires_sample ? "Sim" : "Não"}
- Exige Atestado: ${opp.requires_certificate ? "Sim" : "Não"}
- Exige Garantia: ${opp.requires_warranty ? "Sim" : "Não"}
- Exige Capital Mínimo: ${opp.requires_min_capital ? "Sim" : "Não"}
- UF/Cidade: ${opp.state || ""} / ${opp.city || ""}

Gere um JSON com o seguinte formato estrito:
{
  "object_extracted": "Descrição detalhada e clara do que está sendo contratado",
  "items_json": [
    { "item": 1, "description": "Descrição do item", "quantity": 1, "unit_estimated_price": 100 }
  ],
  "values_json": { "total_estimated": ${opp.estimated_value || 0}, "budget_type": "sigiloso ou público" },
  "dates_json": { "session_date": "${opp.session_date || ""}", "clarification_deadline": "" },
  "delivery_info": "Informações e prazos de entrega e locais",
  "payment_info": "Informações sobre pagamento e liquidação",
  "required_documents": ["Certidão Negativa de Débitos", "Atestado de Capacidade Técnica", "Balanço Patrimonial"],
  "habilitation_info": "Resumo das exigências de qualificação técnica e econômico-financeira",
  "samples_info": "Regras de amostras ou laudos de conformidade",
  "warranties_info": "Exigências de garantia de proposta ou execução contratual",
  "certificates_info": "Exigências de atestados e comprovação de aptidão técnica",
  "penalties_info": "Multas contratuais e penalidades por atraso na entrega",
  "risk_points": ["Pontos de atenção ou riscos para o fornecedor"]
}`;

    if (geminiApiKey) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${geminiApiKey}`;
        const aiRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2,
            },
          }),
        });

        if (aiRes.ok) {
          const aiJson = await aiRes.json();
          const rawText = aiJson.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            analysisResult = JSON.parse(rawText);
          }
        }
      } catch (geminiErr) {
        console.warn("Falha na chamada ao Gemini 2.5 Pro, usando fallback:", geminiErr);
      }
    }

    // Fallback estruturado inteligente caso IA não esteja configurada ou retorne vazio
    if (!analysisResult) {
      modelUsed = "heuristic-analyzer-v1";
      const riskPoints: string[] = [];
      if (opp.delivery_deadline_days && opp.delivery_deadline_days < 10) {
        riskPoints.push(`Prazo de entrega muito curto (${opp.delivery_deadline_days} dias corridos)`);
      }
      if (opp.requires_sample) {
        riskPoints.push("Exigência de apresentação de amostra/laudo prévio para homologação");
      }
      if (opp.requires_warranty) {
        riskPoints.push("Exigência de garantia contratual de execução");
      }
      if (opp.requires_certificate) {
        riskPoints.push("Atestado de capacidade técnica com quantitativo mínimo exigido");
      }
      if (opp.estimated_value && opp.estimated_value > 200000) {
        riskPoints.push("Volume financeiro elevado com necessidade de capital de giro expressivo");
      }

      analysisResult = {
        object_extracted: opp.object_description || "Contratação de fornecimento conforme edital e anexos.",
        items_json: [
          {
            item: 1,
            description: opp.object_description,
            quantity: opp.quantity || 1,
            unit_estimated_price: opp.estimated_value || 0,
          },
        ],
        values_json: { total_estimated: opp.estimated_value || 0 },
        dates_json: { session_date: opp.session_date, closing_date: opp.closing_date },
        delivery_info: opp.delivery_deadline_days
          ? `Prazo de entrega estipulado em até ${opp.delivery_deadline_days} dias corridos no município de ${opp.city || "destino"} - ${opp.state || ""}.`
          : "Prazo conforme termo de referência.",
        payment_info: opp.payment_deadline_days
          ? `Pagamento previsto em até ${opp.payment_deadline_days} dias após ateste da nota fiscal.`
          : "Pagamento em até 30 dias após liquidação.",
        required_documents: [
          "Regularidade Fiscal e Trabalhista (CNDs Federal, Estadual, Municipal e FGTS)",
          "Qualificação Econômico-Financeira",
          opp.requires_certificate ? "Atestado de Capacidade Técnica compatível" : null,
        ].filter(Boolean),
        habilitation_info: "Habilitação jurídica, fiscal, trabalhista e qualificação econômico-financeira regular.",
        samples_info: opp.requires_sample ? "Exigida amostra do produto homologado antes da adjudicação." : "Não exige apresentação de amostras.",
        warranties_info: opp.requires_warranty ? "Exigida garantia de execução contratual (até 5%)." : "Não exige garantia.",
        certificates_info: opp.requires_certificate ? "Comprovação de fornecimento anterior pertinente e compatível em características e quantidades." : "Não exige atestado específico prévio.",
        penalties_info: "Multa de mora de 0,5% ao dia por atraso injustificado, limitada a 20% do valor do contrato.",
        risk_points: riskPoints.length > 0 ? riskPoints : ["Processo com requisitos operacionais padrão de mercado."],
      };
    }

    // 7. Persiste a análise completa na tabela edital_analyses
    const { data: savedAnalysis, error: saveError } = await supabase
      .from("edital_analyses")
      .upsert(
        {
          opportunity_id,
          status: "done",
          pdf_storage_path: pdfStoragePath,
          object_extracted: analysisResult.object_extracted,
          items_json: analysisResult.items_json,
          values_json: analysisResult.values_json,
          dates_json: analysisResult.dates_json,
          delivery_info: analysisResult.delivery_info,
          payment_info: analysisResult.payment_info,
          required_documents: analysisResult.required_documents || [],
          habilitation_info: analysisResult.habilitation_info,
          samples_info: analysisResult.samples_info,
          warranties_info: analysisResult.warranties_info,
          certificates_info: analysisResult.certificates_info,
          penalties_info: analysisResult.penalties_info,
          risk_points: analysisResult.risk_points || [],
          ai_model_used: modelUsed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "opportunity_id" }
      )
      .select("id")
      .single();

    if (saveError) {
      throw saveError;
    }

    // 8. Encadeia compute-score (fire-and-forget)
    try {
      fetch(`${supabaseUrl}/functions/v1/compute-score`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ opportunity_id }),
      }).catch((e) => console.warn("Erro ao encadear compute-score:", e));
    } catch (chainErr) {
      console.warn("Erro no encadeamento compute-score:", chainErr);
    }

    return new Response(
      JSON.stringify({
        status: "done",
        analysis_id: savedAnalysis?.id,
        ai_model_used: modelUsed,
        risk_points_count: (analysisResult.risk_points || []).length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro em analyze-edital:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno ao analisar edital." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
