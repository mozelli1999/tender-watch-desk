// Edge Function: analyze-edital
// SOMENTE sob demanda: acionada quando o operador clica em "🤖 Analisar edital".
// Nunca é chamada durante a sincronização das oportunidades.
//
// Fluxo: localizar edital/anexos → guardar no bucket privado "editais" →
// enviar ao Gemini (documento real quando disponível) → salvar análise + custo.
//
// Cache: se o conjunto de documentos não mudou (mesma assinatura), a análise
// existente é reaproveitada. O botão "Reanalisar" envia force = true.
//
// A chave fica apenas em Secrets (GEMINI_API_KEY), enviada no header oficial
// x-goog-api-key — qualquer prefixo de chave (inclusive "AQ.") é preservado.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "gemini-2.5-pro";
// Preço público de referência (USD por 1M tokens) apenas para custo estimado.
const PRICE_IN = 1.25;
const PRICE_OUT = 10.0;
const NOT_FOUND = "Não identificado no edital/documentos analisados.";
const MAX_DOC_BYTES = 18 * 1024 * 1024;

interface AnalyzeEditalRequest {
  opportunity_id: string;
  pdf_url?: string;
  force?: boolean;
}

interface DocRef {
  url: string;
  title: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_API_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const startedAt = Date.now();

  try {
    const body: AnalyzeEditalRequest = await req.json().catch(() => ({}) as AnalyzeEditalRequest);
    const { opportunity_id, pdf_url: inputPdfUrl, force = false } = body;

    if (!opportunity_id) return json({ error: "opportunity_id é obrigatório." }, 400);
    if (!geminiApiKey) {
      return json(
        { error: "GEMINI_API_KEY não configurada. Cadastre a chave nos Secrets do backend." },
        400,
      );
    }

    const { data: opp, error: oppError } = await supabase
      .from("opportunities")
      .select("*, sources(slug, base_url)")
      .eq("id", opportunity_id)
      .single();

    if (oppError || !opp) return json({ error: "Oportunidade não encontrada." }, 404);

    const { data: existing } = await supabase
      .from("edital_analyses")
      .select("id, status, content_hash")
      .eq("opportunity_id", opportunity_id)
      .maybeSingle();

    // ─── 1. Localizar edital e anexos disponíveis ──────────────────────────
    const docs = await discoverDocuments(opp, inputPdfUrl);
    const contentHash = await sha256(docs.map((d) => d.url).sort().join("|") || String(opp.id));

    if (existing?.status === "done" && !force && existing.content_hash === contentHash) {
      return json({
        status: "cached",
        analysis_id: existing.id,
        message: "Análise reaproveitada: os documentos do edital não mudaram.",
      });
    }

    await supabase.from("edital_analyses").upsert(
      { opportunity_id, status: "processing", error_message: null, updated_at: new Date().toISOString() },
      { onConflict: "opportunity_id" },
    );

    // ─── 2. Baixar e guardar o documento principal (quando permitido) ──────
    let pdfStoragePath: string | null = null;
    let inlineDoc: { mimeType: string; data: string } | null = null;

    for (const doc of docs.slice(0, 3)) {
      try {
        const res = await fetch(doc.url, { headers: { "User-Agent": "RadarLicitacoes/1.0" } });
        if (!res.ok) continue;
        const contentType = res.headers.get("content-type") ?? "";
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.byteLength === 0 || buf.byteLength > MAX_DOC_BYTES) continue;

        const isPdf = contentType.includes("pdf") || buf[0] === 0x25; // "%PDF"
        const ext = isPdf ? "pdf" : contentType.includes("zip") ? "zip" : "bin";
        const path = `${opp.owner_id}/${opportunity_id}/edital_${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("editais")
          .upload(path, buf, { contentType: contentType || "application/pdf", upsert: true });
        if (!uploadError) pdfStoragePath ??= path;

        if (isPdf && !inlineDoc) {
          inlineDoc = { mimeType: "application/pdf", data: base64(buf) };
          break;
        }
      } catch (err) {
        console.warn("Documento inacessível:", doc.url, String(err));
      }
    }

    // ─── 3. Enviar ao Gemini ───────────────────────────────────────────────
    const prompt = buildPrompt(opp, docs, Boolean(inlineDoc));
    const parts: unknown[] = [{ text: prompt }];
    if (inlineDoc) parts.unshift({ inlineData: inlineDoc });

    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiApiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
        }),
      },
    );

    if (!aiRes.ok) {
      const detail = (await aiRes.text()).slice(0, 500);
      await supabase.from("edital_analyses").upsert(
        {
          opportunity_id,
          status: "error",
          error_message: `Gemini HTTP ${aiRes.status}: ${detail}`,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "opportunity_id" },
      );
      return json({ error: `Falha na análise pela IA (HTTP ${aiRes.status}).`, details: detail }, 502);
    }

    const aiJson = await aiRes.json();
    const rawText = aiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    let result: any = null;
    try {
      result = rawText ? JSON.parse(rawText) : null;
    } catch {
      result = null;
    }

    if (!result) {
      await supabase.from("edital_analyses").upsert(
        {
          opportunity_id,
          status: "error",
          error_message: "A IA não retornou um relatório interpretável.",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "opportunity_id" },
      );
      return json({ error: "A IA não retornou um relatório interpretável." }, 502);
    }

    const usage = aiJson?.usageMetadata ?? {};
    const tokensIn = Number(usage.promptTokenCount ?? 0);
    const tokensOut = Number(usage.candidatesTokenCount ?? 0);
    const costUsd = (tokensIn / 1_000_000) * PRICE_IN + (tokensOut / 1_000_000) * PRICE_OUT;

    const text = (v: unknown) => {
      const s = typeof v === "string" ? v.trim() : "";
      return s.length > 0 ? s : NOT_FOUND;
    };
    const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);

    const { data: saved, error: saveError } = await supabase
      .from("edital_analyses")
      .upsert(
        {
          opportunity_id,
          status: "done",
          pdf_storage_path: pdfStoragePath,
          summary: text(result.summary),
          object_extracted: text(result.object_extracted),
          items_json: result.items_json ?? [],
          values_json: result.values_json ?? {},
          dates_json: result.dates_json ?? {},
          delivery_info: text(result.delivery_info),
          delivery_location: text(result.delivery_location),
          proposal_deadline: text(result.proposal_deadline),
          payment_info: text(result.payment_info),
          required_documents: list(result.required_documents),
          habilitation_info: text(result.habilitation_info),
          samples_info: text(result.samples_info),
          catalog_info: text(result.catalog_info),
          warranties_info: text(result.warranties_info),
          certificates_info: text(result.certificates_info),
          special_requirements: text(result.special_requirements),
          penalties_info: text(result.penalties_info),
          risk_points: list(result.risk_points),
          positive_points: list(result.positive_points),
          recommendation: text(result.recommendation),
          documents_json: docs,
          source_documents_urls: docs.map((d) => d.url),
          content_hash: contentHash,
          ai_model_used: MODEL,
          tokens_input: tokensIn,
          tokens_output: tokensOut,
          estimated_cost_usd: Number(costUsd.toFixed(6)),
          duration_ms: Date.now() - startedAt,
          analyzed_at: new Date().toISOString(),
          error_message: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "opportunity_id" },
      )
      .select("id")
      .single();

    if (saveError) throw saveError;

    return json({
      status: "done",
      analysis_id: saved?.id,
      ai_model_used: MODEL,
      documents_analyzed: docs.length,
      document_sent_to_ai: Boolean(inlineDoc),
      tokens_input: tokensIn,
      tokens_output: tokensOut,
      estimated_cost_usd: Number(costUsd.toFixed(6)),
      duration_ms: Date.now() - startedAt,
    });
  } catch (error: any) {
    console.error("Erro em analyze-edital:", error);
    return json({ error: error?.message ?? "Erro interno ao analisar edital." }, 500);
  }
});

// ─── Descoberta de documentos ────────────────────────────────────────────────
// PNCP expõe os arquivos da contratação em endpoint público de consulta.
async function discoverDocuments(opp: any, inputPdfUrl?: string): Promise<DocRef[]> {
  const docs: DocRef[] = [];
  if (inputPdfUrl) docs.push({ url: inputPdfUrl, title: "Documento informado" });

  const raw = opp.raw_payload ?? {};
  const cnpj = raw?.orgaoEntidade?.cnpj ?? opp.agency_document;
  const ano = raw?.anoCompra;
  const seq = raw?.sequencialCompra;

  if (cnpj && ano && seq) {
    try {
      const url = `https://pncp.gov.br/api/pncp/v1/orgaos/${String(cnpj).replace(/\D/g, "")}/compras/${ano}/${seq}/arquivos`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "RadarLicitacoes/1.0" },
      });
      if (res.ok) {
        const files = await res.json();
        for (const f of Array.isArray(files) ? files : []) {
          const link = f?.uri ?? f?.url ?? f?.linkDownload;
          if (link) docs.push({ url: String(link), title: String(f?.titulo ?? f?.nomeArquivo ?? "Anexo") });
        }
      }
    } catch (err) {
      console.warn("Não foi possível listar anexos no PNCP:", String(err));
    }
  }

  if (raw?.linkSistemaOrigem) {
    docs.push({ url: String(raw.linkSistemaOrigem), title: "Sistema de origem" });
  }
  if (opp.source_url) docs.push({ url: String(opp.source_url), title: "Página da licitação" });

  const seen = new Set<string>();
  return docs.filter((d) => (seen.has(d.url) ? false : (seen.add(d.url), true)));
}

function buildPrompt(opp: any, docs: DocRef[], hasDocument: boolean): string {
  return `Você é um analista especialista em licitações públicas brasileiras (Lei 14.133/2021).
${hasDocument
      ? "O documento do edital foi anexado a esta requisição. Baseie-se EXCLUSIVAMENTE nele e nos metadados abaixo."
      : "Não foi possível acessar o arquivo do edital. Baseie-se EXCLUSIVAMENTE nos metadados oficiais abaixo."}

REGRAS OBRIGATÓRIAS:
- NUNCA invente informação. Se algo não constar nos documentos/metadados, responda exatamente: "${NOT_FOUND}"
- Sempre que possível, indique a página ou seção do documento entre parênteses.
- Responda em português do Brasil.

Metadados oficiais da licitação:
- Órgão: ${opp.agency_name ?? NOT_FOUND}
- CNPJ: ${opp.agency_document ?? NOT_FOUND}
- Processo/Número: ${opp.process_number ?? NOT_FOUND}
- Modalidade: ${opp.modality ?? NOT_FOUND}
- Situação: ${opp.status_situation ?? NOT_FOUND}
- Objeto: ${opp.object_description ?? NOT_FOUND}
- Valor estimado: ${opp.estimated_value ?? NOT_FOUND}
- Registro de preços (SRP): ${opp.is_srp === true ? "Sim" : opp.is_srp === false ? "Não" : NOT_FOUND}
- Exclusiva ME/EPP: ${opp.is_me_epp === true ? "Sim" : opp.is_me_epp === false ? "Não" : NOT_FOUND}
- Sessão: ${opp.session_date ?? NOT_FOUND}
- Encerramento de propostas: ${opp.closing_date ?? NOT_FOUND}
- Local: ${opp.city ?? ""} / ${opp.state ?? ""}
- Documentos consultados: ${docs.map((d) => d.title).join(", ") || NOT_FOUND}

Devolva SOMENTE um JSON com este formato:
{
  "summary": "resumo executivo em até 6 linhas",
  "object_extracted": "objeto detalhado",
  "items_json": [{ "item": 1, "description": "", "quantity": 0, "unit": "", "unit_estimated_price": 0, "total_price": 0, "reference": "página/seção" }],
  "values_json": { "total_estimated": 0, "budget_type": "", "reference": "" },
  "dates_json": { "session_date": "", "proposal_deadline": "", "clarification_deadline": "", "reference": "" },
  "proposal_deadline": "prazo para envio da proposta",
  "delivery_info": "prazo de entrega",
  "delivery_location": "local de entrega",
  "payment_info": "prazo e condições de pagamento",
  "required_documents": ["documentos de habilitação exigidos"],
  "habilitation_info": "resumo da habilitação",
  "certificates_info": "certidões e atestado de capacidade técnica",
  "samples_info": "exigência de amostra",
  "catalog_info": "exigência de catálogo/ficha técnica",
  "warranties_info": "garantias exigidas",
  "special_requirements": "exigências especiais",
  "penalties_info": "penalidades e multas",
  "risk_points": ["riscos para o fornecedor"],
  "positive_points": ["pontos positivos"],
  "recommendation": "recomendação objetiva: participar, participar com ressalvas ou não participar, com justificativa"
}`;
}

// ─── Utilitários ────────────────────────────────────────────────────────────
async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
