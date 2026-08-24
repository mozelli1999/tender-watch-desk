import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { checkBackendHealth } from "@/lib/health.functions";

const healthQueryOptions = queryOptions({
  queryKey: ["backend-health"],
  queryFn: () => checkBackendHealth(),
});

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Radar de Licitações — Fundação" },
      {
        name: "description",
        content:
          "Plataforma privada de inteligência para licitações públicas: oportunidades, score, análise de edital e simulador financeiro.",
      },
      { property: "og:title", content: "Radar de Licitações — Fundação" },
      {
        property: "og:description",
        content:
          "Base do Radar de Licitações: verificação de conexão com o backend antes das telas e do banco.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(healthQueryOptions),
  component: FoundationStatus,
  errorComponent: () => (
    <Shell>
      <StatusRow ok={false} label="Falha ao executar a checagem de conexão" />
    </Shell>
  ),
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-8">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Etapa 0 · Fundação
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-card-foreground">Radar de Licitações</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Estrutura base configurada. Nenhuma página de produto e nenhuma tabela criadas ainda.
        </p>
        <div className="mt-6 space-y-3">{children}</div>
      </div>
    </main>
  );
}

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      <span
        aria-hidden
        className={`mt-1 size-2.5 shrink-0 rounded-full ${ok ? "bg-primary" : "bg-destructive"}`}
      />
      <div>
        <p className="text-sm font-medium text-card-foreground">{label}</p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </div>
    </div>
  );
}

function FoundationStatus() {
  const { data } = useSuspenseQuery(healthQueryOptions);

  return (
    <Shell>
      <StatusRow
        ok={data.connected}
        label={data.connected ? "Backend conectado" : "Backend não conectado"}
        detail={data.message}
      />
      <StatusRow
        ok={data.authReachable}
        label={
          data.authReachable
            ? "Autenticação respondendo (sem usuário logado)"
            : "Autenticação não respondeu"
        }
        detail="Login do Operador será implementado na próxima etapa."
      />
    </Shell>
  );
}
