import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/app-layout";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/historico")({
  head: () => ({
    meta: [
      { title: "Histórico & Inteligência — Radar de Licitações" },
      { name: "description", content: "Métricas de participação, taxa de vitória e histórico de preços." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      title="Histórico & Inteligência"
      description="Análise de desempenho em licitações disputadas, taxa de vitória, margem real obtida e relatórios de inteligência."
      icon={BarChart3}
    />
  ),
});
