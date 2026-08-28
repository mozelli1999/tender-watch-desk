import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/app-layout";
import { Search } from "lucide-react";

export const Route = createFileRoute("/busca")({
  head: () => ({
    meta: [
      { title: "Busca de Editais — Radar de Licitações" },
      { name: "description", content: "Busca e filtros avançados combináveis de oportunidades." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      title="Busca de Editais"
      description="Pesquisa e filtros avançados por produto, palavra-chave, UF, valor, modalidade, ME/EPP e prazos."
      icon={Search}
    />
  ),
});
