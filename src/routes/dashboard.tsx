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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Sparkles,
  RefreshCw,
  TrendingUp,
  Clock,
  DollarSign,
  Star,
  Layers,
  AlertTriangle,
  ArrowRight,
  Package,
  Calendar,
  Building,
  Bell,
  CheckCircle2,
  Check,
  ExternalLink,
  MapPin,
  Flame,
} from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Radar de Licitações" },
      {
        name: "description",
        content: "Painel principal com KPIs, gráficos de oportunidades, alertas e top 10.",
      },
    ],
  }),
  component: DashboardPage,
});

interface DashboardMetrics {
  new_opportunities: number;
  closing_today: number;
  closing_next_days: number;
  total_value: number;
  favorites_count: number;
  in_pipeline_count: number;
  by_category: Array<{ category: string; count: number; total_value: number }>;
  by_agency: Array<{ agency_name: string; count: number; total_value: number }>;
  by_modality: Array<{ modality: string; count: number; total_value: number }>;
  by_state: Array<{ state: string; count: number; total_value: number }>;
  by_score_classification: Array<{ classification: string; count: number }>;
}

interface FavoriteItem {
  id: string;
  agency_name: string | null;
  object_description: string | null;
  estimated_value: number | null;
  closing_date: string | null;
  state: string | null;
  modality: string | null;
  score: number;
  classification: string;
}

interface NotificationItem {
  id: string;
  opportunity_id: string | null;
  type: string;
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
}

const SCORE_COLORS: Record<string, string> = {
  green: "#10b981",
  yellow: "#f59e0b",
  red: "#ef4444",
  unranked: "#6b7280",
};

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"];

function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadDashboardData = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Carregar métricas via RPC get_dashboard_metrics
      const { data: metricsData, error: metricsError } = await (supabase.rpc as any)(
        "get_dashboard_metrics",
        { period_days: 7 }
      );

      if (metricsError) {
        console.warn("Aviso ao carregar metrics RPC:", metricsError);
      } else if (metricsData) {
        setMetrics(metricsData as unknown as DashboardMetrics);
      }

      // 2. Carregar favoritas recentes
      const { data: favData, error: favError } = await supabase
        .from("pipeline_items")
        .select(`
          opportunity_id,
          opportunities (
            id,
            agency_name,
            object_description,
            estimated_value,
            closing_date,
            state,
            modality,
            opportunity_scores (
              score,
              classification
            )
          )
        `)
        .eq("owner_id", user.id)
        .eq("is_favorite", true)
        .eq("is_discarded", false)
        .limit(5);

      if (!favError && favData) {
        const formattedFavs: FavoriteItem[] = favData
          .filter((item: any) => item.opportunities)
          .map((item: any) => {
            const opp = item.opportunities;
            const sc = opp.opportunity_scores?.[0];
            return {
              id: opp.id,
              agency_name: opp.agency_name,
              object_description: opp.object_description,
              estimated_value: opp.estimated_value,
              closing_date: opp.closing_date,
              state: opp.state,
              modality: opp.modality,
              score: sc?.score ?? 0,
              classification: sc?.classification ?? "red",
            };
          });
        setFavorites(formattedFavs);
      }

      // 3. Carregar notificações recentes
      const { data: notifData, error: notifError } = await supabase
        .from("notifications")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(8);

      if (!notifError && notifData) {
        setNotifications(notifData as NotificationItem[]);
        setUnreadCount(notifData.filter((n: NotificationItem) => !n.is_read).length);
      }
    } catch (err: any) {
      console.error("Falha ao carregar dashboard:", err);
      setError("Não foi possível carregar os dados do painel. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [user]);

  // Ação de Sincronização Manual
  const handleSyncSources = async () => {
    setSyncing(true);
    try {
      const { data, error: syncErr } = await supabase.functions.invoke("sync-sources", {
        body: { trigger: "manual" },
      });

      if (syncErr) throw syncErr;

      toast.success(
        `Fontes sincronizadas! ${data?.opportunities_new ?? 0} novas oportunidades captadas.`
      );
      loadDashboardData();
    } catch (err: any) {
      console.error("Erro ao sincronizar:", err);
      toast.error(`Erro ao sincronizar fontes: ${err?.message || "Falha na requisição"}`);
    } finally {
      setSyncing(false);
    }
  };

  // Marcar notificação como lida
  const markAsRead = async (notifId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notifId ? { ...n, is_read: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notifId);
  };

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);

    if (user) {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("owner_id", user.id)
        .eq("is_read", false);
      toast.success("Todas as notificações foram marcadas como lidas.");
    }
  };

  // Formatação de Moeda
  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return "R$ 0,00";
    return Number(val).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Cabeçalho da Página */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <PageHeader
            title="Painel Principal"
            description="Visão geral de oportunidades captadas, métricas estratégicas e alertas do dia."
          />

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncSources}
              disabled={syncing}
              className="gap-2 shadow-xs border-border"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin text-primary" : ""}`} />
              {syncing ? "Sincronizando..." : "Sincronizar agora"}
            </Button>

            <Button
              size="sm"
              onClick={() => navigate({ to: "/melhores-do-dia" })}
              className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs font-semibold"
            >
              <Sparkles className="h-4 w-4 text-amber-300" />
              As 10 Melhores de Hoje
            </Button>
          </div>
        </div>

        {/* Banner de Erro Geral */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Erro ao carregar dados</AlertTitle>
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={loadDashboardData} className="ml-4">
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Seção 1: KPI Cards */}
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="p-4 space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-7 w-14" />
                <Skeleton className="h-3 w-24" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {/* Novas Oportunidades */}
            <Card className="border-border shadow-xs hover:border-primary/50 transition-colors">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Novas (7d)</span>
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {metrics?.new_opportunities ?? 0}
                </div>
                <p className="text-[11px] text-muted-foreground">captadas no radar</p>
              </CardContent>
            </Card>

            {/* Encerrando Hoje */}
            <Card className="border-border shadow-xs border-amber-500/30 bg-amber-500/5 hover:border-amber-500 transition-colors">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                  <span className="text-xs font-medium">Encerram Hoje</span>
                  <Flame className="h-4 w-4" />
                </div>
                <div className="text-2xl font-bold tracking-tight text-amber-700 dark:text-amber-300">
                  {metrics?.closing_today ?? 0}
                </div>
                <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80">prazo final urgente</p>
              </CardContent>
            </Card>

            {/* Encerrando em 7 dias */}
            <Card className="border-border shadow-xs hover:border-primary/50 transition-colors">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Próximos 7 dias</span>
                  <Clock className="h-4 w-4 text-blue-500" />
                </div>
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {metrics?.closing_next_days ?? 0}
                </div>
                <p className="text-[11px] text-muted-foreground">sessões agendadas</p>
              </CardContent>
            </Card>

            {/* Valor Total Estimado */}
            <Card className="border-border shadow-xs hover:border-primary/50 transition-colors">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Volume Total</span>
                  <DollarSign className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="text-lg font-bold tracking-tight text-foreground truncate">
                  {formatCurrency(metrics?.total_value)}
                </div>
                <p className="text-[11px] text-muted-foreground">oportunidades ativas</p>
              </CardContent>
            </Card>

            {/* Favoritas */}
            <Card className="border-border shadow-xs hover:border-primary/50 transition-colors">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Favoritas</span>
                  <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                </div>
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {metrics?.favorites_count ?? 0}
                </div>
                <p className="text-[11px] text-muted-foreground">marcadas para estudo</p>
              </CardContent>
            </Card>

            {/* No Pipeline */}
            <Card className="border-border shadow-xs hover:border-primary/50 transition-colors">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">No Pipeline</span>
                  <Layers className="h-4 w-4 text-purple-500" />
                </div>
                <div className="text-2xl font-bold tracking-tight text-foreground">
                  {metrics?.in_pipeline_count ?? 0}
                </div>
                <p className="text-[11px] text-muted-foreground">em tramitação ativa</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Seção 2: Banner de Destaque CTA Top 10 */}
        <Card className="border-primary/30 bg-gradient-to-r from-primary/10 via-emerald-500/10 to-transparent shadow-xs">
          <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-5 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge className="bg-emerald-600 text-white hover:bg-emerald-700">
                  Algoritmo de Priorização
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Atualizado em tempo real
                </span>
              </div>
              <h3 className="text-lg font-bold tracking-tight text-foreground">
                Quais são as 10 melhores oportunidades hoje para sua empresa?
              </h3>
              <p className="text-xs text-muted-foreground max-w-2xl">
                O Radar cruza seu catálogo de produtos, fornecedores cotados, capital disponível e região de atendimento para classificar as licitações com maior lucro e menor risco.
              </p>
            </div>

            <Button
              onClick={() => navigate({ to: "/melhores-do-dia" })}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shrink-0"
            >
              Ver as 10 Melhores
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        {/* Seção 3: Gráficos de Distribuição */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Gráfico 1: Oportunidades por Categoria */}
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                Oportunidades por Categoria
              </CardTitle>
              <CardDescription className="text-xs">
                Distribuição das licitações captadas nos segmentos do catálogo.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-72 pt-4">
              {loading ? (
                <Skeleton className="w-full h-full" />
              ) : !metrics?.by_category || metrics.by_category.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-xs space-y-2">
                  <Package className="h-8 w-8 text-muted-foreground/50" />
                  <span>Nenhum dado por categoria no momento.</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={metrics.by_category}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                  >
                    <XAxis type="number" stroke="#888888" fontSize={11} />
                    <YAxis
                      dataKey="category"
                      type="category"
                      stroke="#888888"
                      fontSize={11}
                      width={100}
                      tickFormatter={(val) => (val.length > 14 ? `${val.slice(0, 14)}…` : val)}
                    />
                    <Tooltip
                      formatter={(val: any) => [`${val} editais`, "Quantidade"]}
                      contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", color: "#fff", fontSize: "12px", borderRadius: "8px" }}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Gráfico 2: Distribuição por Modalidade e Score */}
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building className="h-4 w-4 text-emerald-500" />
                Distribuição por Modalidade
              </CardTitle>
              <CardDescription className="text-xs">
                Pregões Eletrônicos, Dispensas e Concorrências captadas.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-72 pt-4 flex items-center justify-center">
              {loading ? (
                <Skeleton className="w-full h-full" />
              ) : !metrics?.by_modality || metrics.by_modality.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-xs space-y-2">
                  <Building className="h-8 w-8 text-muted-foreground/50" />
                  <span>Nenhum dado por modalidade captado.</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={metrics.by_modality}
                      dataKey="count"
                      nameKey="modality"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={45}
                      paddingAngle={3}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {metrics.by_modality.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val: any) => [`${val} processos`, "Total"]}
                      contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", color: "#fff", fontSize: "12px", borderRadius: "8px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Seção 4: Favoritas & Central de Notificações */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Coluna 1 & 2: Oportunidades Favoritas Recentes */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                <h3 className="text-sm font-semibold text-foreground">
                  Oportunidades Favoritas ({favorites.length})
                </h3>
              </div>
              <Link
                to="/busca"
                className="text-xs text-primary hover:underline flex items-center gap-1 font-medium"
              >
                Ver todas na busca
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : favorites.length === 0 ? (
              <Card className="border-border/60 bg-muted/20">
                <CardContent className="flex flex-col items-center justify-center p-8 text-center space-y-3">
                  <Star className="h-8 w-8 text-muted-foreground/40" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Nenhuma oportunidade favoritada</p>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      Marque com estrela as oportunidades mais promissoras durante a busca ou no Top 10 para acessá-las com rapidez.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate({ to: "/busca" })}
                    className="gap-2 text-xs"
                  >
                    Explorar Busca de Editais
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2.5">
                {favorites.map((fav) => (
                  <Card
                    key={fav.id}
                    className="border-border shadow-xs hover:border-primary/40 transition-colors cursor-pointer"
                    onClick={() => navigate({ to: "/oportunidade/$id", params: { id: fav.id } })}
                  >
                    <CardContent className="p-4 flex items-center justify-between gap-4">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-primary truncate max-w-[200px] sm:max-w-xs">
                            {fav.agency_name || "Órgão Público"}
                          </span>
                          {fav.state && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {fav.state}
                            </Badge>
                          )}
                          {fav.modality && (
                            <span className="text-[11px] text-muted-foreground hidden sm:inline-block">
                              • {fav.modality}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-foreground line-clamp-1">
                          {fav.object_description || "Sem descrição disponível"}
                        </p>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-0.5">
                          <span className="font-semibold text-foreground">
                            {formatCurrency(fav.estimated_value)}
                          </span>
                          {fav.closing_date && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              Encerra em: {new Date(fav.closing_date).toLocaleDateString("pt-BR")}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-xs font-bold flex items-center gap-1 justify-end">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: SCORE_COLORS[fav.classification] || "#6b7280" }}
                            />
                            {fav.score} pts
                          </div>
                          <span className="text-[10px] uppercase text-muted-foreground">
                            {fav.classification === "green" ? "Recomendada" : fav.classification === "yellow" ? "Atenção" : "Baixo Score"}
                          </span>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Coluna 3: Central de Notificações */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Alertas do Sistema</h3>
                {unreadCount > 0 && (
                  <Badge className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0">
                    {unreadCount} novos
                  </Badge>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
                >
                  Marcar todos lidos
                </button>
              )}
            </div>

            <Card className="border-border shadow-xs">
              <CardContent className="p-3 divide-y divide-border">
                {loading ? (
                  <div className="space-y-3 p-2">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground space-y-1">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
                    <p className="font-medium text-foreground">Nenhum alerta pendente</p>
                    <p>O radar avisará sobre novos editais com alto score ou prazos se encerrando.</p>
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`p-3 space-y-1 transition-colors rounded-md ${
                        notif.is_read ? "opacity-60 hover:opacity-100" : "bg-primary/5 hover:bg-primary/10"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          {!notif.is_read && (
                            <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                          )}
                          <span className="line-clamp-1">{notif.title}</span>
                        </div>
                        {!notif.is_read && (
                          <button
                            type="button"
                            onClick={() => markAsRead(notif.id)}
                            className="text-muted-foreground hover:text-foreground p-0.5 rounded"
                            title="Marcar como lida"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      {notif.message && (
                        <p className="text-[11px] text-muted-foreground line-clamp-2">
                          {notif.message}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 pt-1">
                        <span>{new Date(notif.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                        {notif.opportunity_id && (
                          <Link
                            to="/oportunidade/$id"
                            params={{ id: notif.opportunity_id }}
                            className="text-primary hover:underline flex items-center gap-0.5"
                          >
                            Abrir
                            <ExternalLink className="h-2.5 w-2.5" />
                          </Link>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
