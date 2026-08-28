import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/app-layout";
import { Building2 } from "lucide-react";

export const Route = createFileRoute("/fornecedores")({
  head: () => ({
    meta: [
      { title: "Fornecedores — Radar de Licitações" },
      { name: "description", content: "Cadastro de fornecedores, prazos, fretes e cotações." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      title="Cadastro de Fornecedores"
      description="Gerencie fornecedores, condições comerciais, prazos de entrega e vínculos de preços por produto."
      icon={Building2}
    />
  ),
});
