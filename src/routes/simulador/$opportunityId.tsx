import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/app-layout";
import { Calculator } from "lucide-react";

export const Route = createFileRoute("/simulador/$opportunityId")({
  head: () => ({
    meta: [
      { title: "Simulador Financeiro — Radar de Licitações" },
      { name: "description", content: "Simulador financeiro de lucro, margem, capital e lance máximo." },
    ],
  }),
  component: FinancialSimulatorRoute,
});

function FinancialSimulatorRoute() {
  const { opportunityId } = Route.useParams();

  return (
    <PlaceholderPage
      title={`Simulador Financeiro — Oportunidade #${opportunityId}`}
      description="Ajuste fornecedor, frete, impostos e calcule receita, custos, lucro estimado, capital de giro e lance máximo recomendado."
      icon={Calculator}
    />
  );
}
