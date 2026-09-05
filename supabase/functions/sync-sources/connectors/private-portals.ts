// Conectores dos portais privados de licitação.
//
// Situação verificada: Portal de Compras Públicas, BLL Compras, Licitanet,
// Licitações-e (Banco do Brasil) e Compras BR NÃO publicam API aberta de consulta.
// O acesso aos dados exige login/credenciamento ou passa por proteções (CAPTCHA),
// que não devem ser contornadas.
//
// Caminho legítimo adotado:
//  1. As licitações desses portais são captadas via PNCP (publicação obrigatória),
//     já com `origin_portal` apontando o portal de origem;
//  2. Cada conector fica pronto para receber credenciais oficiais em Secrets
//     (ex.: PORTAL_COMPRAS_PUBLICAS_API_KEY) e a documentação da API contratada,
//     sem precisar alterar o restante do sistema.

import { awaitingAccessConnector, type SourceConnector } from "./types.ts";

const NOTE =
  "Sem API pública de consulta. Licitações captadas via PNCP com atribuição de origem. " +
  "Coleta direta apenas com acesso oficial contratado.";

export const privatePortalConnectors: SourceConnector[] = [
  awaitingAccessConnector(
    "portal_compras_publicas",
    "Portal de Compras Públicas",
    NOTE,
    "PORTAL_COMPRAS_PUBLICAS_API_KEY",
  ),
  awaitingAccessConnector("bll", "BLL Compras", NOTE, "BLL_API_KEY"),
  awaitingAccessConnector("licitanet", "Licitanet", NOTE, "LICITANET_API_KEY"),
  awaitingAccessConnector(
    "licitacoes_e",
    "Licitações-e (Banco do Brasil)",
    NOTE,
    "LICITACOES_E_API_KEY",
  ),
  awaitingAccessConnector("compras_br", "Compras BR", NOTE, "COMPRAS_BR_API_KEY"),
];
