import React, { useState, useEffect } from "react";
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
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Workflow,
  Plus,
  Star,
  Clock,
  DollarSign,
  Building,
  MapPin,
  Sparkles,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  Calculator,
  ExternalLink,
  ThumbsDown,
  Trophy,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  RefreshCw,
  Eye,
  SlidersHorizontal,
} from "lucide-react";

export const Route = createFileRoute("/pipeline")({
  head: () => ({
    meta: [
      { title: "Pipeline de Licitações — Radar de Licitações" },
      {
        name: "description",
        content: "Quadro Kanban de controle operacional de editais da empresa da captação à conclusão.",
      },
    ],
  }),
  component: PipelinePage,
});

interface PipelineCardItem {
  id: string;
  opportunity_id: string;
  stage: string;
  is_favorite: boolean;
  is_discarded: boolean;
  notes: string | null;
  updated_at: string;
  agency_name: string | null;
  process_number: string | null;
  object_description: string | null;
  estimated_value: number | null;
  state: string | null;
  city: string | null;
  closing_date: string | null;
  delivery_deadline_days: number | null;
  score: number;
  classification: "green" | "yellow" | "red";
  source_url: string;
}

interface StageConfig {
  key: string;
  title: string;
  color: string;
  badgeBg: string;
}

const PIPELINE_STAGES: StageConfig[] = [
  { key: "novas", title: "Novas", color: "border-blue-500", badgeBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { key: "analisando", title: "Analisando", color: "border-purple-500", badgeBg: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  { key: "interessante", title: "Interessante", color: "border-amber-500", badgeBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { key: "cotacao", title: "Cotação Fornecedor", color: "border-indigo-500", badgeBg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
  { key: "participar", title: "Participar / Lance", color: "border-emerald-500", badgeBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  { key: "vencida", title: "Vencida 🏆", color: "border-green-600", badgeBg: "bg-green-600/15 text-green-700 dark:text-green-300" },
  { key: "compra", title: "Compra / Pedido", color: "border-teal-500", badgeBg: "bg-teal-500/10 text-teal-600 dark:text-teal-400" },
  { key: "entrega", title: "Entrega / Transporte", color: "border-cyan-500", badgeBg: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" },
  { key: "pagamento", title: "Aguardando Pgto", color: "border-amber-600", badgeBg: "bg-amber-600/15 text-amber-700 dark:text-amber-300" },
  { key: "concluida", title: "Concluída", color: "border-slate-500", badgeBg: "bg-slate-500/10 text-slate-600 dark:text-slate-400" },
];

function PipelinePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PipelineCardItem[]>([]);
  const [hideDiscarded, setHideDiscarded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Modal de Resultado Real de Participação
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedOppForHistory, setSelectedOppForHistory] = useState<PipelineCardItem | null>(null);
  const [historyResult, setHistoryResult] = useState<"won" | "lost" | "disqualified" | "canceled">("won");
  const [winningValue, setWinningValue] = useState<string>("");
  const [ourBidValue, setOurBidValue] = useState<string>("");
  const [actualProfit, setActualProfit] = useState<string>("");
  const [actualMarginPct, setActualMarginPct] = useState<string>("");
  const [competitorsCount, setCompetitorsCount] = useState<string>("3");
  const [savingHistory, setSavingHistory] = useState(false);

  const loadPipelineItems = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchErr } = await supabase
        .from("pipeline_items")
        .select(`
          id,
          opportunity_id,
          stage,
          is_favorite,
          is_discarded,
          notes,
          updated_at,
          opportunities (
            id,
            agency_name,
            process_number,
            object_description,
            estimated_value,
            state,
            city,
            closing_date,
            delivery_deadline_days,
            source_url,
            opportunity_scores (
              score,
              classification
            )
          )
        `)
        .eq("owner_id", user.id);

      if (fetchErr) throw fetchErr;

      const formatted: PipelineCardItem[] = (data || [])
        .filter((item: any) => item.opportunities)
        .map((item: any) => {
          const opp = item.opportunities;
          const sc = opp.opportunity_scores?.[0];
          return {
            id: item.id,
            opportunity_id: item.opportunity_id,
            stage: item.stage || "novas",
            is_favorite: item.is_favorite || false,
            is_discarded: item.is_discarded || false,
            notes: item.notes,
            updated_at: item.updated_at,
            agency_name: opp.agency_name,
            process_number: opp.process_number,
            object_description: opp.object_description,
            estimated_value: opp.estimated_value,
            state: opp.state,
            city: opp.city,
            closing_date: opp.closing_date,
            delivery_deadline_days: opp.delivery_deadline_days,
            score: sc?.score ?? 0,
            classification: sc?.classification ?? "red",
            source_url: opp.source_url,
          };
        });

      setItems(formatted);
    } catch (err: any) {
      console.error("Falha ao carregar pipeline:", err);
      setError("Não foi possível carregar o pipeline de oportunidades.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPipelineItems();
  }, [user]);

  // Mover etapa via RPC move_pipeline_stage
  const handleMoveStage = async (oppId: string, newStage: string) => {
    const previousItems = [...items];
    setItems((prev) =>
      prev.map((item) =>
        item.opportunity_id === oppId ? { ...item, stage: newStage, updated_at: new Date().toISOString() } : item
      )
    );

    try {
      const { error: moveErr } = await (supabase.rpc as any)("move_pipeline_stage", {
        p_opportunity_id: oppId,
        p_stage: newStage,
      });

      if (moveErr) throw moveErr;

      toast.success(`Oportunidade movida para '${newStage.toUpperCase()}'`);

      // Se moveu para vencida ou concluída, sugere abrir o modal de resultado real
      if (newStage === "vencida" || newStage === "concluida") {
        const itemToRecord = items.find((i) => i.opportunity_id === oppId);
        if (itemToRecord) {
          openRecordResultModal(itemToRecord);
        }
      }
    } catch (err: any) {
      console.error("Erro ao mover etapa:", err);
      setItems(previousItems);
      toast.error(`Falha ao mover etapa: ${err?.message || "Erro de validação"}`);
    }
  };

  // Toggle Favorito
  const handleToggleFavorite = async (oppId: string, currentFav: boolean) => {
    const newFav = !currentFav;
    setItems((prev) =>
      prev.map((i) => (i.opportunity_id === oppId ? { ...i, is_favorite: newFav } : i))
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

  // Descartar / Reativar
  const handleToggleDiscard = async (oppId: string, currentDiscard: boolean) => {
    const newDiscard = !currentDiscard;
    setItems((prev) =>
      prev.map((i) => (i.opportunity_id === oppId ? { ...i, is_discarded: newDiscard } : i))
    );

    try {
      await (supabase.rpc as any)("upsert_pipeline_flag", {
        p_opportunity_id: oppId,
        p_discard: newDiscard,
      });
      toast.info(newDiscard ? "Oportunidade arquivada/descartada." : "Oportunidade reativada.");
    } catch (err) {
      console.error("Erro ao alterar descarte:", err);
    }
  };

  // Abrir modal de gravação de resultado real
  const openRecordResultModal = (item: PipelineCardItem) => {
    setSelectedOppForHistory(item);
    setWinningValue(item.estimated_value ? String(item.estimated_value) : "");
    setOurBidValue(item.estimated_value ? String(item.estimated_value * 0.95) : "");
    setActualProfit(item.estimated_value ? String(item.estimated_value * 0.15) : "");
    setActualMarginPct("15.0");
    setHistoryResult("won");
    setHistoryModalOpen(true);
  };

  // Salvar resultado real no participation_history
  const handleSaveHistory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedOppForHistory) return;

    setSavingHistory(true);
    try {
      const { error: histErr } = await supabase.from("participation_history").insert({
        owner_id: user.id,
        opportunity_id: selectedOppForHistory.opportunity_id,
        result: historyResult,
        winning_value: winningValue ? Number(winningValue) : null,
        our_bid_value: ourBidValue ? Number(ourBidValue) : null,
        actual_profit: actualProfit ? Number(actualProfit) : null,
        actual_margin_pct: actualMarginPct ? Number(actualMarginPct) : null,
        competitors_count: competitorsCount ? Number(competitorsCount) : null,
        agency_name: selectedOppForHistory.agency_name,
        recorded_at: new Date().toISOString(),
      });

      if (histErr) throw histErr;

      toast.success("Resultado real de participação registrado com sucesso no Histórico! 📊");
      setHistoryModalOpen(false);
    } catch (err: any) {
      console.error("Erro ao salvar histórico:", err);
      toast.error(`Falha ao registrar histórico: ${err?.message || "Erro de validação"}`);
    } finally {
      setSavingHistory(false);
    }
  };

  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return "R$ 0,00";
    return Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  // Filtros de busca textual e descarte
  const filteredItems = items.filter((item) => {
    if (hideDiscarded && item.is_discarded) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchObj = item.object_description?.toLowerCase().includes(q);
      const matchAgency = item.agency_name?.toLowerCase().includes(q);
      const matchProc = item.process_number?.toLowerCase().includes(q);
      return matchObj || matchAgency || matchProc;
    }
    return true;
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Cabeçalho da Página */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <PageHeader
            title="Pipeline de Licitações"
            description="Controle o ciclo operacional de cada processo da captação até o faturamento e encerramento."
          />

          <div className="flex flex-wrap items-center gap-3">
            {/* Toggle Ocultar Descartadas */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-card border border-border px-3 py-1.5 rounded-lg shadow-xs">
              <Label htmlFor="hide-discarded" className="cursor-pointer">
                Ocultar Descartadas
              </Label>
              <Switch
                id="hide-discarded"
                checked={hideDiscarded}
                onCheckedChange={setHideDiscarded}
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={loadPipelineItems}
              disabled={loading}
              className="gap-2 shadow-xs border-border"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-primary" : ""}`} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Barra de Filtro Rápido no Pipeline */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Input
              type="text"
              placeholder="Filtrar cartões por órgão, processo ou palavra-chave..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 text-xs bg-card border-border shadow-xs"
            />
          </div>
          <span className="text-xs text-muted-foreground">
            Total no Pipeline: <strong className="text-foreground">{filteredItems.length}</strong> oportunidades
          </span>
        </div>

        {/* Banner de Erro */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erro ao carregar pipeline</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={loadPipelineItems} className="ml-4">
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Quadro Kanban (Scroll Horizontal Suave) */}
        {loading ? (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="min-w-[280px] w-[300px] space-y-3 shrink-0">
                <Skeleton className="h-10 w-full rounded-lg" />
                <Skeleton className="h-36 w-full rounded-lg" />
                <Skeleton className="h-36 w-full rounded-lg" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-6 pt-1 select-none min-h-[600px]">
            {PIPELINE_STAGES.map((col, colIdx) => {
              const colItems = filteredItems.filter((i) => i.stage === col.key);

              return (
                <div
                  key={col.key}
                  className="min-w-[290px] w-[310px] flex flex-col shrink-0 bg-muted/20 border border-border/70 rounded-xl overflow-hidden shadow-2xs"
                >
                  {/* Cabeçalho da Coluna */}
                  <div className={`p-3 border-b border-border bg-card/60 flex items-center justify-between border-t-2 ${col.color}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground">
                        {col.title}
                      </span>
                    </div>
                    <Badge variant="secondary" className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${col.badgeBg}`}>
                      {colItems.length}
                    </Badge>
                  </div>

                  {/* Lista de Cards da Etapa */}
                  <div className="p-2 space-y-2.5 flex-1 overflow-y-auto max-h-[calc(100vh-280px)]">
                    {colItems.length === 0 ? (
                      <div className="h-32 flex flex-col items-center justify-center text-center p-4 text-[11px] text-muted-foreground/60 border border-dashed border-border/60 rounded-lg">
                        <span>Nenhuma oportunidade nesta etapa</span>
                      </div>
                    ) : (
                      colItems.map((item) => (
                        <Card
                          key={item.id}
                          className={`border-border/90 shadow-xs hover:border-primary/50 transition-all bg-card ${
                            item.is_discarded ? "opacity-50" : ""
                          }`}
                        >
                          <CardContent className="p-3.5 space-y-2.5">
                            {/* Topo do Card: Órgão e Favorito */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-0.5 min-w-0 flex-1">
                                <h4 className="text-xs font-bold text-foreground hover:text-primary transition-colors truncate">
                                  <Link to="/oportunidade/$id" params={{ id: item.opportunity_id }}>
                                    {item.agency_name || "Órgão Público"}
                                  </Link>
                                </h4>
                                {item.process_number && (
                                  <p className="text-[10px] text-muted-foreground font-mono truncate">
                                    Proc: {item.process_number}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleToggleFavorite(item.opportunity_id, item.is_favorite)}
                                  className={`p-1 rounded transition-colors ${
                                    item.is_favorite ? "text-amber-500" : "text-muted-foreground hover:text-foreground"
                                  }`}
                                  title="Favoritar"
                                >
                                  <Star className={`h-3.5 w-3.5 ${item.is_favorite ? "fill-amber-400" : ""}`} />
                                </button>
                              </div>
                            </div>

                            {/* Objeto Resumido */}
                            <p className="text-[11px] text-foreground/80 line-clamp-2 leading-tight">
                              {item.object_description || "Sem descrição informada."}
                            </p>

                            {/* Valores e Tags */}
                            <div className="space-y-1 pt-1 border-t border-border/50 text-[11px]">
                              <div className="flex items-center justify-between font-semibold text-foreground">
                                <span>{formatCurrency(item.estimated_value)}</span>
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1.5 py-0"
                                >
                                  {item.score > 0 ? `${item.score} pts` : "Score"}
                                </Badge>
                              </div>

                              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                {item.state && (
                                  <span className="flex items-center gap-0.5">
                                    <MapPin className="h-2.5 w-2.5" />
                                    {item.state}
                                  </span>
                                )}
                                {item.delivery_deadline_days && (
                                  <span className="flex items-center gap-0.5">
                                    <Clock className="h-2.5 w-2.5" />
                                    {item.delivery_deadline_days}d
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Ações de Transição de Etapa */}
                            <div className="flex items-center justify-between pt-1 border-t border-border/50 gap-1">
                              {/* Botão Voltar Etapa */}
                              {colIdx > 0 ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleMoveStage(item.opportunity_id, PIPELINE_STAGES[colIdx - 1].key)}
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                  title={`Voltar para ${PIPELINE_STAGES[colIdx - 1].title}`}
                                >
                                  <ChevronLeft className="h-3 w-3" />
                                </Button>
                              ) : <span className="w-6" />}

                              {/* Ações Rápidas de Links */}
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => navigate({ to: "/simulador/$opportunityId", params: { opportunityId: item.opportunity_id } })}
                                  className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                                  title="Simular Custos"
                                >
                                  <Calculator className="h-3 w-3" />
                                </Button>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openRecordResultModal(item)}
                                  className="h-6 px-1.5 text-[10px] text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10"
                                  title="Registrar Resultado Real"
                                >
                                  <Trophy className="h-3 w-3" />
                                </Button>
                              </div>

                              {/* Botão Avançar Etapa */}
                              {colIdx < PIPELINE_STAGES.length - 1 ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleMoveStage(item.opportunity_id, PIPELINE_STAGES[colIdx + 1].key)}
                                  className="h-6 w-6 p-0 text-primary hover:bg-primary/10"
                                  title={`Avançar para ${PIPELINE_STAGES[colIdx + 1].title}`}
                                >
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </Button>
                              ) : <span className="w-6" />}
                            </div>
                          </CardContent>
                        </Card>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal para Registrar Resultado Real de Participação */}
        <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-5 w-5 text-amber-500" />
                Registrar Resultado da Licitação
              </DialogTitle>
              <DialogDescription className="text-xs">
                Registre os valores reais e desfecho da disputa para alimentar a Inteligência de Preços e Taxa de Vitória.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveHistory} className="space-y-4 text-xs pt-2">
              {/* Órgão e Processo */}
              <div className="p-3 bg-muted/40 rounded-lg border border-border space-y-1">
                <span className="font-semibold text-foreground block">
                  {selectedOppForHistory?.agency_name || "Órgão Licitante"}
                </span>
                <p className="text-[11px] text-muted-foreground line-clamp-1">
                  {selectedOppForHistory?.object_description}
                </p>
              </div>

              {/* Desfecho */}
              <div className="space-y-1.5">
                <Label className="text-xs">Desfecho / Resultado da Disputa</Label>
                <Select
                  value={historyResult}
                  onValueChange={(val: any) => setHistoryResult(val)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione o resultado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="won">🏆 Vencida (Homologada / Adjudicada)</SelectItem>
                    <SelectItem value="lost">❌ Perdida na Disputa de Lances</SelectItem>
                    <SelectItem value="disqualified">⚠️ Desclassificada / Inabilitada</SelectItem>
                    <SelectItem value="canceled">🚫 Revogada / Anulada pelo Órgão</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Valores em Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Valor Vencedor (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="R$ 0,00"
                    value={winningValue}
                    onChange={(e) => setWinningValue(e.target.value)}
                    className="h-9 text-xs font-semibold"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Nosso Último Lance (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="R$ 0,00"
                    value={ourBidValue}
                    onChange={(e) => setOurBidValue(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              {/* Lucro e Margem Reais (se venceu) */}
              {historyResult === "won" && (
                <div className="grid grid-cols-2 gap-3 bg-emerald-500/5 p-3 rounded-lg border border-emerald-500/20">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
                      Lucro Líquido Real (R$)
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="R$ 0,00"
                      value={actualProfit}
                      onChange={(e) => setActualProfit(e.target.value)}
                      className="h-9 text-xs bg-background"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
                      Margem Real (%)
                    </Label>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Ex: 15.5%"
                      value={actualMarginPct}
                      onChange={(e) => setActualMarginPct(e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>
                </div>
              )}

              {/* Número de Concorrentes */}
              <div className="space-y-1.5">
                <Label className="text-xs">Concorrentes na Disputa</Label>
                <Input
                  type="number"
                  placeholder="Número de empresas participantes"
                  value={competitorsCount}
                  onChange={(e) => setCompetitorsCount(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setHistoryModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingHistory}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  <FileCheck className="h-4 w-4" />
                  {savingHistory ? "Salvando..." : "Gravar Resultado"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
