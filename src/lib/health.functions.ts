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
      const supabasePublic = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (input, init) => {
            const h = new Headers(init?.headers);
            if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
              h.delete("Authorization");
            }
            h.set("apikey", key);
            return fetch(input, { ...init, headers: h });
          },
        },
      });

      // Auth responde? (sem usuário logado é o esperado nesta fase)
      const { error: authError } = await supabasePublic.auth.getUser();
      const authReachable = !authError || authError.status === 401 || authError.status === 403;

      // Data API responde? Sem tabelas ainda, um 404 de recurso já prova conexão.
      const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key } });

      return {
        connected: res.ok || res.status === 404,
        authReachable,
        message: `Data API respondeu com HTTP ${res.status}.`,
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
