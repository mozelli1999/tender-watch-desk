import React, { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/layout/app-layout";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Settings,
  DollarSign,
  Percent,
  MapPin,
  Sliders,
  Database,
  Save,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Globe,
  ShieldCheck,
  Building,
  Sparkles,
  RefreshCw,
  Clock,
  CheckCircle,
} from "lucide-react";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações da Empresa — Radar de Licitações" },
      {
        name: "description",
        content: "Parâmetros operacionais, capital, margens e cortes de score.",
      },
    ],
  }),
  component: ConfiguracoesPage,
});

const BRAZILIAN_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
  "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
  "RS", "RO", "RR", "SC", "SP", "SE", "TO"
];

const REGIONS: Record<string, string[]> = {
  "Sudeste": ["SP", "RJ", "MG", "ES"],
  "Sul": ["PR", "SC", "RS"],
  "Centro-Oeste": ["DF", "GO", "MT", "MS"],
  "Nordeste": ["BA", "PE", "CE", "MA", "PB", "RN", "AL", "SE", "PI"],
  "Norte": ["AM", "PA", "AC", "RO", "RR", "AP", "TO"],
};

interface SourceItem {
  id: string;
  slug: string;
  name: string;
  base_url: string | null;
  integration_type: string;
  is_active: boolean;
  last_synced_at: string | null;
}

const DEFAULT_SOURCES: SourceItem[] = [
  {
    id: "pncp-default",
    slug: "pncp",
    name: "PNCP (Portal Nacional de Contratações Públicas)",
    base_url: "https://pncp.gov.br",
    integration_type: "api",
    is_active: true,
    last_synced_at: null,
  },
  {
    id: "comprasnet-default",
    slug: "comprasnet",
    name: "ComprasNet / Compras.gov.br",
    base_url: "https://compras.dados.gov.br",
    integration_type: "api",
    is_active: true,
    last_synced_at: null,
  },
  {
    id: "licitacoes-e-default",
    slug: "licitacoes-e",
    name: "Licitações-e (Banco do Brasil)",
    base_url: "https://www.licitacoes-e.com.br",
    integration_type: "feed",
    is_active: false,
    last_synced_at: null,
  },
  {
    id: "bbmnet-default",
    slug: "bbmnet",
    name: "BBMNet Licitações",
    base_url: "https://www.novobbmnet.com.br",
    integration_type: "feed",
    is_active: false,
    last_synced_at: null,
  },
];

function ConfiguracoesPage() {
  const { user } = useAuth();

  // Estados de Carregamento e Persistência
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingId, setSettingId] = useState<string | null>(null);

  // Parâmetros da Empresa (company_settings)
  const [availableCapital, setAvailableCapital] = useState<number | string>(50000);
  const [minMarginPct, setMinMarginPct] = useState<number | string>(15);
  const [defaultTaxPct, setDefaultTaxPct] = useState<number | string>(6);
  const [serviceStates, setServiceStates] = useState<string[]>(["SP", "RJ", "MG", "ES"]);
  const [cityInput, setCityInput] = useState<string>("");
  const [serviceCities, setServiceCities] = useState<string[]>([]);
  const [scoreGreenMin, setScoreGreenMin] = useState<number>(70);
  const [scoreYellowMin, setScoreYellowMin] = useState<number>(40);

  // Fontes de Licitação (sources)
  const [sources, setSources] = useState<SourceItem[]>(DEFAULT_SOURCES);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    opportunities_found: number;
    opportunities_new: number;
    sources_processed: number;
  } | null>(null);

  // Erro de Validação
  const [validationError, setValidationError] = useState<string | null>(null);

  // Carregar dados iniciais do Supabase
  useEffect(() => {
    async function loadData() {
      if (!user) return;
      setLoading(true);
      try {
        // 1. Carregar company_settings
        const { data: settingsData, error: settingsError } = await supabase
          .from("company_settings")
          .select("*")
          .eq("owner_id", user.id)
          .maybeSingle();

        if (settingsError && settingsError.code !== "PGRST116") {
          console.error("Erro ao buscar company_settings:", settingsError);
        }

        if (settingsData) {
          setSettingId(settingsData.id);
          setAvailableCapital(settingsData.available_capital ?? 0);
          setMinMarginPct(settingsData.min_margin_pct ?? 0);
          setDefaultTaxPct(settingsData.default_tax_pct ?? 0);
          setServiceStates(settingsData.service_states || []);
          setServiceCities(settingsData.service_cities || []);
          setScoreGreenMin(settingsData.score_green_min ?? 70);
          setScoreYellowMin(settingsData.score_yellow_min ?? 40);
        }

        // 2. Carregar sources
        const { data: sourcesData, error: sourcesError } = await supabase
          .from("sources")
          .select("*")
          .order("name", { ascending: true });

        if (sourcesError) {
          console.warn("Erro ao buscar sources, usando padrão:", sourcesError);
        } else if (sourcesData && sourcesData.length > 0) {
          setSources(sourcesData as SourceItem[]);
        }
      } catch (err) {
        console.error("Falha ao inicializar configurações:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [user]);

  // Alternar Estado de um Estado (UF)
  const toggleState = (uf: string) => {
    setServiceStates((prev) =>
      prev.includes(uf) ? prev.filter((s) => s !== uf) : [...prev, uf]
    );
  };

  const selectAllStates = () => {
    setServiceStates(BRAZILIAN_STATES);
  };

  const clearAllStates = () => {
    setServiceStates([]);
  };

  const selectRegion = (regionName: string) => {
    const regionUfs = REGIONS[regionName] || [];
    setServiceStates((prev) => {
      const allSelected = regionUfs.every((uf) => prev.includes(uf));
      if (allSelected) {
        return prev.filter((uf) => !regionUfs.includes(uf));
      } else {
        return Array.from(new Set([...prev, ...regionUfs]));
      }
    });
  };

  // Gerenciamento de Cidades
  const addCity = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = cityInput.trim().replace(",", "");
      if (val && !serviceCities.includes(val)) {
        setServiceCities([...serviceCities, val]);
        setCityInput("");
      }
    }
  };

  const removeCity = (cityToRemove: string) => {
    setServiceCities(serviceCities.filter((c) => c !== cityToRemove));
  };

  // Alternar Ativação de Fontes
  const toggleSource = async (sourceId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;

    // Atualiza estado local imediatamente para fluidez
    setSources((prev) =>
      prev.map((s) => (s.id === sourceId ? { ...s, is_active: newStatus } : s))
    );

    try {
      const isCustomDbSource = !sourceId.endsWith("-default");
      if (isCustomDbSource) {
        const { error } = await supabase
          .from("sources")
          .update({ is_active: newStatus })
          .eq("id", sourceId);

        if (error) {
          console.warn("Aviso de RLS em sources:", error.message);
        }
      }
      toast.success(`Fonte ${newStatus ? "ativada" : "desativada"} com sucesso.`);
    } catch (err) {
      console.error("Erro ao atualizar fonte:", err);
    }
  };

  // Disparar Sincronização Manual via Edge Function sync-sources
  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("sync-sources", {
        body: { trigger: "manual" },
      });

      if (error) {
        throw error;
      }

      setSyncResult({
        opportunities_found: data?.opportunities_found ?? 0,
        opportunities_new: data?.opportunities_new ?? 0,
        sources_processed: data?.sources_processed ?? 0,
      });

      toast.success(
        `Sincronização concluída! ${data?.opportunities_new ?? 0} novas oportunidades compatíveis capturadas.`
      );

      // Recarrega sources atualizadas com novo last_synced_at
      const { data: sourcesData } = await supabase
        .from("sources")
        .select("*")
        .order("name", { ascending: true });

      if (sourcesData && sourcesData.length > 0) {
        setSources(sourcesData as SourceItem[]);
      }
    } catch (err: any) {
      console.error("Erro ao executar sincronização manual:", err);
      toast.error(`Falha ao sincronizar fontes: ${err?.message || "Erro de conexão"}`);
    } finally {
      setSyncing(false);
    }
  };

  // Salvar Configurações
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Usuário não autenticado.");
      return;
    }

    const green = Number(scoreGreenMin);
    const yellow = Number(scoreYellowMin);
    const capital = Number(availableCapital);
    const margin = Number(minMarginPct);
    const tax = Number(defaultTaxPct);

    // Validação estrita: score_green_min > score_yellow_min
    if (green <= yellow) {
      const err = "A nota mínima do Score Verde 🟢 deve ser estritamente maior que o Amarelo 🟡.";
      setValidationError(err);
      toast.error(err);
      return;
    }

    if (capital < 0 || margin < 0 || tax < 0) {
      const err = "Os valores financeiros e percentuais não podem ser negativos.";
      setValidationError(err);
      toast.error(err);
      return;
    }

    setValidationError(null);
    setSaving(true);

    try {
      const payload = {
        available_capital: capital,
        min_margin_pct: margin,
        default_tax_pct: tax,
        service_states: serviceStates,
        service_cities: serviceCities,
        score_green_min: green,
        score_yellow_min: yellow,
      };

      if (settingId) {
        // Atualiza registro existente
        const { data, error } = await supabase
          .from("company_settings")
          .update(payload)
          .eq("id", settingId)
          .select()
          .single();

        if (error) throw error;
        if (data) setSettingId(data.id);
      } else {
        // Cria primeira linha
        const { data, error } = await supabase
          .from("company_settings")
          .insert({
            owner_id: user.id,
            ...payload,
          })
          .select()
          .single();

        if (error) throw error;
        if (data) setSettingId(data.id);
      }

      toast.success("Parâmetros da empresa salvos com sucesso!", {
        description: "Os cortes de score e critérios de matching foram atualizados.",
      });
    } catch (err: any) {
      console.error("Erro ao salvar company_settings:", err);
      toast.error("Falha ao salvar configurações", {
        description: err.message || "Verifique sua conexão com o banco de dados.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <PageHeader
          title="Configurações da Empresa"
          description="Carregando parâmetros do banco de dados..."
        />
        <div className="space-y-6">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <form onSubmit={handleSave} className="space-y-8 pb-12">
        <PageHeader
          title="Configurações da Empresa"
          description="Defina capital disponível, margem mínima, estados atendidos e as regras de pontuação do Score."
          action={
            <Button type="submit" disabled={saving} className="gap-2 shadow-xs">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Alterações
            </Button>
          }
        />

        {validationError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erro de Validação</AlertTitle>
            <AlertDescription className="text-xs">{validationError}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Card 1: Parâmetros Financeiros */}
          <Card className="border-border shadow-xs">
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-2 text-primary">
                <DollarSign className="h-5 w-5" />
                <CardTitle className="text-base font-semibold">Parâmetros Financeiros</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Valores usados pelo algoritmo de Score e pelo Simulador Financeiro.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="available_capital" className="text-xs font-medium">
                  Capital de Giro Disponível (R$)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-semibold">
                    R$
                  </span>
                  <Input
                    id="available_capital"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="50000.00"
                    value={availableCapital}
                    onChange={(e) => setAvailableCapital(e.target.value)}
                    className="pl-9 text-sm"
                    required
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Licitações que exigem capital acima deste valor terão redução na pontuação.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="min_margin_pct" className="text-xs font-medium">
                    Margem Mínima Geral (%)
                  </Label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="min_margin_pct"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      placeholder="15.0"
                      value={minMarginPct}
                      onChange={(e) => setMinMarginPct(e.target.value)}
                      className="pl-9 text-sm"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Margem alvo líquida desejada pela empresa.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default_tax_pct" className="text-xs font-medium">
                    Impostos Padrão (%)
                  </Label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="default_tax_pct"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      placeholder="6.0"
                      value={defaultTaxPct}
                      onChange={(e) => setDefaultTaxPct(e.target.value)}
                      className="pl-9 text-sm"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Alíquota padrão (ex: Simples Nacional) para simulações.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Faixas de Corte do Score */}
          <Card className="border-border shadow-xs">
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-2 text-primary">
                <Sliders className="h-5 w-5" />
                <CardTitle className="text-base font-semibold">Faixas de Corte do Score (0–100)</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Classificação visual de compatibilidade e viabilidade dos editais.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Barra de escala visual */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px] font-medium">
                  <span className="text-rose-600 dark:text-rose-400 font-semibold">
                    🔴 Baixa (&lt; {scoreYellowMin})
                  </span>
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">
                    🟡 Média ({scoreYellowMin} – {Number(scoreGreenMin) - 1})
                  </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                    🟢 Alta (≥ {scoreGreenMin})
                  </span>
                </div>

                <div className="flex h-3 w-full overflow-hidden rounded-full border border-border">
                  <div
                    style={{ width: `${Math.min(100, Math.max(0, scoreYellowMin))}%` }}
                    className="bg-rose-500 transition-all duration-300"
                    title={`🔴 Baixa: 0 a ${scoreYellowMin - 1}`}
                  />
                  <div
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(0, Number(scoreGreenMin) - Number(scoreYellowMin))
                      )}%`,
                    }}
                    className="bg-amber-400 transition-all duration-300"
                    title={`🟡 Média: ${scoreYellowMin} a ${scoreGreenMin - 1}`}
                  />
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(0, 100 - Number(scoreGreenMin)))}%`,
                    }}
                    className="bg-emerald-500 transition-all duration-300"
                    title={`🟢 Alta: ${scoreGreenMin} a 100`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="score_green_min" className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                      <span>🟢</span> Nota Mínima Alta
                    </Label>
                    <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      ≥ {scoreGreenMin}
                    </span>
                  </div>
                  <Input
                    id="score_green_min"
                    type="number"
                    min={Number(scoreYellowMin) + 1}
                    max="100"
                    value={scoreGreenMin}
                    onChange={(e) => setScoreGreenMin(Number(e.target.value))}
                    className="text-sm border-emerald-500/40"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Oportunidades com alta compatibilidade e lucro prioritário.
                  </p>
                </div>

                <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="score_yellow_min" className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                      <span>🟡</span> Nota Mínima Média
                    </Label>
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                      ≥ {scoreYellowMin}
                    </span>
                  </div>
                  <Input
                    id="score_yellow_min"
                    type="number"
                    min="0"
                    max={Number(scoreGreenMin) - 1}
                    value={scoreYellowMin}
                    onChange={(e) => setScoreYellowMin(Number(e.target.value))}
                    className="text-sm border-amber-500/40"
                    required
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Oportunidades com ressalvas ou margem moderada.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Card 3: Região de Atendimento */}
        <Card className="border-border shadow-xs">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary">
                <MapPin className="h-5 w-5" />
                <CardTitle className="text-base font-semibold">Região de Atendimento</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={selectAllStates}
                  className="text-xs h-7"
                >
                  Brasil Todo
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearAllStates}
                  className="text-xs h-7 text-muted-foreground"
                >
                  Limpar
                </Button>
              </div>
            </div>
            <CardDescription className="text-xs">
              Selecione as Unidades Federativas (UFs) e municípios onde sua empresa possui capacidade logística.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Atalhos Regionais */}
            <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-border/60">
              <span className="text-xs text-muted-foreground mr-1">Regiões:</span>
              {Object.keys(REGIONS).map((region) => {
                const isSelected = REGIONS[region]!.every((uf) => serviceStates.includes(uf));
                return (
                  <button
                    key={region}
                    type="button"
                    onClick={() => selectRegion(region)}
                    className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 border-border text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {region}
                  </button>
                );
              })}
            </div>

            {/* Grid de UFs */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">
                Estados Atendidos ({serviceStates.length} de 27)
              </Label>
              <div className="grid grid-cols-4 sm:grid-cols-7 md:grid-cols-9 gap-1.5">
                {BRAZILIAN_STATES.map((uf) => {
                  const selected = serviceStates.includes(uf);
                  return (
                    <button
                      key={uf}
                      type="button"
                      onClick={() => toggleState(uf)}
                      className={`flex h-9 items-center justify-center rounded-lg border text-xs font-bold transition-all ${
                        selected
                          ? "bg-primary text-primary-foreground border-primary shadow-xs scale-100"
                          : "bg-card text-muted-foreground border-border/80 hover:bg-accent hover:text-accent-foreground"
                      }`}
                    >
                      {uf}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Municípios Prioritários */}
            <div className="space-y-2 pt-2">
              <Label htmlFor="cities" className="text-xs font-medium">
                Municípios Prioritários (Opcional)
              </Label>
              <Input
                id="cities"
                type="text"
                placeholder="Digite o nome da cidade e pressione Enter ou vírgula..."
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                onKeyDown={addCity}
                className="text-sm"
              />
              {serviceCities.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {serviceCities.map((city) => (
                    <Badge
                      key={city}
                      variant="secondary"
                      className="gap-1.5 pl-2.5 pr-1.5 py-1 text-xs"
                    >
                      <span>{city}</span>
                      <button
                        type="button"
                        onClick={() => removeCity(city)}
                        className="rounded-full hover:bg-muted p-0.5"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Gestão de Fontes Oficiais */}
        <Card className="border-border shadow-xs">
          <CardHeader className="space-y-3 sm:space-y-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-primary">
                <Database className="h-5 w-5" />
                <CardTitle className="text-base font-semibold">Fontes Oficiais Integradas</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Ative ou desative as fontes oficiais e gratuitas de captação de oportunidades.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSyncNow}
                disabled={syncing}
                className="gap-2 border-primary/40 text-primary hover:bg-primary/10 shadow-xs"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin text-primary" : ""}`} />
                {syncing ? "Sincronizando fontes..." : "Sincronizar agora"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {syncResult && (
              <Alert className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <AlertTitle className="text-xs font-semibold">Sincronização executada com sucesso!</AlertTitle>
                <AlertDescription className="text-xs mt-1">
                  {syncResult.opportunities_new} novas oportunidades adicionadas ({syncResult.opportunities_found} processadas em {syncResult.sources_processed} fontes ativas).
                </AlertDescription>
              </Alert>
            )}

            <div className="divide-y divide-border rounded-lg border border-border">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-3 transition-colors hover:bg-muted/20"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-card-foreground">
                        {source.name}
                      </span>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {source.integration_type}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {source.base_url && (
                        <p className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          <a
                            href={source.base_url}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline text-muted-foreground"
                          >
                            {source.base_url}
                          </a>
                        </p>
                      )}
                      {source.last_synced_at && (
                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground/80">
                          <Clock className="h-3 w-3" />
                          Última sincronização: {new Date(source.last_synced_at).toLocaleString("pt-BR")}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground hidden sm:inline-block">
                      {source.is_active ? "Ativa" : "Inativa"}
                    </span>
                    <Switch
                      checked={source.is_active}
                      onCheckedChange={() => toggleSource(source.id, source.is_active)}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Aviso de Conformidade e LGPD */}
            <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-foreground">Conformidade e Origem Legal:</span> O Radar de Licitações utiliza exclusivamente fontes de dados públicos oficiais e autorizados. Todas as varreduras registram trilha de auditoria na tabela <code className="text-primary font-mono text-[11px]">sync_logs</code>.
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end border-t border-border py-4">
            <Button type="submit" disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar Alterações
            </Button>
          </CardFooter>
        </Card>
      </form>
    </AppLayout>
  );
}
