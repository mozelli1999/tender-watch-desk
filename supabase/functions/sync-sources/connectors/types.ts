// Contrato comum de todos os conectores de fontes de licitação.
// Cada fonte vive em um arquivo próprio e devolve SEMPRE este formato normalizado.

export interface NormalizedOpportunity {
  owner_id: string;
  source_id: string;
  source_external_id: string;
  source_url: string;
  agency_name: string | null;
  agency_document: string | null;
  process_number: string | null;
  modality: string | null;
  is_srp: boolean | null;
  published_at: string | null;

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
  business_key: string | null;
  origin_portal: string | null;
  raw_payload: unknown;
}

export interface ConnectorContext {
  sourceId: string;
  ownerId: string;
  baseUrl: string;
  /** Segredos/credenciais opcionais para fontes com API oficial contratada. */
  env: (name: string) => string | undefined;
}

export interface ConnectorResult {
  items: NormalizedOpportunity[];
  error: string | null;
  /** Informativo: endpoint efetivamente usado, útil no log de sincronização. */
  endpointUsed?: string | null;
}

export interface SourceConnector {
  slug: string;
  label: string;
  /**
   * 'official_api'   — API oficial pública
   * 'open_data'      — portal de dados abertos oficial
   * 'awaiting_official_access' — sem via legítima de consulta hoje
   */
  accessStatus: "official_api" | "open_data" | "awaiting_official_access";
  legalNote: string;
  run: (ctx: ConnectorContext) => Promise<ConnectorResult>;
}

// ─── Helpers compartilhados ──────────────────────────────────────────────────

export const UA = "RadarLicitacoes/1.0 (+contato via app)";

export async function getJson(
  url: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: any; text?: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { Accept: "application/json", "User-Agent": UA, ...(init.headers ?? {}) },
    });
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, body, text: text.slice(0, 300) };
  } catch (err) {
    return { ok: false, status: 0, body: null, text: String(err) };
  }
}

export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) && n !== 0 ? n : Number.isFinite(n) ? n : null;
}

export function ymd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

export function slugifyKeyPart(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Chave de negócio da licitação, estável entre fontes diferentes.
 * Prioriza o identificador oficial do PNCP; senão combina CNPJ do órgão,
 * número do processo, modalidade e ano.
 */
export function makeBusinessKey(parts: {
  pncpControlNumber?: unknown;
  agencyDocument?: unknown;
  agencyName?: unknown;
  processNumber?: unknown;
  modality?: unknown;
  year?: unknown;
}): string | null {
  const pncp = slugifyKeyPart(parts.pncpControlNumber);
  if (pncp.length >= 10) return `pncp:${pncp}`;

  const agency = slugifyKeyPart(parts.agencyDocument) || slugifyKeyPart(parts.agencyName);
  const process = slugifyKeyPart(parts.processNumber);
  if (!agency || !process) return null;

  return [
    "bk",
    agency,
    process,
    slugifyKeyPart(parts.modality),
    slugifyKeyPart(parts.year),
  ]
    .filter(Boolean)
    .join(":");
}

/** Conector placeholder para portais sem API pública de consulta. */
export function awaitingAccessConnector(
  slug: string,
  label: string,
  legalNote: string,
  credentialEnvVar: string,
): SourceConnector {
  return {
    slug,
    label,
    accessStatus: "awaiting_official_access",
    legalNote,
    run: async (ctx) => {
      const credential = ctx.env(credentialEnvVar);
      if (!credential) {
        return {
          items: [],
          error:
            `${label}: sem API pública de consulta. As licitações deste portal são captadas via PNCP ` +
            `com atribuição de origem. Para coleta direta, cadastre a credencial oficial em ${credentialEnvVar}.`,
          endpointUsed: null,
        };
      }
      // Credencial presente, mas o contrato de API é específico de cada portal.
      // O conector fica pronto para receber a implementação oficial sem tocar no resto do sistema.
      return {
        items: [],
        error:
          `${label}: credencial encontrada em ${credentialEnvVar}, mas o adaptador oficial ainda não foi ` +
          `configurado. Informe a documentação da API contratada para ativar a coleta direta.`,
        endpointUsed: null,
      };
    },
  };
}
