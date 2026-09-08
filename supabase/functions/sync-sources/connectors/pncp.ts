// Conector PNCP — Portal Nacional de Contratações Públicas
// API pública de consulta, sem autenticação:
//   GET https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao
//   params: dataInicial=YYYYMMDD, dataFinal=YYYYMMDD,
//           codigoModalidadeContratacao=<n>, pagina, tamanhoPagina
// Base legal: publicação obrigatória (Lei 14.133/2021). Dados abertos, sem burlar proteção.

import {
  getJson,
  makeBusinessKey,
  num,
  type ConnectorContext,
  type ConnectorResult,
  type NormalizedOpportunity,
  type SourceConnector,
  ymd,
} from "./types.ts";

const MODALITIES: Record<number, string> = {
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

// A API exige a modalidade; percorremos todas as modalidades da Lei 14.133/2021.
const MODALITIES_TO_FETCH = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const PAGE_SIZE = 50;
const MAX_PAGES_PER_MODALITY = 4;

/** Monta o link do edital no PNCP: /app/editais/{cnpj}/{ano}/{sequencial} */
export function pncpEditalUrl(r: any): string {
  const cnpj = String(r?.orgaoEntidade?.cnpj ?? "").replace(/\D/g, "");
  const ano = String(r?.anoCompra ?? "").replace(/\D/g, "");
  const seq = String(r?.sequencialCompra ?? r?.numeroCompra ?? "").replace(/\D/g, "");
  if (cnpj && ano && seq) {
    return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${Number(seq)}`;
  }
  return "https://pncp.gov.br/app/editais";
}

/** Identifica o portal/sistema de origem a partir do link do sistema de origem. */
export function portalFromLink(link: unknown): string | null {
  const url = String(link ?? "").toLowerCase();
  if (!url) return null;
  if (url.includes("portaldecompraspublicas")) return "portal_compras_publicas";
  if (url.includes("bll")) return "bll";
  if (url.includes("licitanet")) return "licitanet";
  if (url.includes("licitacoes-e")) return "licitacoes_e";
  if (url.includes("comprasbr")) return "compras_br";
  if (url.includes("comprasnet") || url.includes("compras.gov")) return "compras_gov";
  if (url.includes("bnc")) return "bnc";
  return null;
}

function normalize(r: any, ctx: ConnectorContext): NormalizedOpportunity | null {
  const orgao = r.orgaoEntidade ?? {};
  const unidade = r.unidadeOrgao ?? {};
  const externalId = String(r.numeroControlePNCP ?? r.sequencialCompra ?? r.id ?? "");
  if (!externalId) return null;

  const modality = r.modalidadeNome ?? (r.modalidadeId ? MODALITIES[r.modalidadeId] : null) ?? null;
  const link = r.linkSistemaOrigem ?? null;

  return {
    owner_id: ctx.ownerId,
    source_id: ctx.sourceId,
    source_external_id: externalId,
    source_url: link ?? pncpEditalUrl(r),

    agency_name: orgao.razaoSocial ?? unidade.nomeUnidade ?? null,
    process_number: r.processo ?? (r.numeroCompra ? `${r.numeroCompra}/${r.anoCompra ?? ""}` : null),
    modality,
    object_description: r.objetoCompra ?? null,
    category: r.tipoInstrumentoConvocatorioNome ?? null,
    catmat_catser_code: null,
    estimated_value: num(r.valorTotalEstimado),
    quantity: null,
    state: unidade.ufSigla ?? null,
    city: unidade.municipioNome ?? null,
    session_date: r.dataAberturaProposta ?? r.dataPublicacaoPncp ?? null,
    delivery_deadline_days: null,
    payment_deadline_days: null,
    status_situation: r.situacaoCompraNome ?? "Divulgada no PNCP",
    is_me_epp: null,
    requires_sample: null,
    requires_certificate: null,
    requires_warranty: null,
    requires_min_capital: null,
    closing_date: r.dataEncerramentoProposta ?? null,
    is_compatible: false,
    business_key: makeBusinessKey({
      pncpControlNumber: r.numeroControlePNCP,
      agencyDocument: orgao.cnpj,
      agencyName: orgao.razaoSocial,
      processNumber: r.processo ?? r.numeroCompra,
      modality,
      year: r.anoCompra,
    }),
    agency_document: orgao.cnpj ?? null,
    is_srp: typeof r.srp === "boolean" ? r.srp : null,
    published_at: r.dataPublicacaoPncp ?? null,
    origin_portal: portalFromLink(link) ?? "pncp",

    raw_payload: r,
  };
}

export const pncpConnector: SourceConnector = {
  slug: "pncp",
  label: "PNCP",
  accessStatus: "official_api",
  legalNote: "API pública de consulta do PNCP (Lei 14.133/2021).",
  run: async (ctx: ConnectorContext): Promise<ConnectorResult> => {
    const base = (ctx.baseUrl || "https://pncp.gov.br/api/consulta/v1").replace(/\/$/, "");
    const dataFinal = ymd(new Date());
    const dataInicial = ymd(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));

    const items: NormalizedOpportunity[] = [];
    const errors: string[] = [];
    let endpointUsed: string | null = null;

    for (const modalidade of MODALITIES_TO_FETCH) {
      for (let pagina = 1; pagina <= MAX_PAGES_PER_MODALITY; pagina++) {
        const url =
          `${base}/contratacoes/publicacao?dataInicial=${dataInicial}&dataFinal=${dataFinal}` +
          `&codigoModalidadeContratacao=${modalidade}&pagina=${pagina}&tamanhoPagina=${PAGE_SIZE}`;

        const res = await getJson(url);

        // 204 = sem registros para essa modalidade/página
        if (res.status === 204) break;
        if (!res.ok) {
          errors.push(`modalidade ${modalidade} p${pagina}: HTTP ${res.status} ${res.text ?? ""}`);
          break;
        }

        endpointUsed ??= `${base}/contratacoes/publicacao`;
        const registros: any[] = res.body?.data ?? [];
        for (const r of registros) {
          const item = normalize(r, ctx);
          if (item) items.push(item);
        }

        const totalPaginas = Number(res.body?.totalPaginas ?? 1);
        if (registros.length < PAGE_SIZE || pagina >= totalPaginas) break;
      }
    }

    if (items.length === 0 && errors.length > 0) {
      return { items, error: `PNCP: ${errors.slice(0, 4).join(" | ")}`, endpointUsed };
    }

    return {
      items,
      error: errors.length > 0 ? `PNCP (parcial): ${errors.slice(0, 3).join(" | ")}` : null,
      endpointUsed,
    };
  },
};
