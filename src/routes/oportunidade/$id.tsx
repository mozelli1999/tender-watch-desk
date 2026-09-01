import React, { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/layout/app-layout";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  AlertCircle,
  ExternalLink,
  Building2,
  Hash,
  FileText,
  Calendar,
  Clock,
  DollarSign,
  Package,
  MapPin,
  CheckCircle,
  XCircle,
  Sparkles,
  TrendingUp,
  Loader2,
  ChevronLeft,
  Calculator,
  AlertTriangle,
  Download,
  RefreshCw,
  Building,
  Layers,
  ShieldCheck,
  FlaskConical,
  Star,
  Award,
  Truck,
} from "lucide-react";

export const Route = createFileRoute("/oportunidade/$id")({
  component: OportunidadePage,
});

interface Opportunity {
  id: string;
  owner_id: string;
  source_id: string;
  source_url: string;
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
}

interface OpportunityScore {
  score: number;
  classification: string;
  factors: Record<string, unknown>;
  reasons: string[];
  computed_at: string;
}

interface EditalAnalysis {
  status: string;
  pdf_storage_path: string | null;
  object_extracted: string | null;
  items_json: unknown;
  values_json: unknown;
  dates_json: unknown;
  delivery_info: string | null;
  payment_info: string | null;
  required_documents: string[] | null;
  habilitation_info: string | null;
  samples_info: string | null;
  warranties_info: string | null;
  certificates_info: string | null;
  penalties_info: string | null;
  risk_points: string[] | null;
  ai_model_used: string | null;
}

interface FinancialSummary {
  profit: number | null;
  required_capital: number | null;
  margin_pct: number | null;
}

interface CompatibleSupplier {
  id: string;
  name: string;
  unit_price: number;
  lead_time_days: number | null;
  freight_cost: number | null;
  payment_terms_days: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de formatação
// ─────────────────────────────────────────────────────────────────────────────
function fmtBRL(value: number | null | undefined) {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(dateStr: string | null | undefined) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function scoreColor(classification: string) {
  if (classification === "green") return "bg-emerald-500";
  if (classification === "yellow") return "bg-yellow-400";
  return "bg-red-500";
}

function scoreEmoji(classification: string) {
  if (classification === "green") return "🟢";
  if (classification === "yellow") return "🟡";
  return "🔴";
}

function RequirementBadge({ value, label }: { value: boolean | null; label: string }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {value ? (
        <CheckCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
      )}
      <span className={value ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground"}>
        {label}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente Principal
// ─────────────────────────────────────────────────────────────────────────────
function OportunidadePage() {
  const { id } = Route.useParams();
  const { user } = useAuth();

  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [score, setScore] = useState<OpportunityScore | null>(null);
  const [analysis, setAnalysis] = useState<EditalAnalysis | null>(null);
  const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null);
  const [compatibleSuppliers, setCompatibleSuppliers] = useState<CompatibleSupplier[]>([]);
  const [editalUrl, setEditalUrl] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reprocessing, setReprocessing] = useState(false);

  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    setNotFound(false);
    setError(null);

    try {
      // 1. Carregar a oportunidade principal
      const { data: opp, error: oppError } = await supabase
        .from("opportunities")
        .select("*")
        .eq("id", id)
        .eq("owner_id", user.id)
        .single();

      if (oppError || !opp) {
        setNotFound(true);
        return;
      }
      setOpportunity(opp as Opportunity);

      // 2. Score
      const { data: scoreData } = await supabase
        .from("opportunity_scores")
        .select("*")
        .eq("opportunity_id", id)
        .single();
      setScore(scoreData as OpportunityScore | null);

      // 3. Análise de edital
      const { data: analysisData } = await supabase
        .from("edital_analyses")
        .select("*")
        .eq("opportunity_id", id)
        .single();
      setAnalysis(analysisData as EditalAnalysis | null);

      // 4. Última simulação financeira (resumo)
      const { data: simData } = await supabase
        .from("financial_simulations")
        .select("profit, required_capital, margin_pct")
        .eq("opportunity_id", id)
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      setFinancialSummary(simData as FinancialSummary | null);

      // 5. Fornecedores compatíveis via opportunity_products → product_suppliers
      const { data: oppProds } = await supabase
        .from("opportunity_products")
        .select("product_id")
        .eq("opportunity_id", id);

      if (oppProds && oppProds.length > 0) {
        const productIds = oppProds.map((op: any) => op.product_id);
        const { data: psData } = await supabase
          .from("product_suppliers")
          .select(`
            id,
            unit_price,
            lead_time_days,
            freight_cost,
            payment_terms_days,
            supplier:suppliers(id, name)
          `)
          .in("product_id", productIds)
          .eq("owner_id", user.id)
          .order("unit_price", { ascending: true });

        if (psData) {
          setCompatibleSuppliers(
            psData.map((ps: any) => ({
              id: ps.supplier?.id ?? ps.id,
              name: ps.supplier?.name ?? "Fornecedor",
              unit_price: ps.unit_price,
              lead_time_days: ps.lead_time_days,
              freight_cost: ps.freight_cost,
              payment_terms_days: ps.payment_terms_days,
            }))
          );
        }
      }

      // 6. URL do edital no Storage
      if (analysisData?.pdf_storage_path) {
        const { data: urlData } = await supabase.storage
          .from("editais")
          .createSignedUrl(analysisData.pdf_storage_path, 3600);
        if (urlData?.signedUrl) {
          setEditalUrl(urlData.signedUrl);
        }
      }
    } catch (err: any) {
      console.error("Error loading opportunity:", err);
      setError(err.message || "Erro ao carregar os dados da oportunidade.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id, user]);

  const handleReprocessEdital = async () => {
    setReprocessing(true);
    try {
      const { error: fnError } = await supabase.functions.invoke("analyze-edital", {
        body: { opportunity_id: id },
      });
      if (fnError) throw fnError;
      toast.success("Reprocessamento do edital iniciado. Aguarde alguns instantes.");
      setTimeout(() => loadData(), 3000);
    } catch (err: any) {
      toast.error("Erro ao reprocessar: " + (err.message || "Tente novamente"));
    } finally {
      setReprocessing(false);
    }
  };

  // ── Estados de erro ──
  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <Skeleton className="h-12 w-3/4" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="h-48 w-full" />
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (notFound) {
    return (
      <AppLayout>
        <div className="flex min-h-[400px] flex-col items-center justify-center text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-bold">Oportunidade não encontrada</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Esta oportunidade não existe ou não pertence à sua conta.
          </p>
          <Button asChild variant="outline">
            <Link to="/busca">← Voltar à Busca</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar oportunidade</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={loadData}>Tentar novamente</Button>
          </AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  if (!opportunity) return null;

  const bestSupplier = compatibleSuppliers.length > 0 ? compatibleSuppliers[0] : null;
  const bestPrice = bestSupplier?.unit_price ?? null;

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* ── Cabeçalho ── */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground gap-1.5 text-xs">
              <Link to="/busca">
                <ChevronLeft className="h-3.5 w-3.5" />
                Voltar
              </Link>
            </Button>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {opportunity.modality && (
                <Badge variant="outline" className="text-xs font-normal">{opportunity.modality}</Badge>
              )}
              {opportunity.status_situation && (
                <Badge
                  variant={opportunity.status_situation.toLowerCase().includes("aberto") ? "default" : "secondary"}
                  className="text-xs"
                >
                  {opportunity.status_situation}
                </Badge>
              )}
              {opportunity.is_me_epp && (
                <Badge className="bg-blue-500 text-white text-xs">ME/EPP</Badge>
              )}
            </div>
            <h1 className="text-xl font-bold leading-snug">
              {opportunity.agency_name || "Órgão não identificado"}
            </h1>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <Hash className="h-3.5 w-3.5" />
              {opportunity.process_number || "Processo não informado"}
            </p>
          </div>
          <a
            href={opportunity.source_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="gap-2 shrink-0">
              <ExternalLink className="h-3.5 w-3.5" />
              Acessar na Fonte Original
            </Button>
          </a>
        </div>

        {/* ── Layout Principal: 2/3 + 1/3 ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* ── Coluna Esquerda (2/3) ── */}
          <div className="xl:col-span-2 space-y-5">

            {/* Bloco de Dados da Oportunidade */}
            <Card className="border-border shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Dados do Processo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <DataRow icon={<Package className="h-3.5 w-3.5" />} label="Objeto / Produto">
                    {opportunity.object_description || "—"}
                  </DataRow>
                  <DataRow icon={<Layers className="h-3.5 w-3.5" />} label="Categoria / CATMAT">
                    <span>
                      {opportunity.category || "—"}
                      {opportunity.catmat_catser_code && (
                        <span className="ml-2 font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                          #{opportunity.catmat_catser_code}
                        </span>
                      )}
                    </span>
                  </DataRow>
                  <DataRow icon={<Hash className="h-3.5 w-3.5" />} label="Quantidade">
                    {opportunity.quantity != null
                      ? opportunity.quantity.toLocaleString("pt-BR")
                      : "—"}
                  </DataRow>
                  <DataRow icon={<DollarSign className="h-3.5 w-3.5" />} label="Valor Estimado">
                    <span className="font-bold text-foreground">{fmtBRL(opportunity.estimated_value)}</span>
                  </DataRow>
                  <DataRow icon={<Calendar className="h-3.5 w-3.5" />} label="Data da Sessão">
                    {fmtDate(opportunity.session_date)}
                  </DataRow>
                  <DataRow icon={<Calendar className="h-3.5 w-3.5" />} label="Encerramento">
                    {fmtDate(opportunity.closing_date)}
                  </DataRow>
                  <DataRow icon={<Clock className="h-3.5 w-3.5" />} label="Prazo de Entrega">
                    {opportunity.delivery_deadline_days != null
                      ? `${opportunity.delivery_deadline_days} dias`
                      : "—"}
                  </DataRow>
                  <DataRow icon={<Clock className="h-3.5 w-3.5" />} label="Prazo de Pagamento">
                    {opportunity.payment_deadline_days != null
                      ? `${opportunity.payment_deadline_days} dias após entrega`
                      : "—"}
                  </DataRow>
                  <DataRow icon={<MapPin className="h-3.5 w-3.5" />} label="Localização">
                    {[opportunity.city, opportunity.state].filter(Boolean).join(" – ") || "—"}
                  </DataRow>
                </div>

                {/* Exigências */}
                <Separator className="my-3" />
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Exigências do Edital
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <RequirementBadge value={opportunity.is_me_epp} label="Exclusivo ME/EPP" />
                  <RequirementBadge value={opportunity.requires_sample} label="Exige Amostra" />
                  <RequirementBadge value={opportunity.requires_certificate} label="Exige Atestado" />
                  <RequirementBadge value={opportunity.requires_warranty} label="Exige Garantia" />
                  <RequirementBadge value={opportunity.requires_min_capital} label="Capital Social Mínimo" />
                </div>
              </CardContent>
            </Card>

            {/* Bloco de Análise de Edital por IA */}
            <Card className="border-border shadow-xs">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Análise de Edital por IA
                    {analysis?.ai_model_used && (
                      <span className="text-[10px] font-normal text-muted-foreground">
                        via {analysis.ai_model_used}
                      </span>
                    )}
                  </CardTitle>
                  {analysis?.status === "error" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-7"
                      onClick={handleReprocessEdital}
                      disabled={reprocessing}
                    >
                      {reprocessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Reprocessar
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {!analysis || analysis.status === "pending" || analysis.status === "processing" ? (
                  <div className="flex flex-col items-center py-8 text-center text-muted-foreground gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-sm">Análise de edital em processamento…</p>
                    <p className="text-xs">A análise pode levar alguns minutos. Atualize a página em breve.</p>
                    <Button variant="outline" size="sm" onClick={handleReprocessEdital} disabled={reprocessing} className="mt-2 gap-1.5 text-xs h-7">
                      <RefreshCw className="h-3 w-3" />
                      Reprocessar Manualmente
                    </Button>
                  </div>
                ) : analysis.status === "error" ? (
                  <Alert variant="destructive" className="text-xs">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Falha na análise do edital</AlertTitle>
                    <AlertDescription>
                      A IA não conseguiu processar o PDF. Verifique se o edital está acessível e tente reprocessar.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-3 text-sm">
                    {analysis.object_extracted && (
                      <AnalysisBlock icon={<FileText className="h-3.5 w-3.5" />} label="Objeto Extraído">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {analysis.object_extracted}
                        </p>
                      </AnalysisBlock>
                    )}

                    {analysis.delivery_info && (
                      <AnalysisBlock icon={<Truck className="h-3.5 w-3.5" />} label="Local e Prazo de Entrega">
                        <p className="text-xs text-muted-foreground">{analysis.delivery_info}</p>
                      </AnalysisBlock>
                    )}

                    {analysis.payment_info && (
                      <AnalysisBlock icon={<DollarSign className="h-3.5 w-3.5" />} label="Condições de Pagamento">
                        <p className="text-xs text-muted-foreground">{analysis.payment_info}</p>
                      </AnalysisBlock>
                    )}

                    {analysis.habilitation_info && (
                      <AnalysisBlock icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Habilitação Jurídica / Regularidade Fiscal">
                        <p className="text-xs text-muted-foreground">{analysis.habilitation_info}</p>
                      </AnalysisBlock>
                    )}

                    {analysis.required_documents && analysis.required_documents.length > 0 && (
                      <AnalysisBlock icon={<FileText className="h-3.5 w-3.5" />} label="Documentos Exigidos">
                        <ul className="space-y-0.5">
                          {analysis.required_documents.map((doc, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                              <CheckCircle className="h-3 w-3 text-muted-foreground/50 mt-0.5 shrink-0" />
                              {doc}
                            </li>
                          ))}
                        </ul>
                      </AnalysisBlock>
                    )}

                    {analysis.samples_info && (
                      <AnalysisBlock icon={<FlaskConical className="h-3.5 w-3.5" />} label="Amostras">
                        <p className="text-xs text-muted-foreground">{analysis.samples_info}</p>
                      </AnalysisBlock>
                    )}

                    {analysis.warranties_info && (
                      <AnalysisBlock icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Garantias">
                        <p className="text-xs text-muted-foreground">{analysis.warranties_info}</p>
                      </AnalysisBlock>
                    )}

                    {analysis.certificates_info && (
                      <AnalysisBlock icon={<Award className="h-3.5 w-3.5" />} label="Atestados de Capacidade Técnica">
                        <p className="text-xs text-muted-foreground">{analysis.certificates_info}</p>
                      </AnalysisBlock>
                    )}

                    {analysis.penalties_info && (
                      <AnalysisBlock icon={<AlertTriangle className="h-3.5 w-3.5" />} label="Penalidades">
                        <p className="text-xs text-muted-foreground">{analysis.penalties_info}</p>
                      </AnalysisBlock>
                    )}

                    {analysis.risk_points && analysis.risk_points.length > 0 && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                        <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Pontos de Atenção / Riscos
                        </p>
                        <ul className="space-y-1">
                          {analysis.risk_points.map((risk, i) => (
                            <li key={i} className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                              <span className="shrink-0 mt-0.5">⚠️</span>
                              {risk}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Edital e Anexos */}
            {(analysis?.pdf_storage_path || opportunity.source_url) && (
              <Card className="border-border shadow-xs">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Download className="h-4 w-4 text-primary" />
                    Edital e Anexos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-2">
                    {editalUrl && (
                      <a
                        href={editalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                      >
                        <FileText className="h-4 w-4" />
                        Baixar Edital (PDF armazenado)
                      </a>
                    )}
                    <a
                      href={opportunity.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Acessar processo na fonte original
                    </a>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ── Coluna Direita (1/3) ── */}
          <div className="space-y-4">
            {/* Score */}
            <Card className="border-border shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Star className="h-4 w-4 text-primary" />
                  Score de Compatibilidade
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!score ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    Score ainda não calculado para esta oportunidade.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {/* Nota e Classificação */}
                    <div className="flex items-center gap-3">
                      <div className={`flex h-14 w-14 items-center justify-center rounded-2xl text-white font-bold text-xl ${scoreColor(score.classification)}`}>
                        {score.score}
                      </div>
                      <div>
                        <p className="text-2xl">{scoreEmoji(score.classification)}</p>
                        <p className="text-xs font-semibold capitalize text-muted-foreground">
                          {score.classification === "green" ? "Alta prioridade" :
                            score.classification === "yellow" ? "Avaliar" : "Baixa prioridade"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Calculado em {fmtDate(score.computed_at)}
                        </p>
                      </div>
                    </div>

                    {/* Motivos */}
                    {score.reasons && score.reasons.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Motivos do Score
                        </p>
                        <ul className="space-y-0.5">
                          {score.reasons.map((reason, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                              <span className="text-primary shrink-0 mt-0.5">•</span>
                              {reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Resumo Financeiro */}
            <Card className="border-border shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Financeiro Estimado
                </CardTitle>
              </CardHeader>
              <CardContent>
                {financialSummary ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Lucro Estimado</span>
                      <span className={`font-bold ${(financialSummary.profit ?? 0) > 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {fmtBRL(financialSummary.profit)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Margem</span>
                      <span className="font-semibold">
                        {financialSummary.margin_pct != null
                          ? `${financialSummary.margin_pct.toFixed(1)}%`
                          : "—"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Capital Necessário</span>
                      <span className="font-semibold text-amber-600">
                        {fmtBRL(financialSummary.required_capital)}
                      </span>
                    </div>
                    <Separator />
                    <Button asChild variant="default" size="sm" className="w-full gap-2 text-xs h-8">
                      <Link to="/simulador/$opportunityId" params={{ opportunityId: id }}>
                        <Calculator className="h-3.5 w-3.5" />
                        Abrir Simulador Completo
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-4 space-y-2">
                    <p className="text-xs text-muted-foreground">Nenhuma simulação salva ainda.</p>
                    <Button asChild variant="default" size="sm" className="w-full gap-2 text-xs h-8">
                      <Link to="/simulador/$opportunityId" params={{ opportunityId: id }}>
                        <Calculator className="h-3.5 w-3.5" />
                        Simular Agora
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Fornecedores Compatíveis */}
            <Card className="border-border shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Fornecedores Compatíveis
                </CardTitle>
              </CardHeader>
              <CardContent>
                {compatibleSuppliers.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-xs text-muted-foreground mb-2">
                      Nenhum fornecedor vinculado aos produtos compatíveis desta oportunidade.
                    </p>
                    <Button asChild variant="outline" size="sm" className="text-xs h-7 gap-1.5">
                      <Link to="/fornecedores">
                        <Building2 className="h-3 w-3" />
                        Cadastrar Fornecedores
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {compatibleSuppliers.slice(0, 4).map((supplier, i) => (
                      <div
                        key={supplier.id}
                        className={`flex items-start justify-between rounded-lg p-2.5 text-xs border ${i === 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-muted/20"}`}
                      >
                        <div>
                          <p className="font-semibold text-foreground flex items-center gap-1">
                            {i === 0 && <Award className="h-3 w-3 text-emerald-600" />}
                            {supplier.name}
                          </p>
                          <div className="text-muted-foreground mt-0.5 space-x-3">
                            {supplier.lead_time_days && (
                              <span>⏱ {supplier.lead_time_days}d</span>
                            )}
                            {supplier.freight_cost != null && (
                              <span>🚚 {fmtBRL(supplier.freight_cost)}</span>
                            )}
                          </div>
                        </div>
                        <span className={`font-bold shrink-0 ml-2 ${i === 0 ? "text-emerald-600" : "text-foreground"}`}>
                          {fmtBRL(supplier.unit_price)}
                        </span>
                      </div>
                    ))}
                    {compatibleSuppliers.length > 4 && (
                      <p className="text-[10px] text-muted-foreground text-center">
                        +{compatibleSuppliers.length - 4} outros
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componentes auxiliares de layout
// ─────────────────────────────────────────────────────────────────────────────
function DataRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
        {icon}
        {label}
      </p>
      <div className="text-sm text-foreground leading-snug">{children}</div>
    </div>
  );
}

function AnalysisBlock({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1.5">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      {children}
    </div>
  );
}
