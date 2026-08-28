import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/layout/app-layout";
import { Package } from "lucide-react";

export const Route = createFileRoute("/produtos")({
  head: () => ({
    meta: [
      { title: "Produtos — Radar de Licitações" },
      { name: "description", content: "Catálogo de produtos da empresa para matching e cálculo de score." },
    ],
  }),
  component: () => (
    <PlaceholderPage
      title="Catálogo de Produtos"
      description="Gerencie os produtos da sua empresa, códigos CATMAT/CATSER, palavras-chave e custos para cruzamento com editais."
      icon={Package}
    />
  ),
});
