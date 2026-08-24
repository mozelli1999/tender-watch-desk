import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

export type BackendHealth = {
  connected: boolean;
  authReachable: boolean;
  message: string;
};

/**
 * Checagem de conexão com o backend (Lovable Cloud).
 * Roda no servidor com a chave publishable — nunca service role no cliente.
 */
export const checkBackendHealth = createServerFn({ method: "GET" }).handler(
  async (): Promise<BackendHealth> => {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];

    if (!url || !key) {
      return {
        connected: false,
        authReachable: false,
        message: "Variáveis de ambiente do backend não encontradas no servidor.",
      };
    }

    try {
      // Auth responde?
      const authRes = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } });

      // Data API responde? Sem tabelas ainda, um PGRST205 (404) já prova a conexão.
      const dataRes = await fetch(`${url}/rest/v1/__radar_probe?select=id&limit=1`, {
        headers: { apikey: key },
      });

      return {
        connected: dataRes.ok || dataRes.status === 404,
        authReachable: authRes.ok,
        message: `Auth HTTP ${authRes.status} · Data API HTTP ${dataRes.status} (sem tabelas criadas).`,
      };

    } catch (err) {
      return {
        connected: false,
        authReachable: false,
        message: err instanceof Error ? err.message : "Falha desconhecida ao contatar o backend.",
      };
    }
  },
);
