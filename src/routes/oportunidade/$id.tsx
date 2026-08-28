import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/app-layout";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/oportunidade/$id")({
  head: () => ({
    meta: [
      { title: "Detalhes da Oportunidade — Radar de Licitações" },
      { name: "description", content: "Visão 360 da oportunidade, score, análise de edital e fornecedores." },
    ],
  }),
  component: OpportunityDetailRoute,
});

function OpportunityDetailRoute() {
  const { id } = Route.useParams();

  return (
    <PlaceholderPage
      title={`Detalhes da Oportunidade #${id}`}
      description="Visão detalhada do edital, órgão, objeto, prazos, exigências, análise de IA, score e fornecedores compatíveis."
      icon={FileText}
    />
  );
}
