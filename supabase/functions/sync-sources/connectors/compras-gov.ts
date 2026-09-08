// Conector Compras.gov.br / Comprasnet — Dados Abertos do Governo Federal
// Portal oficial: https://dadosabertos.compras.gov.br
// Base legal: LAI (Lei 12.527/2011) e Decreto 8.777/2016. Sem autenticação, sem scraping.
//
// O portal reorganiza endpoints com frequência; tentamos os endpoints oficiais
// conhecidos em ordem e registramos qual funcionou no log de sincronização.

import {
  getJson,
  makeBusinessKey,
  num,
  type ConnectorContext,
  type ConnectorResult,
  type NormalizedOpportunity,
  type SourceConnector,
} from "./types.ts";

function isoDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

// Endpoints e parâmetros conforme a especificação oficial publicada em
// https://dadosabertos.compras.gov.br/v3/api-docs
// dataPublicacaoPncpInicial/Final e codigoModalidade são obrigatórios.
const MODALIDADES = [6, 4, 8, 9, 12];
const PAGE_SIZE = 100; // a API exige tamanhoPagina entre 10 e 500
const WINDOW_DAYS = 15; // os dados abertos federais têm alguns dias de defasagem
const MAX_PAGES = 3;

function candidateEndpoints(base: string, modalidade: number, pagina: number): string[] {
  const b = base.replace(/\/$/, "");
  const de = isoDate(-WINDOW_DAYS);
  const ate = isoDate(0);
  return [
    `${b}/modulo-contratacoes/1_consultarContratacoes_PNCP_14133?pagina=${pagina}&tamanhoPagina=${PAGE_SIZE}` +
      `&dataPublicacaoPncpInicial=${de}&dataPublicacaoPncpFinal=${ate}&codigoModalidade=${modalidade}`,
    `${b}/modulo-legado/1_consultarLicitacao?pagina=${pagina}&tamanhoPagina=${PAGE_SIZE}` +
      `&data_publicacao_inicial=${de}&data_publicacao_final=${ate}&modalidade=${modalidade}`,
  ];
}



function pickRows(body: any): any[] {
  if (Array.isArray(body)) return body;
  return body?.resultado ?? body?.data ?? body?.results ?? body?._embedded?.licitacoes ?? [];
}

function normalize(r: any, ctx: ConnectorContext): NormalizedOpportunity | null {
  const externalId = String(
    r.numeroControlePNCP ??
      r.identificador ??
      r.id_licitacao ??
      r.idCompra ??
      (r.uasg && r.numero_aviso ? `${r.uasg}-${r.numero_aviso}` : "") ??
      "",
  );
  if (!externalId || externalId === "undefined") return null;

  const agency = r.nomeUasg ?? r.nome_uasg ?? r.orgao ?? r.razaoSocial ?? null;
  const processNumber = r.processo ?? r.numero_processo ?? r.numero_aviso ?? r.numeroCompra ?? null;
  const modality = r.modalidadeNome ?? r.modalidade ?? r.nome_modalidade ?? null;

  return {
    owner_id: ctx.ownerId,
    source_id: ctx.sourceId,
    source_external_id: externalId,
    source_url:
      r.linkSistemaOrigem ??
      (r.numeroControlePNCP
        ? `https://pncp.gov.br/app/editais/${String(r.numeroControlePNCP).replace(/[^0-9-]/g, "")}`
        : "https://www.gov.br/compras"),
    agency_name: agency,
    process_number: processNumber ? String(processNumber) : null,
    modality: modality ? String(modality) : null,
    object_description: r.objetoCompra ?? r.objeto ?? r.informacoes_gerais ?? null,
    category: r.tipoInstrumentoConvocatorioNome ?? r.tipo_objeto ?? null,
    catmat_catser_code: r.codigoItemCatalogo ?? r.codigo_catmat ?? null,
    estimated_value: num(r.valorTotalEstimado ?? r.valor_estimado ?? r.valor),
    quantity: num(r.quantidade),
    state: r.ufSigla ?? r.uf ?? null,
    city: r.municipioNome ?? r.municipio ?? null,
    session_date: r.dataAberturaProposta ?? r.data_abertura_proposta ?? r.data_publicacao ?? null,
    delivery_deadline_days: null,
    payment_deadline_days: null,
    status_situation: r.situacaoCompraNome ?? r.situacao ?? "Publicada",
    is_me_epp: null,
    requires_sample: null,
    requires_certificate: null,
    requires_warranty: null,
    requires_min_capital: null,
    closing_date: r.dataEncerramentoProposta ?? r.data_encerramento ?? null,
    is_compatible: false,
    business_key: makeBusinessKey({
      pncpControlNumber: r.numeroControlePNCP,
      agencyDocument: r.cnpj ?? r.uasg ?? r.codigo_uasg,
      agencyName: agency,
      processNumber,
      modality,
      year: r.anoCompra ?? String(r.data_publicacao ?? "").slice(0, 4),
    }),
    agency_document: r.cnpj ?? (r.uasg ? String(r.uasg) : null),
    is_srp: typeof r.srp === "boolean" ? r.srp : null,
    published_at: r.dataPublicacaoPncp ?? r.data_publicacao ?? null,
    origin_portal: "compras_gov",

    raw_payload: r,
  };
}

export const comprasGovConnector: SourceConnector = {
  slug: "compras_gov",
  label: "Compras.gov.br (Dados Abertos)",
  accessStatus: "open_data",
  legalNote: "Dados Abertos do Governo Federal (Lei 12.527/2011, Decreto 8.777/2016).",
  run: async (ctx: ConnectorContext): Promise<ConnectorResult> => {
    const base = ctx.baseUrl || "https://dadosabertos.compras.gov.br";
    const errors: string[] = [];
    const items: NormalizedOpportunity[] = [];
    let endpointUsed: string | null = null;

    for (const modalidade of MODALIDADES) {
      for (const url of candidateEndpoints(base, modalidade)) {
        const res = await getJson(url);
        if (!res.ok) {
          errors.push(`HTTP ${res.status} em ${url.split("?")[0]} (modalidade ${modalidade})`);
          continue;
        }
        endpointUsed ??= url.split("?")[0] ?? null;
        for (const r of pickRows(res.body)) {
          const n = normalize(r, ctx);
          if (n) items.push(n);
        }
        break; // modalidade coletada com sucesso
      }
    }

    if (items.length === 0 && errors.length > 0) {
      return {
        items: [],
        error:
          `Compras.gov.br: nenhum endpoint oficial de dados abertos respondeu. ` +
          `Detalhes: ${errors.slice(0, 4).join(" | ")}. As licitações federais continuam sendo captadas pelo PNCP.`,
        endpointUsed,
      };
    }

    return { items, error: null, endpointUsed };
  },

};
