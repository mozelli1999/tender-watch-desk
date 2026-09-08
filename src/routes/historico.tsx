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
  CardDescription,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
} from "recharts";
import {
  BarChart3,
  Trophy,
  TrendingUp,
  Percent,
  Users,
  DollarSign,
  Plus,
  Building,
  Package,
  Calendar,
  AlertTriangle,
  FileText,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Trash2,
  RefreshCw,
  Award,
} from "lucide-react";

export const Route = createFileRoute("/historico")({
  head: () => ({
    meta: [
      { title: "Histórico & Inteligência — Radar de Licitações" },
      {
        name: "description",
        content: "Relatórios de inteligência de preços, taxa de vitória e histórico de participações.",
      },
    ],
  }),
  component: HistoricoPage,
});

interface IntelligenceReport {
  total_participations: number;
  won_count: number;
  lost_count: number;
  disqualified_count: number;
  canceled_count: number;
  win_rate_pct: number;
  total_revenue_won: number;
  total_profit_realized: number;
  avg_profit: number;
  avg_margin_pct: number;
  avg_competitors: number;
  most_profitable_products: Array<{
    product_id: string;
    product_name: string;
    product_category: string;
    total_participations: number;
    wins: number;
    total_profit: number;
    avg_margin_pct: number;
  }>;
  top_buying_agencies: Array<{
    agency_name: string;
    participations: number;
    wins: number;
    total_value_won: number;
    total_profit: number;
  }>;
  monthly_history: Array<{
    month: string;
    participations: number;
    wins: number;
    revenue: number;
    profit: number;
  }>;
}

interface ParticipationRecord {
  id: string;
  opportunity_id: string | null;
  agency_name: string | null;
  result: "won" | "lost" | "disqualified" | "canceled";
  winning_value: number | null;
  our_bid_value: number | null;
  actual_profit: number | null;
  actual_margin_pct: number | null;
  competitors_count: number | null;
  recorded_at: string;
  products?: {
    name: string;
    category: string;
  } | null;
}

function HistoricoPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [records, setRecords] = useState<ParticipationRecord[]>([]);

  // Modal de Criação Manual de Histórico
  const [modalOpen, setModalOpen] = useState(false);
  const [agencyName, setAgencyName] = useState("");
  const [result, setResult] = useState<"won" | "lost" | "disqualified" | "canceled">("won");
  const [winningValue, setWinningValue] = useState("");
  const [ourBidValue, setOurBidValue] = useState("");
  const [actualProfit, setActualProfit] = useState("");
  const [actualMarginPct, setActualMarginPct] = useState("");
  const [competitorsCount, setCompetitorsCount] = useState("3");
  const [selectedProductId, setSelectedProductId] = useState<string>("none");
  const [productsList, setProductsList] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Carregar relatório via RPC get_intelligence_report
      const { data: rpcData, error: rpcErr } = await (supabase.rpc as any)("get_intelligence_report");

      if (rpcErr) {
        console.warn("Aviso RPC inteligência:", rpcErr);
      } else if (rpcData) {
        setReport(rpcData as unknown as IntelligenceReport);
      }

      // 2. Carregar lista de participações recentes
      const { data: recData, error: recErr } = await supabase
        .from("participation_history")
        .select(`
          id,
          opportunity_id,
          agency_name,
          result,
          winning_value,
          our_bid_value,
          actual_profit,
          actual_margin_pct,
          competitors_count,
          recorded_at,
          products (
            name,
            category
          )
        `)
        .eq("owner_id", user.id)
        .order("recorded_at", { ascending: false });

      if (recErr) throw recErr;
      setRecords((recData as unknown as ParticipationRecord[]) || []);

      // 3. Carregar produtos para o select do modal
      const { data: prodData } = await supabase
        .from("products")
        .select("id, name")
        .eq("owner_id", user.id)
        .order("name", { ascending: true });

      if (prodData) {
        setProductsList(prodData);
      }
    } catch (err: any) {
      console.error("Falha ao carregar inteligência:", err);
      setError("Não foi possível carregar os relatórios de inteligência.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  // Salvar nova participação manual
  const handleSaveParticipation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    try {
      const { error: insertErr } = await supabase.from("participation_history").insert({
        owner_id: user.id,
        agency_name: agencyName.trim() || "Órgão Público",
        result,
        winning_value: winningValue ? Number(winningValue) : null,
        our_bid_value: ourBidValue ? Number(ourBidValue) : null,
        actual_profit: actualProfit ? Number(actualProfit) : null,
        actual_margin_pct: actualMarginPct ? Number(actualMarginPct) : null,
        competitors_count: competitorsCount ? Number(competitorsCount) : null,
        main_product_id: selectedProductId !== "none" ? selectedProductId : null,
        recorded_at: new Date().toISOString(),
      });

      if (insertErr) throw insertErr;

      toast.success("Participação registrada com sucesso!");
      setModalOpen(false);
      setAgencyName("");
      setWinningValue("");
      setOurBidValue("");
      setActualProfit("");
      setActualMarginPct("");
      setSelectedProductId("none");
      loadData();
    } catch (err: any) {
      console.error("Erro ao salvar participação:", err);
      toast.error(`Falha ao registrar: ${err?.message || "Erro de banco de dados"}`);
    } finally {
      setSaving(false);
    }
  };

  // Excluir registro do histórico
  const handleDeleteRecord = async (recId: string) => {
    if (!confirm("Tem certeza que deseja remover este registro do histórico?")) return;

    try {
      const { error: delErr } = await supabase
        .from("participation_history")
        .delete()
        .eq("id", recId);

      if (delErr) throw delErr;

      toast.success("Registro removido.");
      setRecords((prev) => prev.filter((r) => r.id !== recId));
      loadData();
    } catch (err) {
      console.error("Erro ao excluir histórico:", err);
      toast.error("Falha ao excluir registro.");
    }
  };

  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return "R$ 0,00";
    return Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const getResultBadge = (res: string) => {
    switch (res) {
      case "won":
        return <Badge className="bg-emerald-600 text-white text-[10px]">🏆 Vencida</Badge>;
      case "lost":
        return <Badge variant="secondary" className="text-rose-600 dark:text-rose-400 bg-rose-500/10 text-[10px]">Perdida</Badge>;
      case "disqualified":
        return <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px]">Inabilitada</Badge>;
      case "canceled":
        return <Badge variant="outline" className="text-muted-foreground text-[10px]">Anulada</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{res}</Badge>;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Cabeçalho da Página */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <PageHeader
            title="Histórico & Inteligência de Preços"
            description="Métricas consolidadas de vitórias, lucratividade real e inteligência competitiva gerada a partir das suas participações."
          />

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="gap-2 shadow-xs border-border"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-primary" : ""}`} />
              Atualizar
            </Button>

            <Button
              size="sm"
              onClick={() => setModalOpen(true)}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              <Plus className="h-4 w-4" />
              Registrar Participação
            </Button>
          </div>
        </div>

        {/* Banner de Erro */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erro ao carregar dados</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={loadData} className="ml-4">
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Seção 1: Indicadores Estratégicos (KPIs) */}
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="p-4 space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-28" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {/* Taxa de Vitória */}
            <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-xs">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300">
                  <span className="text-xs font-semibold">Taxa de Vitória</span>
                  <Trophy className="h-4 w-4" />
                </div>
                <div className="text-2xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300">
                  {report?.win_rate_pct ?? 0}%
                </div>
                <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80">
                  {report?.won_count ?? 0} vitórias em {report?.total_participations ?? 0} disputas
                </p>
              </CardContent>
            </Card>

            {/* Faturamento Vencido */}
            <Card className="border-border shadow-xs">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Faturamento Vencido</span>
                  <DollarSign className="h-4 w-4 text-primary" />
                </div>
                <div className="text-lg font-bold tracking-tight text-foreground truncate">
                  {formatCurrency(report?.total_revenue_won)}
                </div>
                <p className="text-[11px] text-muted-foreground">contratos homologados</p>
              </CardContent>
            </Card>

            {/* Lucro Real Realizado */}
            <Card className="border-border shadow-xs">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Lucro Real</span>
                  <Award className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="text-lg font-bold tracking-tight text-emerald-600 dark:text-emerald-400 truncate">
                  {formatCurrency(report?.total_profit_realized)}
                </div>
                <p className="text-[11px] text-muted-foreground">líquido acumulado</p>
              </CardContent>
            </Card>

            {/* Margem Real Média */}
            <Card className="border-border shadow-xs">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Margem Média</span>
                  <Percent className="h-4 w-4 text-indigo-500" />
                </div>
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {report?.avg_margin_pct ?? 0}%
                </div>
                <p className="text-[11px] text-muted-foreground">rentabilidade média</p>
              </CardContent>
            </Card>

            {/* Média de Concorrentes */}
            <Card className="border-border shadow-xs">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Concorrência Média</span>
                  <Users className="h-4 w-4 text-amber-500" />
                </div>
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {report?.avg_competitors ?? 0}
                </div>
                <p className="text-[11px] text-muted-foreground">empresas por sessão</p>
              </CardContent>
            </Card>

            {/* Total Disputadas */}
            <Card className="border-border shadow-xs">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Total Participações</span>
                  <BarChart3 className="h-4 w-4 text-purple-500" />
                </div>
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {report?.total_participations ?? 0}
                </div>
                <p className="text-[11px] text-muted-foreground">registros no histórico</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Seção 2: Gráficos de Inteligência */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Gráfico de Evolução Mensal */}
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                Evolução Mensal de Faturamento e Lucro
              </CardTitle>
              <CardDescription className="text-xs">
                Contratos vencidos ao longo dos meses.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-72 pt-4">
              {loading ? (
                <Skeleton className="w-full h-full" />
              ) : !report?.monthly_history || report.monthly_history.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-xs space-y-2">
                  <BarChart3 className="h-8 w-8 text-muted-foreground/50" />
                  <span>Nenhum histórico mensal registrado ainda.</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.monthly_history}>
                    <XAxis dataKey="month" stroke="#888888" fontSize={11} />
                    <YAxis stroke="#888888" fontSize={11} tickFormatter={(val) => `R$${val / 1000}k`} />
                    <Tooltip
                      formatter={(val: any) => [formatCurrency(val), ""]}
                      contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", color: "#fff", fontSize: "12px", borderRadius: "8px" }}
                    />
                    <Legend />
                    <Bar dataKey="revenue" name="Faturamento" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="profit" name="Lucro Real" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Produtos Mais Rentáveis */}
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                Produtos Mais Lucrativos do Portfólio
              </CardTitle>
              <CardDescription className="text-xs">
                Itens com maior volume de lucro acumulado em licitações ganhas.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : !report?.most_profitable_products || report.most_profitable_products.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground text-xs space-y-2 p-6 text-center">
                  <Package className="h-8 w-8 text-muted-foreground/50" />
                  <span>Vincule produtos às participações para gerar inteligência de rentabilidade por item.</span>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {report.most_profitable_products.map((prod, idx) => (
                    <div key={prod.product_id || idx} className="p-3.5 flex items-center justify-between gap-4">
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <span className="text-xs font-semibold text-foreground truncate block">
                          {prod.product_name}
                        </span>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          {prod.product_category && <span>{prod.product_category}</span>}
                          <span>• {prod.wins} vitórias ({prod.total_participations} disputas)</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 block">
                          {formatCurrency(prod.total_profit)}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Margem média: {prod.avg_margin_pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Seção 3: Tabela de Histórico de Participações */}
        <Card className="border-border shadow-xs">
          <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold">
                Registro Completo de Participações ({records.length})
              </CardTitle>
              <CardDescription className="text-xs">
                Auditoria de lances enviados, resultados e margens reais conquistadas.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setModalOpen(true)}
              className="text-xs gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo Registro
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : records.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
                <FileText className="h-8 w-8 text-muted-foreground/40" />
                <div className="space-y-1 max-w-sm">
                  <p className="text-sm font-semibold text-foreground">Nenhum histórico registrado</p>
                  <p className="text-xs text-muted-foreground">
                    Ao finalizar um processo no Pipeline ou após a sessão do pregão, registre o resultado real para alimentar os relatórios.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => setModalOpen(true)}
                  className="text-xs gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Registrar Primeira Participação
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/40 text-muted-foreground border-y border-border uppercase text-[10px] font-semibold tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Data</th>
                      <th className="py-3 px-4">Órgão Licitante</th>
                      <th className="py-3 px-4">Produto</th>
                      <th className="py-3 px-4 text-center">Resultado</th>
                      <th className="py-3 px-4 text-right">Valor Vencedor</th>
                      <th className="py-3 px-4 text-right">Nosso Lance</th>
                      <th className="py-3 px-4 text-right">Lucro Real</th>
                      <th className="py-3 px-4 text-center">Concorrentes</th>
                      <th className="py-3 px-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {records.map((rec) => (
                      <tr key={rec.id} className="hover:bg-muted/20 transition-colors">
                        <td className="py-3 px-4 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                          {new Date(rec.recorded_at).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="py-3 px-4 font-medium text-foreground max-w-[200px] truncate">
                          {rec.agency_name || "Órgão Não Informado"}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground max-w-[150px] truncate">
                          {rec.products?.name || "Geral"}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {getResultBadge(rec.result)}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold text-foreground whitespace-nowrap">
                          {formatCurrency(rec.winning_value)}
                        </td>
                        <td className="py-3 px-4 text-right text-muted-foreground whitespace-nowrap">
                          {formatCurrency(rec.our_bid_value)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {rec.result === "won" ? formatCurrency(rec.actual_profit) : "—"}
                        </td>
                        <td className="py-3 px-4 text-center text-muted-foreground">
                          {rec.competitors_count ?? "—"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteRecord(rec.id)}
                            className="p-1 text-muted-foreground hover:text-destructive rounded transition-colors"
                            title="Excluir Registro"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal de Registro Manual de Participação */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-5 w-5 text-emerald-600" />
                Registrar Participação em Licitação
              </DialogTitle>
              <DialogDescription className="text-xs">
                Insira os dados do pregão disputado para atualizar a taxa de vitória e lucratividade média.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveParticipation} className="space-y-4 text-xs pt-2">
              {/* Órgão */}
              <div className="space-y-1.5">
                <Label className="text-xs">Órgão Licitante</Label>
                <Input
                  type="text"
                  placeholder="Ex: Prefeitura de São Paulo, Marinha..."
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  className="h-9 text-xs"
                  required
                />
              </div>

              {/* Produto Vinculado */}
              <div className="space-y-1.5">
                <Label className="text-xs">Produto Principal (Catálogo)</Label>
                <Select value={selectedProductId} onValueChange={(val) => setSelectedProductId(val)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione um produto cadastrado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum (Item Avulso / Geral)</SelectItem>
                    {productsList.map((prod) => (
                      <SelectItem key={prod.id} value={prod.id}>
                        {prod.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Desfecho */}
              <div className="space-y-1.5">
                <Label className="text-xs">Resultado da Disputa</Label>
                <Select value={result} onValueChange={(val: any) => setResult(val)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Selecione o resultado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="won">🏆 Vencida (Homologada / Adjudicada)</SelectItem>
                    <SelectItem value="lost">❌ Perdida na Disputa</SelectItem>
                    <SelectItem value="disqualified">⚠️ Inabilitada / Desclassificada</SelectItem>
                    <SelectItem value="canceled">🚫 Anulada / Revogada</SelectItem>
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
                    className="h-9 text-xs"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Nosso Lance (R$)</Label>
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

              {/* Lucro e Margem Reais */}
              {result === "won" && (
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
                      placeholder="Ex: 16.5%"
                      value={actualMarginPct}
                      onChange={(e) => setActualMarginPct(e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>
                </div>
              )}

              {/* Concorrentes */}
              <div className="space-y-1.5">
                <Label className="text-xs">Concorrentes no Pregão</Label>
                <Input
                  type="number"
                  placeholder="Ex: 4"
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
                  onClick={() => setModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={saving}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {saving ? "Salvando..." : "Salvar Registro"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
