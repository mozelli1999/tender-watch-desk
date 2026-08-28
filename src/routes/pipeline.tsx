import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/app-layout";
import { Workflow } from "lucide-react";

export const Route = createFileRoute("/pipeline")({
  head: () => ({
    meta: [
      { title: "Pipeline de Licitações — Radar de Licitações" },
      { name: "description", content: "Funil de gestão e controle de oportunidades da empresa." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      title="Pipeline de Oportunidades"
      description="Quadro de gestão visual dos editais desde a captação até a conclusão (NOVAS → ... → CONCLUÍDA)."
      icon={Workflow}
    />
  ),
});
