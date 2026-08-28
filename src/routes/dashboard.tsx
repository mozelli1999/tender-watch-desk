import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/app-layout";
import { LayoutDashboard } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Radar de Licitações" },
      { name: "description", content: "Painel principal com KPIs, gráficos e alertas." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      title="Dashboard"
      description="Painel principal com indicadores de licitações, gráficos de oportunidades, alertas e acesso ao Top 10."
      icon={LayoutDashboard}
    />
  ),
});
