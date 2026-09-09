import React, { useState, useEffect, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/layout/app-layout";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Search,
  Filter,
  X,
  SlidersHorizontal,
  Star,
  ExternalLink,
  MapPin,
  Calendar,
  Clock,
  DollarSign,
  Building,
  Sparkles,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Calculator,
  RefreshCw,
  AlertTriangle,
  FileText,
  CheckCircle2,
  Trash2,
} from "lucide-react";

export const Route = createFileRoute("/busca")({
  head: () => ({
    meta: [
      { title: "Busca de Editais — Radar de Licitações" },
      {
        name: "description",
        content: "Pesquisa avançada com filtros combináveis de valor, UF, modalidade, ME/EPP e score.",
      },
    ],
  }),
  component: BuscaPage,
});

interface OpportunitySearchResult {
  id: string;
  agency_name: string | null;
  process_number: string | null;
  modality: string | null;
  object_description: string | null;
  category: string | null;
  catmat_catser_code: string | null;
  estimated_value: number | null;
  quantity: number | null;
  state: string | null;
  city: string | null;
  session_date: string | null;
  delivery_deadline_days: number | null;
  payment_deadline_days: number | null;
  status_situation: string | null;
  is_me_epp: boolean | null;
  requires_sample: boolean | null;
  requires_certificate: boolean | null;
  requires_warranty: boolean | null;
  requires_min_capital: boolean | null;
  closing_date: string | null;
  is_compatible: boolean;
  source_url: string;
  source_slug: string | null;
  score: number;
  classification: "green" | "yellow" | "red";
  reasons: string[];
  is_favorite: boolean;
  is_discarded: boolean;
  stage: string;
  total_count: number;
}

const BRAZILIAN_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

// Rótulo oficial do PNCP + termo usado no filtro (o PNCP grava "Dispensa" sem complemento).
const MODALITIES: { label: string; value: string }[] = [
  { label: "Pregão - Eletrônico", value: "Pregão - Eletrônico" },
  { label: "Pregão - Presencial", value: "Pregão - Presencial" },
  { label: "Concorrência - Eletrônica", value: "Concorrência - Eletrônica" },
  { label: "Concorrência - Presencial", value: "Concorrência - Presencial" },
  { label: "Dispensa de Licitação", value: "Dispensa" },
  { label: "Inexigibilidade", value: "Inexigibilidade" },
  { label: "Credenciamento", value: "Credenciamento" },
  { label: "Pré-qualificação", value: "Pré-qualificação" },
  { label: "Manifestação de Interesse", value: "Manifestação de Interesse" },
  { label: "Concurso", value: "Concurso" },
  { label: "Diálogo Competitivo", value: "Diálogo Competitivo" },
  { label: "Leilão - Eletrônico", value: "Leilão - Eletrônico" },
  { label: "Leilão - Presencial", value: "Leilão - Presencial" },
];

function BuscaPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Estados de Busca e Filtros
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [catmat, setCatmat] = useState("");
  const [state, setState] = useState("all");
  const [city, setCity] = useState("");
  const [modality, setModality] = useState("all");
  const [valueMin, setValueMin] = useState<string>("");
  const [valueMax, setValueMax] = useState<string>("");
  const [deliveryMaxDays, setDeliveryMaxDays] = useState<string>("");
  const [isMeEppOnly, setIsMeEppOnly] = useState(false);
  const [onlyCompatible, setOnlyCompatible] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [hideDiscarded, setHideDiscarded] = useState(true);
  const [classification, setClassification] = useState("all");
  const [scoreMin, setScoreMin] = useState<string>("");
  const [sourceSlug, setSourceSlug] = useState("all");
  const [sortBy, setSortBy] = useState("score_desc");

  // Paginação
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Painel lateral de filtros expandido (em mobile)
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  // Estados de Dados
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<OpportunitySearchResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  const executeSearch = async (pageNum = 1) => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const filtersPayload: Record<string, any> = {
        sort: sortBy,
        limit: pageSize,
        offset: (pageNum - 1) * pageSize,
      };

      if (keyword.trim()) filtersPayload["keyword"] = keyword.trim();
      if (category.trim()) filtersPayload["category"] = category.trim();
      if (catmat.trim()) filtersPayload["catmat_catser_code"] = catmat.trim();
      if (state !== "all") filtersPayload["state"] = state;
      if (city.trim()) filtersPayload["city"] = city.trim();
      if (modality !== "all") filtersPayload["modality"] = modality;
      if (valueMin) filtersPayload["value_min"] = Number(valueMin);
      if (valueMax) filtersPayload["value_max"] = Number(valueMax);
      if (deliveryMaxDays) filtersPayload["delivery_deadline_max_days"] = Number(deliveryMaxDays);
      if (isMeEppOnly) filtersPayload["is_me_epp"] = true;
      if (onlyCompatible) filtersPayload["only_compatible"] = true;
      if (onlyFavorites) filtersPayload["is_favorite"] = true;
      if (hideDiscarded) filtersPayload["is_discarded"] = false;
      if (classification !== "all") filtersPayload["classification"] = classification;
      if (scoreMin) filtersPayload["score_min"] = Number(scoreMin);
      if (sourceSlug !== "all") filtersPayload["source_slug"] = sourceSlug;

      const { data, error: rpcErr } = await (supabase.rpc as any)(
        "search_opportunities",
        { filters: filtersPayload }
      );

      if (rpcErr) throw rpcErr;

      const searchResults = (data as unknown as OpportunitySearchResult[]) || [];
      setResults(searchResults);
      setTotalCount(searchResults[0]?.total_count ?? searchResults.length);
      setPage(pageNum);
    } catch (err: any) {
      console.error("Erro na busca de oportunidades:", err);
      setError("Falha ao executar pesquisa de oportunidades. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    executeSearch(1);
  }, [user, sortBy, onlyCompatible, onlyFavorites, hideDiscarded]);

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(1);
  };

  const handleClearFilters = () => {
    setKeyword("");
    setCategory("");
    setCatmat("");
    setState("all");
    setCity("");
    setModality("all");
    setValueMin("");
    setValueMax("");
    setDeliveryMaxDays("");
    setIsMeEppOnly(false);
    setOnlyCompatible(false);
    setOnlyFavorites(false);
    setHideDiscarded(true);
    setClassification("all");
    setScoreMin("");
    setSourceSlug("all");
    setSortBy("score_desc");
    setPage(1);

    // Executa busca com filtros zerados
    setTimeout(() => {
      executeSearch(1);
    }, 50);
  };

  // Toggle Favorito
  const handleToggleFavorite = async (oppId: string, currentFav: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    const newFav = !currentFav;

    setResults((prev) =>
      prev.map((o) => (o.id === oppId ? { ...o, is_favorite: newFav } : o))
    );

    try {
      await (supabase.rpc as any)("upsert_pipeline_flag", {
        p_opportunity_id: oppId,
        p_favorite: newFav,
      });
      toast.success(newFav ? "Favoritada ⭐" : "Desfavoritada");
    } catch (err) {
      console.error("Erro ao favoritar:", err);
    }
  };

  // Contagem de filtros ativos
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (keyword.trim()) count++;
    if (category.trim()) count++;
    if (catmat.trim()) count++;
    if (state !== "all") count++;
    if (city.trim()) count++;
    if (modality !== "all") count++;
    if (valueMin) count++;
    if (valueMax) count++;
    if (deliveryMaxDays) count++;
    if (isMeEppOnly) count++;
    if (onlyCompatible) count++;
    if (onlyFavorites) count++;
    if (classification !== "all") count++;
    if (scoreMin) count++;
    if (sourceSlug !== "all") count++;
    return count;
  }, [
    keyword, category, catmat, state, city, modality,
    valueMin, valueMax, deliveryMaxDays, isMeEppOnly,
    onlyCompatible, onlyFavorites, classification, scoreMin, sourceSlug
  ]);

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return "R$ 0,00";
    return Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Topo da Página */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <PageHeader
            title="Busca Avançada de Editais"
            description="Pesquise no acervo completo de oportunidades públicas captadas no PNCP e ComprasNet."
          />

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilterDrawer(!showFilterDrawer)}
              className="lg:hidden gap-2"
            >
              <Filter className="h-4 w-4" />
              Filtros ({activeFiltersCount})
            </Button>

            <Button
              size="sm"
              onClick={() => navigate({ to: "/melhores-do-dia" })}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              <Sparkles className="h-4 w-4 text-amber-300" />
              Top 10 Melhores
            </Button>
          </div>
        </div>

        {/* Barra de Busca Rápida */}
        <form onSubmit={handleApplyFilters} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Pesquisar por objeto, termo, material (ex: 'material de limpeza', 'computadores', 'hortifruti')..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="pl-10 h-10 bg-card border-border shadow-xs"
            />
            {keyword && (
              <button
                type="button"
                onClick={() => setKeyword("")}
                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button type="submit" disabled={loading} className="h-10 px-5 gap-2 shadow-xs">
            <Search className="h-4 w-4" />
            Buscar
          </Button>
        </form>

        {/* Chips de Filtros Rápidos / Ativos */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground font-medium">Filtros Rápidos:</span>

            <Button
              type="button"
              variant={onlyCompatible ? "default" : "outline"}
              size="sm"
              onClick={() => setOnlyCompatible(!onlyCompatible)}
              className="h-7 text-xs gap-1.5 rounded-full"
            >
              <Sparkles className="h-3 w-3" />
              Só Compatíveis com Catálogo
            </Button>

            <Button
              type="button"
              variant={onlyFavorites ? "default" : "outline"}
              size="sm"
              onClick={() => setOnlyFavorites(!onlyFavorites)}
              className="h-7 text-xs gap-1.5 rounded-full"
            >
              <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
              Minhas Favoritas
            </Button>

            <Button
              type="button"
              variant={isMeEppOnly ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setIsMeEppOnly(!isMeEppOnly);
                setTimeout(() => executeSearch(1), 50);
              }}
              className="h-7 text-xs gap-1.5 rounded-full"
            >
              Exclusivo ME/EPP
            </Button>

            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 ml-2 transition-colors"
              >
                <Trash2 className="h-3 w-3" />
                Limpar todos ({activeFiltersCount})
              </button>
            )}
          </div>

          {/* Ordenação */}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Ordenar por:</span>
            <Select value={sortBy} onValueChange={(val) => setSortBy(val)}>
              <SelectTrigger className="h-8 w-44 text-xs bg-card border-border">
                <SelectValue placeholder="Ordenação" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score_desc">Maior Score (0–100)</SelectItem>
                <SelectItem value="value_desc">Maior Valor (R$)</SelectItem>
                <SelectItem value="value_asc">Menor Valor (R$)</SelectItem>
                <SelectItem value="closing_asc">Encerramento mais Próximo</SelectItem>
                <SelectItem value="session_asc">Data de Sessão mais Próxima</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Layout Principal: Filtros Laterais + Resultados */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Painel de Filtros Lateral (Desktop) */}
          <div className={`space-y-4 lg:block ${showFilterDrawer ? "block" : "hidden"}`}>
            <Card className="border-border shadow-xs bg-card sticky top-6">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                  Filtros Detalhados
                </CardTitle>
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    {activeFiltersCount} ativos
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="p-4 space-y-4 text-xs">
                {/* Categoria */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Categoria do Objeto</Label>
                  <Input
                    type="text"
                    placeholder="Ex: Material Médico, Limpeza..."
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="h-8 text-xs bg-background"
                  />
                </div>

                {/* Código CATMAT/CATSER */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Código CATMAT / CATSER</Label>
                  <Input
                    type="text"
                    placeholder="Ex: 150244..."
                    value={catmat}
                    onChange={(e) => setCatmat(e.target.value)}
                    className="h-8 text-xs bg-background font-mono"
                  />
                </div>

                {/* Estado (UF) */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Estado (UF)</Label>
                  <Select value={state} onValueChange={(val) => setState(val)}>
                    <SelectTrigger className="h-8 text-xs bg-background">
                      <SelectValue placeholder="Todos os estados" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as UFs (Brasil)</SelectItem>
                      {BRAZILIAN_STATES.map((uf) => (
                        <SelectItem key={uf} value={uf}>
                          {uf}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Município */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Município / Cidade</Label>
                  <Input
                    type="text"
                    placeholder="Ex: Vitória, Campinas..."
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="h-8 text-xs bg-background"
                  />
                </div>

                {/* Modalidade */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Modalidade</Label>
                  <Select value={modality} onValueChange={(val) => setModality(val)}>
                    <SelectTrigger className="h-8 text-xs bg-background">
                      <SelectValue placeholder="Todas as modalidades" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as modalidades</SelectItem>
                      {MODALITIES.map((mod) => (
                        <SelectItem key={mod.value} value={mod.value}>
                          {mod.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Faixa de Valor (R$) */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Faixa de Valor Estimado (R$)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      placeholder="Mínimo"
                      value={valueMin}
                      onChange={(e) => setValueMin(e.target.value)}
                      className="h-8 text-xs bg-background"
                    />
                    <Input
                      type="number"
                      placeholder="Máximo"
                      value={valueMax}
                      onChange={(e) => setValueMax(e.target.value)}
                      className="h-8 text-xs bg-background"
                    />
                  </div>
                </div>

                {/* Prazo de Entrega Máximo */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Prazo Máx. de Entrega (dias)</Label>
                  <Input
                    type="number"
                    placeholder="Ex: 15 ou 30 dias"
                    value={deliveryMaxDays}
                    onChange={(e) => setDeliveryMaxDays(e.target.value)}
                    className="h-8 text-xs bg-background"
                  />
                </div>

                {/* Classificação de Score */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-muted-foreground">Classificação do Score</Label>
                  <Select value={classification} onValueChange={(val) => setClassification(val)}>
                    <SelectTrigger className="h-8 text-xs bg-background">
                      <SelectValue placeholder="Todas as notas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as notas</SelectItem>
                      <SelectItem value="green">🟢 Score Verde (Alta)</SelectItem>
                      <SelectItem value="yellow">🟡 Score Amarelo (Média)</SelectItem>
                      <SelectItem value="red">🔴 Score Vermelho (Baixa)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Botões de Ação do Filtro */}
                <div className="pt-2 space-y-2">
                  <Button
                    type="button"
                    onClick={() => executeSearch(1)}
                    className="w-full h-8 text-xs font-semibold gap-1.5"
                  >
                    <Filter className="h-3 w-3" />
                    Aplicar Filtros
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleClearFilters}
                    className="w-full h-8 text-xs"
                  >
                    Limpar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Lista de Resultados (3 colunas) */}
          <div className="lg:col-span-3 space-y-4">
            {/* Header de Contagem de Resultados */}
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span>
                Mostrando <strong className="text-foreground">{results.length}</strong> de{" "}
                <strong className="text-foreground">{totalCount}</strong> oportunidades encontradas
              </span>
              <span>
                Página <strong className="text-foreground">{page}</strong> de{" "}
                <strong className="text-foreground">{totalPages}</strong>
              </span>
            </div>

            {/* Banner de Erro */}
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Erro na busca</AlertTitle>
                <AlertDescription className="flex items-center justify-between">
                  <span>{error}</span>
                  <Button variant="outline" size="sm" onClick={() => executeSearch(page)}>
                    Tentar novamente
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Skeleton Loading */}
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Card key={i} className="p-4 space-y-3">
                    <div className="flex justify-between">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-5 w-16" />
                    </div>
                    <Skeleton className="h-10 w-full" />
                    <div className="flex gap-4">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  </Card>
                ))}
              </div>
            ) : results.length === 0 ? (
              /* Estado Vazio */
              <Card className="border-border shadow-xs">
                <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-3">
                  <Search className="h-8 w-8 text-muted-foreground/50" />
                  <div className="space-y-1 max-w-sm">
                    <h3 className="text-sm font-semibold text-foreground">
                      Nenhuma oportunidade encontrada
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Tente afrouxar os critérios de busca, remover palavras-chave restritivas ou desmarcar filtros regionais.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClearFilters}
                    className="text-xs"
                  >
                    Limpar Filtros de Busca
                  </Button>
                </CardContent>
              </Card>
            ) : (
              /* Lista de Cards de Oportunidades */
              <div className="space-y-3">
                {results.map((opp) => (
                  <Card
                    key={opp.id}
                    className="border-border shadow-xs hover:border-primary/50 transition-colors bg-card"
                  >
                    <CardContent className="p-4 space-y-3">
                      {/* Topo do Card */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-bold text-foreground hover:text-primary transition-colors">
                              <Link to="/oportunidade/$id" params={{ id: opp.id }}>
                                {opp.agency_name || "Órgão Público"}
                              </Link>
                            </h4>

                            {opp.state && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border">
                                <MapPin className="h-2.5 w-2.5 mr-1" />
                                {opp.city ? `${opp.city} - ` : ""}
                                {opp.state}
                              </Badge>
                            )}

                            {opp.modality && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {opp.modality}
                              </Badge>
                            )}

                            {opp.is_me_epp && (
                              <Badge className="bg-blue-600 text-white text-[10px] px-1.5 py-0">
                                ME/EPP
                              </Badge>
                            )}

                            {opp.is_compatible && (
                              <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0">
                                Compatível
                              </Badge>
                            )}
                          </div>

                          {opp.process_number && (
                            <p className="text-[11px] text-muted-foreground font-mono">
                              Processo: {opp.process_number}
                            </p>
                          )}
                        </div>

                        {/* Bloco de Score e Favorito */}
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <span className="text-xs font-bold text-foreground">
                              {opp.score > 0 ? `${opp.score} pts` : "Sem score"}
                            </span>
                            <span className="block text-[10px] uppercase text-muted-foreground">
                              {opp.classification === "green"
                                ? "🟢 Alta"
                                : opp.classification === "yellow"
                                ? "🟡 Média"
                                : "🔴 Baixa"}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => handleToggleFavorite(opp.id, opp.is_favorite, e)}
                            className={`p-1.5 rounded-md border transition-colors ${
                              opp.is_favorite
                                ? "bg-amber-400/20 border-amber-400/40 text-amber-500"
                                : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                            }`}
                            title={opp.is_favorite ? "Desfavoritar" : "Favoritar"}
                          >
                            <Star className={`h-3.5 w-3.5 ${opp.is_favorite ? "fill-amber-400" : ""}`} />
                          </button>
                        </div>
                      </div>

                      {/* Descrição do Objeto */}
                      <p className="text-xs text-foreground/90 line-clamp-2 leading-relaxed bg-muted/20 p-2.5 rounded-md">
                        {opp.object_description || "Sem descrição disponível."}
                      </p>

                      {/* Rodapé do Card com Valores e Ações */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/60 text-xs">
                        <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
                          <span className="font-bold text-foreground text-sm">
                            {formatCurrency(opp.estimated_value)}
                          </span>

                          {opp.delivery_deadline_days && (
                            <span className="flex items-center gap-1 text-[11px]">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              Entrega: {opp.delivery_deadline_days}d
                            </span>
                          )}

                          {opp.closing_date && (
                            <span className="flex items-center gap-1 text-[11px]">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              Encerra: {new Date(opp.closing_date).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => navigate({ to: "/simulador/$opportunityId", params: { opportunityId: opp.id } })}
                            className="h-7 text-xs gap-1 border-border"
                          >
                            <Calculator className="h-3 w-3 text-primary" />
                            Simulador
                          </Button>

                          {opp.source_url && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              asChild
                              className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                            >
                              <a href={opp.source_url} target="_blank" rel="noreferrer">
                                Fonte
                                <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            </Button>
                          )}

                          <Button
                            type="button"
                            size="sm"
                            onClick={() => navigate({ to: "/oportunidade/$id", params: { id: opp.id } })}
                            className="h-7 text-xs font-semibold"
                          >
                            Detalhes
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => executeSearch(page - 1)}
                  disabled={page <= 1 || loading}
                  className="gap-1 text-xs"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>

                <span className="text-xs text-muted-foreground">
                  Página {page} de {totalPages}
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => executeSearch(page + 1)}
                  disabled={page >= totalPages || loading}
                  className="gap-1 text-xs"
                >
                  Próxima
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
