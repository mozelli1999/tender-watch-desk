import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/app-layout";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/melhores-do-dia")({
  head: () => ({
    meta: [
      { title: "Melhores do Dia — Radar de Licitações" },
      { name: "description", content: "As 10 melhores oportunidades do dia para sua empresa." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      title="Melhores Oportunidades do Dia"
      description="Top 10 oportunidades priorizadas por score, compatibilidade de catálogo, capital disponível e região."
      icon={Sparkles}
    />
  ),
});
