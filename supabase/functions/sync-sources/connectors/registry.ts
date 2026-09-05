// Registro de conectores: fonte (slug) → conector.
// Para adicionar uma nova fonte no futuro, basta criar o arquivo do conector
// e registrá-lo aqui. Nenhum outro arquivo precisa ser alterado.

import { comprasGovConnector } from "./compras-gov.ts";
import { pncpConnector } from "./pncp.ts";
import { privatePortalConnectors } from "./private-portals.ts";
import type { SourceConnector } from "./types.ts";

const ALL: SourceConnector[] = [pncpConnector, comprasGovConnector, ...privatePortalConnectors];

export const CONNECTOR_REGISTRY: Record<string, SourceConnector> = ALL.reduce(
  (acc, c) => {
    acc[c.slug] = c;
    return acc;
  },
  {} as Record<string, SourceConnector>,
);

// Aliases de slugs legados para não quebrar cadastros antigos.
CONNECTOR_REGISTRY["comprasnet"] = comprasGovConnector;

export function getConnector(slug: string): SourceConnector | null {
  return CONNECTOR_REGISTRY[slug] ?? null;
}
