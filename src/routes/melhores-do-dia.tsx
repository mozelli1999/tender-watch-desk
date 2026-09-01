import React, { useState, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/layout/app-layout";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Sparkles,
  RefreshCw,
  Trophy,
  DollarSign,
  Clock,
  MapPin,
  Building,
  ShieldCheck,
  AlertTriangle,
  Star,
  ExternalLink,
  Calculator,
  ArrowRight,
  Workflow,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  FileText,
  ThumbsDown,
} from "lucide-react";

export const Route = createFileRoute("/melhores-do-dia")({
  head: () => ({
    meta: [
      { title: "As 10 Melhores Oportunidades Hoje — Radar de Licitações" },
      {
        name: "description",
        content: "Ranking diário das 10 licitações mais promissoras cruzadas com seu catálogo e parâmetros.",
      },
    ],
  }),
  component: MelhoresDoDiaPage,
});

interface TopOpportunity {
  id: string;
  agency_name: string | null;
  process_number: string | null;
  modality: string | null;
  object_description: string | null;
  category: string | null;
  estimated_value: number | null;
  delivery_deadline_days: number | null;
  state: string | null;
  city: string | null;
  session_date: string | null;
  closing_date: string | null;
  is_me_epp: boolean | null;
  source_url: string;
  score: number;
  classification: "green" | "yellow" | "red";
  reasons: string[];
  risk_points: string[];
  estimated_profit: number | null;
  required_capital: number | null;
  is_favorite: boolean;
  stage: string;
}

const SCORE_BADGES: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  green: {
    label: "Alta Recomendação",
    bg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
    text: "text-emerald-600 dark:text-emerald-400",
    icon: "🟢",
  },
  yellow: {
    label: "Atenção Operacional",
    bg: "bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300",
    text: "text-amber-600 dark:text-amber-400",
    icon: "🟡",
  },
  red: {
    label: "Baixa Compatibilidade",
    bg: "bg-rose-500/15 border-rose-500/30 text-rose-700 dark:text-rose-300",
    text: "text-rose-600 dark:text-rose-400",
    icon: "🔴",
  },
};

function MelhoresDoDiaPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<TopOpportunity[]>([]);

  const loadTopOpportunities = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const { data, error: rpcError } = await supabase.rpc("get_top_10_opportunities");

      if (rpcError) {
        throw rpcError;
      }

      setOpportunities((data as unknown as TopOpportunity[]) || []);
    } catch (err: any) {
      console.error("Erro ao carregar top 10:", err);
      setError("Falha ao calcular o ranking das melhores oportunidades. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTopOpportunities();
  }, [user]);

  // Recalcular Score de todas as compatíveis
  const handleRecomputeScores = async () => {
    setRecomputing(true);
    try {
      const { data, error: funcError } = await supabase.functions.invoke("compute-score", {
        body: { recompute_all: true },
      });

      if (funcError) throw funcError;

      toast.success("Scores recalculados com base nas configurações da sua empresa!");
      loadTopOpportunities();
    } catch (err: any) {
      console.error("Erro ao recalcular score:", err);
      toast.error(`Falha no cálculo: ${err?.message || "Erro de execução"}`);
    } finally {
      setRecomputing(false);
    }
  };

  // Favoritar / Desfavoritar
  const handleToggleFavorite = async (oppId: string, currentFav: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    const newFav = !currentFav;

    setOpportunities((prev) =>
      prev.map((o) => (o.id === oppId ? { ...o, is_favorite: newFav } : o))
    );

    try {
      const { error: flagErr } = await supabase.rpc("upsert_pipeline_flag", {
        p_opportunity_id: oppId,
        p_favorite: newFav,
      });

      if (flagErr) throw flagErr;
      toast.success(newFav ? "Adicionada às favoritas ⭐" : "Removida das favoritas");
    } catch (err: any) {
      console.error("Erro ao favoritar:", err);
      toast.error("Erro ao atualizar favorito.");
    }
  };

  // Descartar Oportunidade
  const handleDiscard = async (oppId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpportunities((prev) => prev.filter((o) => o.id !== oppId));

    try {
      const { error: flagErr } = await supabase.rpc("upsert_pipeline_flag", {
        p_opportunity_id: oppId,
        p_discard: true,
      });

      if (flagErr) throw flagErr;
      toast.info("Oportunidade descartada da sua visão ativa.");
    } catch (err: any) {
      console.error("Erro ao descartar:", err);
      toast.error("Erro ao descartar oportunidade.");
    }
  };

  // Mover para o Pipeline
  const handleSendToPipeline = async (oppId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error: moveErr } = await supabase.rpc("move_pipeline_stage", {
        p_opportunity_id: oppId,
        p_stage: "analisando",
      });

      if (moveErr) throw moveErr;

      setOpportunities((prev) =>
        prev.map((o) => (o.id === oppId ? { ...o, stage: "analisando" } : o))
      );

      toast.success("Oportunidade avançada para a etapa 'ANALISANDO' no Pipeline! 📋");
    } catch (err: any) {
      console.error("Erro ao mover para pipeline:", err);
      toast.error("Falha ao mover para o pipeline.");
    }
  };

  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return "R$ 0,00";
    return Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const todayFormatted = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header da Página */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                <Trophy className="h-4 w-4" />
              </span>
              <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                As 10 Melhores Oportunidades de Hoje
              </h1>
            </div>
            <p className="text-xs text-muted-foreground mt-1 capitalize">
              {todayFormatted} • Ranqueadas com base no seu catálogo, margem mínima, capital de giro e logística.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRecomputeScores}
              disabled={recomputing || loading}
              className="gap-2 shadow-xs border-border"
            >
              <RefreshCw className={`h-4 w-4 ${recomputing ? "animate-spin text-primary" : ""}`} />
              {recomputing ? "Recalculando..." : "Recalcular Ranking"}
            </Button>

            <Button
              variant="default"
              size="sm"
              onClick={() => navigate({ to: "/pipeline" })}
              className="gap-2 shadow-xs"
            >
              <Workflow className="h-4 w-4" />
              Ver Pipeline
            </Button>
          </div>
        </div>

        {/* Banner de Erro */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erro no cálculo</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={loadTopOpportunities} className="ml-4">
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Lista de Melhores Oportunidades */}
        {loading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-6 w-20" />
                </div>
                <Skeleton className="h-12 w-full" />
                <div className="grid grid-cols-4 gap-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              </Card>
            ))}
          </div>
        ) : opportunities.length === 0 ? (
          /* Estado Vazio */
          <Card className="border-border bg-card shadow-xs">
            <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-1.5 max-w-md">
                <h3 className="text-base font-bold text-foreground">
                  Nenhuma oportunidade compatível no momento
                </h3>
                <p className="text-xs text-muted-foreground">
                  Não encontramos licitações que atendam concomitantemente aos filtros de catálogo, capital disponível e margem mínima.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate({ to: "/produtos" })}
                  className="text-xs"
                >
                  Cadastrar Mais Produtos
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate({ to: "/configuracoes" })}
                  className="text-xs"
                >
                  Ajustar Margem e Capital
                </Button>
                <Button
                  size="sm"
                  onClick={() => navigate({ to: "/busca" })}
                  className="text-xs"
                >
                  Buscar no Acervo Geral
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Cards Ranqueados */
          <div className="space-y-4">
            {opportunities.map((opp, index) => {
              const scoreBadge = SCORE_BADGES[opp.classification] || SCORE_BADGES.red;
              const isFirst = index === 0;

              return (
                <Card
                  key={opp.id}
                  className={`border transition-all shadow-xs hover:border-primary/50 relative overflow-hidden ${
                    isFirst
                      ? "border-emerald-500/40 bg-gradient-to-r from-emerald-500/5 via-card to-card"
                      : "border-border bg-card"
                  }`}
                >
                  {/* Faixa de Destaque para o 1º Lugar */}
                  {isFirst && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
                  )}

                  <CardHeader className="p-5 pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      {/* Posição e Órgão */}
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-black text-sm shadow-xs ${
                            index === 0
                              ? "bg-amber-400 text-slate-950"
                              : index === 1
                              ? "bg-slate-300 text-slate-900"
                              : index === 2
                              ? "bg-amber-600 text-white"
                              : "bg-muted text-muted-foreground border border-border"
                          }`}
                        >
                          {index + 1}º
                        </div>

                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-bold text-foreground hover:text-primary transition-colors">
                              <Link to="/oportunidade/$id" params={{ id: opp.id }}>
                                {opp.agency_name || "Órgão Público Não Identificado"}
                              </Link>
                            </h3>

                            {opp.state && (
                              <Badge variant="outline" className="text-[10px] px-2 py-0 border-border">
                                <MapPin className="h-2.5 w-2.5 mr-1" />
                                {opp.city ? `${opp.city} - ` : ""}
                                {opp.state}
                              </Badge>
                            )}

                            {opp.modality && (
                              <Badge variant="secondary" className="text-[10px] px-2 py-0">
                                {opp.modality}
                              </Badge>
                            )}

                            {opp.is_me_epp && (
                              <Badge className="bg-blue-600 text-white text-[10px] px-2 py-0">
                                Exclusivo ME/EPP
                              </Badge>
                            )}
                          </div>

                          {opp.process_number && (
                            <p className="text-xs text-muted-foreground font-mono">
                              Processo: {opp.process_number}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Bloco de Score 0-100 */}
                      <div className="flex items-center gap-3 self-end sm:self-auto">
                        <div className="text-right">
                          <div className="flex items-center gap-1.5 justify-end">
                            <span className="text-xs">{scoreBadge.icon}</span>
                            <span className="text-lg font-black tracking-tight text-foreground">
                              {opp.score}
                            </span>
                            <span className="text-xs text-muted-foreground">/100</span>
                          </div>
                          <span className={`text-[10px] font-semibold uppercase tracking-wider block ${scoreBadge.text}`}>
                            {scoreBadge.label}
                          </span>
                        </div>

                        {/* Botão Favoritar */}
                        <button
                          type="button"
                          onClick={(e) => handleToggleFavorite(opp.id, opp.is_favorite, e)}
                          className={`p-2 rounded-lg border transition-colors ${
                            opp.is_favorite
                              ? "bg-amber-400/20 border-amber-400/40 text-amber-500"
                              : "bg-card border-border text-muted-foreground hover:text-foreground"
                          }`}
                          title={opp.is_favorite ? "Desfavoritar" : "Favoritar"}
                        >
                          <Star className={`h-4 w-4 ${opp.is_favorite ? "fill-amber-400" : ""}`} />
                        </button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-5 pt-0 space-y-4">
                    {/* Descrição do Objeto */}
                    <p className="text-xs text-foreground/90 leading-relaxed bg-muted/30 p-3 rounded-lg border border-border/50">
                      {opp.object_description || "Descrição completa disponível no edital."}
                    </p>

                    {/* Métricas Principais em Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {/* Valor Estimado */}
                      <div className="rounded-lg border border-border bg-card p-2.5">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <DollarSign className="h-3 w-3 text-emerald-500" />
                          Valor Estimado
                        </span>
                        <p className="text-xs font-bold text-foreground mt-0.5 truncate">
                          {formatCurrency(opp.estimated_value)}
                        </p>
                      </div>

                      {/* Lucro Estimado */}
                      <div className="rounded-lg border border-border bg-emerald-500/5 p-2.5">
                        <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1">
                          <Trophy className="h-3 w-3 text-emerald-600" />
                          Lucro Estimado
                        </span>
                        <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mt-0.5 truncate">
                          {opp.estimated_profit ? formatCurrency(opp.estimated_profit) : "Sob simulação"}
                        </p>
                      </div>

                      {/* Capital Necessário */}
                      <div className="rounded-lg border border-border bg-card p-2.5">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3 text-primary" />
                          Capital Necessário
                        </span>
                        <p className="text-xs font-bold text-foreground mt-0.5 truncate">
                          {opp.required_capital ? formatCurrency(opp.required_capital) : "A calcular"}
                        </p>
                      </div>

                      {/* Prazo de Entrega */}
                      <div className="rounded-lg border border-border bg-card p-2.5">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3 text-amber-500" />
                          Prazo de Entrega
                        </span>
                        <p className="text-xs font-bold text-foreground mt-0.5 truncate">
                          {opp.delivery_deadline_days ? `${opp.delivery_deadline_days} dias corridos` : "Conforme edital"}
                        </p>
                      </div>
                    </div>

                    {/* Motivos e Riscos */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      {/* Motivos do Score Positivo */}
                      {opp.reasons && opp.reasons.length > 0 && (
                        <div className="space-y-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                          <span className="font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 text-[11px]">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                            Destaques Positivos do Algoritmo
                          </span>
                          <ul className="space-y-1 text-muted-foreground text-[11px]">
                            {opp.reasons.slice(0, 3).map((reason, rIdx) => (
                              <li key={rIdx} className="flex items-start gap-1.5">
                                <span className="text-emerald-600 dark:text-emerald-400 mt-0.5">•</span>
                                <span>{reason}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Pontos de Risco do Edital */}
                      {opp.risk_points && opp.risk_points.length > 0 ? (
                        <div className="space-y-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                          <span className="font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5 text-[11px]">
                            <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                            Pontos de Atenção & Riscos
                          </span>
                          <ul className="space-y-1 text-muted-foreground text-[11px]">
                            {opp.risk_points.slice(0, 3).map((risk, rIdx) => (
                              <li key={rIdx} className="flex items-start gap-1.5">
                                <span className="text-amber-600 dark:text-amber-400 mt-0.5">•</span>
                                <span>{risk}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <div className="space-y-1.5 rounded-lg border border-border/80 bg-muted/20 p-3">
                          <span className="font-semibold text-foreground flex items-center gap-1.5 text-[11px]">
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                            Conformidade Documental Padrão
                          </span>
                          <p className="text-[11px] text-muted-foreground">
                            Nenhuma restrição extraordinária detectada na análise inicial do edital.
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>

                  <CardFooter className="p-4 border-t border-border bg-muted/10 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        Etapa no Pipeline:
                      </span>
                      <Badge variant="outline" className="text-[10px] uppercase font-mono">
                        {opp.stage || "novas"}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Descartar */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleDiscard(opp.id, e)}
                        className="text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1 h-8"
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                        Descartar
                      </Button>

                      {/* Simulador */}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => navigate({ to: "/simulador/$opportunityId", params: { opportunityId: opp.id } })}
                        className="text-xs gap-1.5 h-8 border-border"
                      >
                        <Calculator className="h-3.5 w-3.5 text-primary" />
                        Simular Custos
                      </Button>

                      {/* Mover para Pipeline */}
                      {opp.stage === "novas" && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={(e) => handleSendToPipeline(opp.id, e)}
                          className="text-xs gap-1.5 h-8"
                        >
                          <Workflow className="h-3.5 w-3.5 text-purple-500" />
                          Avançar no Pipeline
                        </Button>
                      )}

                      {/* Fonte Original */}
                      {opp.source_url && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          asChild
                          className="text-xs gap-1.5 h-8 border-border"
                        >
                          <a href={opp.source_url} target="_blank" rel="noreferrer">
                            Ver na Fonte
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </Button>
                      )}

                      {/* Análise Completa */}
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => navigate({ to: "/oportunidade/$id", params: { id: opp.id } })}
                        className="text-xs gap-1.5 h-8 bg-primary text-primary-foreground font-semibold"
                      >
                        Análise Completa
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}

        {/* Rodapé Informativo / Compliance */}
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-4 text-xs text-muted-foreground">
          <HelpCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-foreground">Regra Operacional do Radar:</span> O algoritmo de Score pondera parâmetros cadastrados de margem, folga de capital de giro e logística. O Radar auxilia e orienta a priorização das propostas; a decisão final de participação em pregões e envio de lances é sempre prerrogativa do Operador.
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
