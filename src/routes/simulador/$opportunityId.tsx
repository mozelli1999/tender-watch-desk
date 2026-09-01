import React, { useState, useEffect, useCallback } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/layout/app-layout";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Calculator,
  ChevronLeft,
  AlertCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Save,
  DollarSign,
  TrendingUp,
  Truck,
  Percent,
  Building2,
  Clock,
  ArrowRight,
  CheckCircle2,
  Info,
  Package,
  Hash,
} from "lucide-react";

export const Route = createFileRoute("/simulador/$opportunityId")({
  component: SimuladorPage,
});

interface OpportunityInfo {
  id: string;
  agency_name: string | null;
  object_description: string | null;
  estimated_value: number | null;
  quantity: number | null;
  delivery_deadline_days: number | null;
  payment_deadline_days: number | null;
  modality: string | null;
}

interface Supplier {
  id: string;
  name: string;
  unit_price: number;
  lead_time_days: number | null;
  freight_cost: number | null;
  payment_terms_days: number | null;
}

interface SimulationResult {
  revenue: number;
  product_cost: number;
  freight_cost: number;
  tax_cost: number;
  other_costs: number;
  profit: number;
  margin_pct: number;
  required_capital: number;
  max_recommended_bid: number;
  cash_flow_impact: {
    supplier_payment_day: number;
    agency_receipt_day: number;
    gap_days: number;
    capital_locked: number;
  };
  selected_supplier_id: string | null;
  selected_supplier_name: string | null;
  simulation_id: string | null;
}

function fmtBRL(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ResultLine({
  label,
  value,
  highlight,
  negative,
  large,
  info,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  negative?: boolean;
  large?: boolean;
  info?: string;
}) {
  return (
    <div
      className={`flex items-center justify-between py-2 px-3 rounded-lg ${
        highlight
          ? "bg-emerald-500/10 border border-emerald-500/30"
          : "border border-transparent"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`${large ? "text-sm font-semibold" : "text-xs"} text-muted-foreground`}>
          {label}
        </span>
        {info && (
          <span title={info} className="cursor-help">
            <Info className="h-3 w-3 text-muted-foreground/50" />
          </span>
        )}
      </div>
      <span
        className={`font-bold ${large ? "text-base" : "text-sm"} ${
          highlight
            ? "text-emerald-600 dark:text-emerald-400"
            : negative
            ? "text-red-500"
            : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function SimuladorPage() {
  const { opportunityId } = Route.useParams();
  const { user } = useAuth();

  // Dados da oportunidade
  const [opportunity, setOpportunity] = useState<OpportunityInfo | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [defaultTaxPct, setDefaultTaxPct] = useState<number>(0);

  // Estados de carregamento
  const [initialLoading, setInitialLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Parâmetros ajustáveis pelo operador
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("auto");
  const [freightOverride, setFreightOverride] = useState<string>("");
  const [taxPctOverride, setTaxPctOverride] = useState<string>("");
  const [otherCosts, setOtherCosts] = useState<string>("");
  const [bidValue, setBidValue] = useState<string>("");

  // Resultado da simulação
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────
  // Carregar dados iniciais
  // ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      if (!user) return;
      setInitialLoading(true);

      try {
        // Buscar oportunidade (valida ownership via RLS)
        const { data: opp, error: oppError } = await supabase
          .from("opportunities")
          .select("id, agency_name, object_description, estimated_value, quantity, delivery_deadline_days, payment_deadline_days, modality")
          .eq("id", opportunityId)
          .eq("owner_id", user.id)
          .single();

        if (oppError || !opp) {
          setNotFound(true);
          return;
        }
        setOpportunity(opp as OpportunityInfo);

        // Inicializar bid_value com o valor estimado
        if (opp.estimated_value) {
          setBidValue(String(opp.estimated_value));
        }

        // Buscar configurações (default_tax_pct)
        const { data: settings } = await supabase
          .from("company_settings")
          .select("default_tax_pct")
          .eq("owner_id", user.id)
          .single();

        if (settings?.default_tax_pct) {
          setDefaultTaxPct(settings.default_tax_pct);
        }

        // Buscar fornecedores compatíveis via opportunity_products
        const { data: oppProds } = await supabase
          .from("opportunity_products")
          .select("product_id")
          .eq("opportunity_id", opportunityId);

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
            setSuppliers(
              psData.map((ps: any) => ({
                id: ps.supplier?.id ?? "",
                name: ps.supplier?.name ?? "Fornecedor",
                unit_price: ps.unit_price,
                lead_time_days: ps.lead_time_days,
                freight_cost: ps.freight_cost,
                payment_terms_days: ps.payment_terms_days,
              }))
            );
          }
        }
      } catch (err: any) {
        setLoadError(err.message || "Erro ao carregar os dados.");
      } finally {
        setInitialLoading(false);
      }
    };

    init();
  }, [opportunityId, user]);

  // ─────────────────────────────────────────────────────────────────────
  // Calcular via Edge Function
  // ─────────────────────────────────────────────────────────────────────
  const handleCalculate = useCallback(
    async (shouldSave = false) => {
      if (!user || !opportunity) return;

      shouldSave ? setSaving(true) : setCalculating(true);
      setCalcError(null);

      const overrides: Record<string, number> = {};
      if (freightOverride !== "") overrides.freight_cost = Number(freightOverride);
      if (taxPctOverride !== "") overrides.tax_pct = Number(taxPctOverride);
      if (otherCosts !== "") overrides.other_costs = Number(otherCosts);
      if (bidValue !== "") overrides.bid_value = Number(bidValue);

      try {
        const { data, error: fnError } = await supabase.functions.invoke(
          "run-financial-simulation",
          {
            body: {
              opportunity_id: opportunityId,
              selected_supplier_id: selectedSupplierId !== "auto" ? selectedSupplierId : undefined,
              overrides,
              save: shouldSave,
            },
          }
        );

        if (fnError) throw new Error(fnError.message);

        if (data.error) throw new Error(data.error);

        setResult(data as SimulationResult);

        if (shouldSave && data.simulation_id) {
          setLastSavedId(data.simulation_id);
          toast.success("Simulação salva com sucesso!");
        }
      } catch (err: any) {
        console.error("Simulation error:", err);
        setCalcError(err.message || "Não foi possível calcular a simulação.");
        if (shouldSave) toast.error("Erro ao salvar a simulação.");
      } finally {
        shouldSave ? setSaving(false) : setCalculating(false);
      }
    },
    [
      user,
      opportunity,
      opportunityId,
      selectedSupplierId,
      freightOverride,
      taxPctOverride,
      otherCosts,
      bidValue,
    ]
  );

  // Auto-calcular ao montar (com valores padrão)
  useEffect(() => {
    if (!initialLoading && opportunity) {
      handleCalculate(false);
    }
  }, [initialLoading]);

  // ─────────────────────────────────────────────────────────────────────
  // Estados especiais
  // ─────────────────────────────────────────────────────────────────────
  if (initialLoading) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <Skeleton className="h-10 w-2/3" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (notFound) {
    return (
      <AppLayout>
        <div className="flex min-h-[400px] flex-col items-center justify-center text-center gap-4">
          <AlertTriangle className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-xl font-bold">Oportunidade não encontrada</h2>
          <p className="text-sm text-muted-foreground">Esta oportunidade não existe ou não pertence à sua conta.</p>
          <Button asChild variant="outline">
            <Link to="/busca">← Voltar à Busca</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }

  if (loadError) {
    return (
      <AppLayout>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Erro ao carregar</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  const selectedSupplier =
    selectedSupplierId !== "auto"
      ? suppliers.find((s) => s.id === selectedSupplierId)
      : suppliers[0];

  return (
    <AppLayout>
      <div className="space-y-5 max-w-6xl">
        {/* Cabeçalho */}
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2 text-muted-foreground gap-1.5 text-xs">
            <Link to="/oportunidade/$id" params={{ id: opportunityId }}>
              <ChevronLeft className="h-3.5 w-3.5" />
              Voltar à Oportunidade
            </Link>
          </Button>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <Calculator className="h-6 w-6 text-primary" />
                Simulador Financeiro
              </h1>
              {opportunity && (
                <div className="mt-1 space-y-0.5">
                  <p className="text-sm text-muted-foreground font-medium">
                    {opportunity.agency_name || "Órgão não identificado"}
                    {opportunity.modality && (
                      <Badge variant="outline" className="ml-2 text-xs font-normal">{opportunity.modality}</Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground line-clamp-1 max-w-xl">
                    {opportunity.object_description}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      Valor estimado: <strong className="text-foreground ml-1">{fmtBRL(opportunity.estimated_value)}</strong>
                    </span>
                    <span className="flex items-center gap-1">
                      <Package className="h-3 w-3" />
                      Qtd: <strong className="text-foreground ml-1">
                        {opportunity.quantity?.toLocaleString("pt-BR") ?? "—"}
                      </strong>
                    </span>
                  </div>
                </div>
              )}
            </div>

            {lastSavedId && (
              <Badge className="bg-emerald-500 text-white gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Simulação salva
              </Badge>
            )}
          </div>
        </div>

        {/* Aviso: sem fornecedores */}
        {suppliers.length === 0 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle className="text-sm">Nenhum fornecedor vinculado</AlertTitle>
            <AlertDescription className="text-xs flex items-center justify-between">
              <span>Cadastre fornecedores para simular custos reais de compra nesta oportunidade.</span>
              <Button asChild variant="outline" size="sm" className="h-7 text-xs gap-1.5 shrink-0 ml-4">
                <Link to="/fornecedores">
                  <Building2 className="h-3 w-3" />
                  Ir para Fornecedores
                </Link>
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* ── PAINEL ESQUERDO: Parâmetros Ajustáveis ── */}
          <Card className="border-border shadow-xs h-fit">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">
                Parâmetros da Simulação
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Ajuste os valores e clique em <strong>Recalcular</strong>.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Valor do Lance */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                  Valor do Lance / Receita (R$)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={String(opportunity?.estimated_value ?? "0")}
                  value={bidValue}
                  onChange={(e) => setBidValue(e.target.value)}
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Padrão: valor estimado do edital ({fmtBRL(opportunity?.estimated_value)}).
                </p>
              </div>

              {/* Fornecedor */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Fornecedor Selecionado
                </Label>
                <Select value={selectedSupplierId} onValueChange={setSelectedSupplierId}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Selecionar fornecedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      🏆 Mais vantajoso (automático)
                    </SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} — {fmtBRL(s.unit_price)} / un.
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedSupplier && (
                  <div className="rounded-lg bg-muted/40 border border-border p-2.5 text-[11px] text-muted-foreground space-y-0.5 mt-1">
                    <p>💰 Preço unitário: <strong className="text-foreground">{fmtBRL(selectedSupplier.unit_price)}</strong></p>
                    {selectedSupplier.lead_time_days && <p>⏱ Prazo de entrega: <strong className="text-foreground">{selectedSupplier.lead_time_days} dias</strong></p>}
                    {selectedSupplier.freight_cost != null && <p>🚚 Frete: <strong className="text-foreground">{fmtBRL(selectedSupplier.freight_cost)}</strong>/un.</p>}
                    {selectedSupplier.payment_terms_days && <p>📆 Pagamento ao fornecedor: <strong className="text-foreground">{selectedSupplier.payment_terms_days} dias</strong></p>}
                  </div>
                )}
              </div>

              {/* Custo de Frete */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                  Frete por Unidade (R$) — Override
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={
                    selectedSupplier?.freight_cost != null
                      ? String(selectedSupplier.freight_cost)
                      : "0.00 (padrão do fornecedor)"
                  }
                  value={freightOverride}
                  onChange={(e) => setFreightOverride(e.target.value)}
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Deixe em branco para usar o frete do fornecedor.
                </p>
              </div>

              {/* Impostos */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-muted-foreground" />
                  Impostos (%) — Override
                </Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder={`${defaultTaxPct} (padrão configurado)`}
                  value={taxPctOverride}
                  onChange={(e) => setTaxPctOverride(e.target.value)}
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Deixe em branco para usar {defaultTaxPct}% (Configurações da empresa).
                </p>
              </div>

              {/* Outros Custos */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Calculator className="h-3.5 w-3.5 text-muted-foreground" />
                  Outros Custos (R$)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={otherCosts}
                  onChange={(e) => setOtherCosts(e.target.value)}
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Custos adicionais: embalagem, mão de obra, logística extra, etc.
                </p>
              </div>

              <Separator />

              {/* Botões */}
              <div className="flex gap-2">
                <Button
                  className="flex-1 gap-2 text-sm"
                  onClick={() => handleCalculate(false)}
                  disabled={calculating || saving}
                >
                  {calculating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Recalcular
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2 text-sm"
                  onClick={() => handleCalculate(true)}
                  disabled={calculating || saving || !result}
                  title={!result ? "Calcule a simulação primeiro" : "Salvar em financial_simulations"}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salvar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ── PAINEL DIREITO: Resultados ── */}
          <div className="space-y-4">
            {calcError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Não foi possível calcular</AlertTitle>
                <AlertDescription className="text-xs">{calcError}</AlertDescription>
              </Alert>
            )}

            {/* Resultados Financeiros */}
            <Card className="border-border shadow-xs">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Resultado da Simulação
                  {(calculating || saving) && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!result && !calculating && (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    Configure os parâmetros e clique em <strong>Recalcular</strong>.
                  </p>
                )}

                {(calculating || saving) && !result && (
                  <div className="space-y-2 py-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                )}

                {result && (
                  <div className="space-y-1">
                    <ResultLine
                      label="Receita (Valor do Lance)"
                      value={fmtBRL(result.revenue)}
                    />
                    <ResultLine
                      label="(−) Custo dos Produtos"
                      value={`− ${fmtBRL(result.product_cost)}`}
                      negative
                    />
                    <ResultLine
                      label="(−) Frete Total"
                      value={`− ${fmtBRL(result.freight_cost)}`}
                      negative
                    />
                    <ResultLine
                      label={`(−) Impostos (${result.margin_pct > 0 ? (Number(taxPctOverride) || defaultTaxPct) : "—"}%)`}
                      value={`− ${fmtBRL(result.tax_cost)}`}
                      negative
                    />
                    {result.other_costs > 0 && (
                      <ResultLine
                        label="(−) Outros Custos"
                        value={`− ${fmtBRL(result.other_costs)}`}
                        negative
                      />
                    )}

                    <Separator className="my-2" />

                    <ResultLine
                      label="Lucro Estimado"
                      value={fmtBRL(result.profit)}
                      highlight={result.profit > 0}
                      negative={result.profit < 0}
                      large
                    />
                    <ResultLine
                      label="Margem (%)"
                      value={`${result.margin_pct.toFixed(2)}%`}
                      highlight={result.margin_pct > 0}
                      large
                    />

                    <Separator className="my-2" />

                    <ResultLine
                      label="Capital Necessário"
                      value={fmtBRL(result.required_capital)}
                      info="Valor necessário para desembolso antes do recebimento"
                    />
                    <ResultLine
                      label="Lance Máximo Recomendado"
                      value={fmtBRL(result.max_recommended_bid)}
                      highlight
                      info="Preço máximo respeitando a margem mínima configurada"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Bloco de Fluxo de Caixa */}
            {result?.cash_flow_impact && (
              <Card className="border-border shadow-xs">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    Impacto no Fluxo de Caixa
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Linha do tempo */}
                  <div className="relative flex items-center gap-0 py-4">
                    {/* Dia 0: Desembolso */}
                    <div className="flex flex-col items-center text-center">
                      <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900/30 border-2 border-red-400 flex items-center justify-center">
                        <span className="text-[9px] font-bold text-red-600">D0</span>
                      </div>
                      <p className="text-[9px] text-muted-foreground mt-1 max-w-[60px]">Início Entrega</p>
                    </div>

                    {/* Seta + Pagamento ao Fornecedor */}
                    <div className="flex-1 relative">
                      <div className="h-0.5 bg-gradient-to-r from-red-400 to-amber-400 w-full" />
                      <div
                        className="absolute top-0"
                        style={{
                          left: `${Math.min(
                            (result.cash_flow_impact.supplier_payment_day /
                              Math.max(result.cash_flow_impact.agency_receipt_day, 1)) *
                              90,
                            90
                          )}%`,
                        }}
                      >
                        <div className="mt-1 flex flex-col items-center">
                          <div className="h-4 w-0.5 bg-amber-500" />
                          <div className="text-[9px] text-amber-700 dark:text-amber-400 font-semibold whitespace-nowrap">
                            Paga fornec.
                          </div>
                          <div className="text-[9px] text-muted-foreground">
                            D+{result.cash_flow_impact.supplier_payment_day}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Recebimento do Órgão */}
                    <div className="flex flex-col items-center text-center">
                      <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 border-2 border-emerald-500 flex items-center justify-center">
                        <span className="text-[9px] font-bold text-emerald-600">
                          D+{result.cash_flow_impact.agency_receipt_day}
                        </span>
                      </div>
                      <p className="text-[9px] text-muted-foreground mt-1 max-w-[60px]">Recebe do Órgão</p>
                    </div>
                  </div>

                  {/* Cards de Resumo */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg border border-border bg-muted/20 p-2.5 text-center">
                      <p className="text-[10px] text-muted-foreground">Paga Fornecedor</p>
                      <p className="text-sm font-bold text-amber-600">
                        D+{result.cash_flow_impact.supplier_payment_day}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/20 p-2.5 text-center">
                      <p className="text-[10px] text-muted-foreground">Recebe Órgão</p>
                      <p className="text-sm font-bold text-emerald-600">
                        D+{result.cash_flow_impact.agency_receipt_day}
                      </p>
                    </div>
                    <div
                      className={`rounded-lg border p-2.5 text-center ${
                        result.cash_flow_impact.gap_days > 0
                          ? "border-red-500/30 bg-red-500/5"
                          : "border-emerald-500/30 bg-emerald-500/5"
                      }`}
                    >
                      <p className="text-[10px] text-muted-foreground">Gap</p>
                      <p
                        className={`text-sm font-bold ${
                          result.cash_flow_impact.gap_days > 0 ? "text-red-500" : "text-emerald-500"
                        }`}
                      >
                        {result.cash_flow_impact.gap_days > 0
                          ? `+${result.cash_flow_impact.gap_days}d`
                          : `${result.cash_flow_impact.gap_days}d`}
                      </p>
                    </div>
                  </div>

                  {result.cash_flow_impact.gap_days > 0 && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <p>
                        Capital de <strong>{fmtBRL(result.cash_flow_impact.capital_locked)}</strong> ficará
                        comprometido por <strong>{result.cash_flow_impact.gap_days} dias</strong> (você paga o
                        fornecedor antes de receber do órgão).
                      </p>
                    </div>
                  )}

                  {result.cash_flow_impact.gap_days <= 0 && (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                      <p>
                        Fluxo de caixa favorável: o órgão paga antes do vencimento do fornecedor
                        ({Math.abs(result.cash_flow_impact.gap_days)} dias de folga).
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Fornecedor selecionado na simulação */}
            {result?.selected_supplier_name && (
              <p className="text-xs text-muted-foreground text-center">
                Simulação calculada com o fornecedor <strong>{result.selected_supplier_name}</strong>.
              </p>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
