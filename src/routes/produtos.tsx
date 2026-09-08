import React, { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppLayout, PageHeader } from "@/components/layout/app-layout";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  Tag,
  Loader2,
  AlertCircle,
  Clock,
  DollarSign,
  Percent,
  Truck,
  Hash,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/produtos")({
  head: () => ({
    meta: [
      { title: "Catálogo de Produtos — Radar de Licitações" },
      {
        name: "description",
        content: "Cadastre e gerencie os produtos da empresa para cruzamento com editais.",
      },
    ],
  }),
  component: ProdutosPage,
});

interface Product {
  id: string;
  owner_id: string;
  name: string;
  category: string | null;
  catmat_catser_code: string | null;
  avg_purchase_price: number | null;
  min_margin_pct: number | null;
  supply_lead_time_days: number | null;
  freight_cost: number | null;
  keywords: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const CATEGORY_SUGGESTIONS = [
  "Material de Escritório e Papelaria",
  "Material de Limpeza e Higiene",
  "Equipamentos de Informática",
  "Mobiliário e Decoração",
  "Medicamentos e Material Hospitalar",
  "Alimentos e Gêneros Perecíveis",
  "Ferramentas e Material de Construção",
  "Vestuário e Uniformes",
  "Serviços Gerais",
  "Outros",
];

function ProdutosPage() {
  const { user } = useAuth();

  // Estados de Dados
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de Filtro e Busca
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Estados do Modal de Criação / Edição
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Formulário
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [catmatCode, setCatmatCode] = useState("");
  const [avgPrice, setAvgPrice] = useState<string | number>("");
  const [minMargin, setMinMargin] = useState<string | number>("");
  const [leadTimeDays, setLeadTimeDays] = useState<string | number>("");
  const [freightCost, setFreightCost] = useState<string | number>("");
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Estados de Exclusão
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Carregar produtos
  const fetchProducts = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from("products")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setProducts((data as Product[]) || []);
    } catch (err: any) {
      console.error("Erro ao buscar produtos:", err);
      setError(err.message || "Não foi possível carregar a lista de produtos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [user]);

  // Abrir modal para novo produto
  const handleOpenNew = () => {
    setEditingId(null);
    setName("");
    setCategory("");
    setCatmatCode("");
    setAvgPrice("");
    setMinMargin("");
    setLeadTimeDays("");
    setFreightCost("");
    setKeywords([]);
    setKeywordInput("");
    setIsActive(true);
    setModalOpen(true);
  };

  // Abrir modal para editar
  const handleOpenEdit = (product: Product) => {
    setEditingId(product.id);
    setName(product.name);
    setCategory(product.category || "");
    setCatmatCode(product.catmat_catser_code || "");
    setAvgPrice(product.avg_purchase_price ?? "");
    setMinMargin(product.min_margin_pct ?? "");
    setLeadTimeDays(product.supply_lead_time_days ?? "");
    setFreightCost(product.freight_cost ?? "");
    setKeywords(product.keywords || []);
    setKeywordInput("");
    setIsActive(product.is_active);
    setModalOpen(true);
  };

  // Adicionar palavra-chave
  const handleAddKeyword = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = keywordInput.trim().replace(",", "");
      if (val && !keywords.includes(val)) {
        setKeywords([...keywords, val]);
        setKeywordInput("");
      }
    }
  };

  const handleRemoveKeyword = (tagToRemove: string) => {
    setKeywords(keywords.filter((k) => k !== tagToRemove));
  };

  // Salvar Produto (Insert / Update)
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!name.trim()) {
      toast.error("O nome do produto é obrigatório.");
      return;
    }

    setSaving(true);

    const payload = {
      name: name.trim(),
      category: category.trim() || null,
      catmat_catser_code: catmatCode.trim() || null,
      avg_purchase_price: avgPrice !== "" ? Number(avgPrice) : null,
      min_margin_pct: minMargin !== "" ? Number(minMargin) : null,
      supply_lead_time_days: leadTimeDays !== "" ? parseInt(String(leadTimeDays), 10) : null,
      freight_cost: freightCost !== "" ? Number(freightCost) : null,
      keywords: keywords,
      is_active: isActive,
    };

    try {
      if (editingId) {
        // Atualização
        const { error: updateError } = await supabase
          .from("products")
          .update(payload)
          .eq("id", editingId)
          .eq("owner_id", user.id);

        if (updateError) throw updateError;
        toast.success("Produto atualizado com sucesso!");
      } else {
        // Criação
        const { error: insertError } = await supabase
          .from("products")
          .insert({
            owner_id: user.id,
            ...payload,
          });

        if (insertError) throw insertError;
        toast.success("Produto cadastrado com sucesso!");
      }

      setModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      console.error("Erro ao salvar produto:", err);
      toast.error("Erro ao salvar produto: " + (err.message || "Tente novamente"));
    } finally {
      setSaving(false);
    }
  };

  // Alternar Status Rápido (Ativo / Inativo)
  const handleToggleStatus = async (product: Product) => {
    if (!user) return;
    const newStatus = !product.is_active;

    // Atualização otimista
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, is_active: newStatus } : p))
    );

    try {
      const { error: toggleError } = await supabase
        .from("products")
        .update({ is_active: newStatus })
        .eq("id", product.id)
        .eq("owner_id", user.id);

      if (toggleError) throw toggleError;
      toast.success(`Produto ${newStatus ? "ativado" : "desativado"}.`);
    } catch (err: any) {
      console.error("Erro ao alterar status:", err);
      toast.error("Erro ao atualizar status do produto.");
      fetchProducts();
    }
  };

  // Excluir Produto
  const confirmDelete = (product: Product) => {
    setProductToDelete(product);
    setDeleteDialogOpen(true);
  };

  const handleDeleteProduct = async () => {
    if (!productToDelete || !user) return;
    setDeleting(true);

    try {
      const { error: deleteError } = await supabase
        .from("products")
        .delete()
        .eq("id", productToDelete.id)
        .eq("owner_id", user.id);

      if (deleteError) throw deleteError;
      toast.success("Produto excluído com sucesso.");
      setProducts(products.filter((p) => p.id !== productToDelete.id));
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    } catch (err: any) {
      console.error("Erro ao excluir produto:", err);
      toast.error("Erro ao excluir produto: " + (err.message || "Tente novamente"));
    } finally {
      setDeleting(false);
    }
  };

  // Filtragem dos Produtos
  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (product.catmat_catser_code &&
        product.catmat_catser_code.toLowerCase().includes(searchTerm.toLowerCase())) ||
      product.keywords.some((k) => k.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory =
      categoryFilter === "all" || product.category === categoryFilter;

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && product.is_active) ||
      (statusFilter === "inactive" && !product.is_active);

    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Categorias existentes para o filtro
  const existingCategories = Array.from(
    new Set(products.map((p) => p.category).filter(Boolean))
  ) as string[];

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="Catálogo de Produtos"
          description="Cadastre e gerencie os itens da sua empresa. O Radar utiliza estes dados para cruzar e encontrar licitações compatíveis."
          action={
            <Button onClick={handleOpenNew} className="gap-2 shadow-xs">
              <Plus className="h-4 w-4" />
              Novo Produto
            </Button>
          }
        />

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erro ao carregar dados</AlertTitle>
            <AlertDescription className="text-xs flex items-center justify-between">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={fetchProducts} className="h-7 text-xs">
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Barra de Filtros e Busca */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, CATMAT ou palavra-chave..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px] text-xs h-9">
                <SelectValue placeholder="Todas as Categorias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Categorias</SelectItem>
                {existingCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] text-xs h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos ({products.length})</SelectItem>
                <SelectItem value="active">
                  Ativos ({products.filter((p) => p.is_active).length})
                </SelectItem>
                <SelectItem value="inactive">
                  Inativos ({products.filter((p) => !p.is_active).length})
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tabela de Produtos / Estado Vazio / Carregando */}
        {loading ? (
          <div className="space-y-2 rounded-xl border border-border bg-card p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex min-h-[380px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
              <Package className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Nenhum produto cadastrado</h3>
            <p className="max-w-md text-sm text-muted-foreground mt-1 mb-5">
              Cadastre os produtos que sua empresa fornece para que o Radar comece a encontrar e pontuar licitações compatíveis.
            </p>
            <Button onClick={handleOpenNew} className="gap-2">
              <Plus className="h-4 w-4" />
              Cadastrar Primeiro Produto
            </Button>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="flex min-h-[250px] flex-col items-center justify-center rounded-xl border border-border bg-card p-8 text-center">
            <Search className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-semibold">Nenhum produto encontrado</p>
            <p className="text-xs text-muted-foreground mt-1">
              Tente alterar os termos de busca ou remover os filtros aplicados.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[280px]">Produto / CATMAT</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Preço Médio</TableHead>
                  <TableHead className="text-right">Margem Mín.</TableHead>
                  <TableHead className="text-center">Prazo</TableHead>
                  <TableHead>Palavras-chave (Matching)</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow key={product.id} className="hover:bg-muted/30">
                    {/* Nome e CATMAT */}
                    <TableCell>
                      <div className="space-y-0.5">
                        <span className="font-semibold text-foreground text-sm block">
                          {product.name}
                        </span>
                        {product.catmat_catser_code ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.2 rounded">
                            <Hash className="h-2.5 w-2.5" />
                            {product.catmat_catser_code}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/60 italic">
                            Sem CATMAT
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Categoria */}
                    <TableCell>
                      {product.category ? (
                        <Badge variant="outline" className="text-xs font-normal">
                          {product.category}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Preço de Compra */}
                    <TableCell className="text-right font-medium text-xs">
                      {product.avg_purchase_price !== null ? (
                        `R$ ${product.avg_purchase_price.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Margem Mínima */}
                    <TableCell className="text-right font-medium text-xs">
                      {product.min_margin_pct !== null ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                          {product.min_margin_pct}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Prazo de Fornecimento */}
                    <TableCell className="text-center text-xs">
                      {product.supply_lead_time_days !== null ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {product.supply_lead_time_days}d
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/* Palavras-chave */}
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[260px]">
                        {product.keywords && product.keywords.length > 0 ? (
                          product.keywords.slice(0, 3).map((kw) => (
                            <Badge
                              key={kw}
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 font-normal"
                            >
                              {kw}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-[11px] text-muted-foreground/60 italic">
                            Sem palavras-chave
                          </span>
                        )}
                        {product.keywords && product.keywords.length > 3 && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            +{product.keywords.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Status Ativo / Inativo */}
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center">
                        <Switch
                          checked={product.is_active}
                          onCheckedChange={() => handleToggleStatus(product)}
                          title={product.is_active ? "Produto Ativo" : "Produto Inativo"}
                        />
                      </div>
                    </TableCell>

                    {/* Ações */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenEdit(product)}
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Editar Produto"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => confirmDelete(product)}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title="Excluir Produto"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </div>
        )}

        {/* Modal de Criação / Edição */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingId ? "Editar Produto" : "Cadastrar Novo Produto"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Preencha os detalhes do produto para cruzamento automático com as oportunidades.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveProduct} className="space-y-4 py-2">
              {/* Nome do Produto */}
              <div className="space-y-1.5">
                <Label htmlFor="prod-name" className="text-xs font-semibold">
                  Nome do Produto <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="prod-name"
                  placeholder="Ex: Papel Sulfite A4 75g Reciclado Caixa 5000 Folhas"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-sm"
                  required
                />
              </div>

              {/* Categoria e Código CATMAT */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="prod-category" className="text-xs font-semibold">
                    Categoria
                  </Label>
                  <Input
                    id="prod-category"
                    placeholder="Ex: Material de Escritório"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    list="categories-list"
                    className="text-sm"
                  />
                  <datalist id="categories-list">
                    {CATEGORY_SUGGESTIONS.map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="prod-catmat" className="text-xs font-semibold">
                    Código CATMAT / CATSER
                  </Label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="prod-catmat"
                      placeholder="Ex: 150642"
                      value={catmatCode}
                      onChange={(e) => setCatmatCode(e.target.value)}
                      className="pl-9 text-sm font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Código oficial usado em compras governamentais.
                  </p>
                </div>
              </div>

              {/* Preço Médio, Margem Mínima e Frete */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="prod-price" className="text-xs font-semibold">
                    Preço Médio de Compra (R$)
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-semibold">
                      R$
                    </span>
                    <Input
                      id="prod-price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="180.00"
                      value={avgPrice}
                      onChange={(e) => setAvgPrice(e.target.value)}
                      className="pl-9 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="prod-margin" className="text-xs font-semibold">
                    Margem Mínima (%)
                  </Label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="prod-margin"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      placeholder="15.0"
                      value={minMargin}
                      onChange={(e) => setMinMargin(e.target.value)}
                      className="pl-9 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="prod-lead-time" className="text-xs font-semibold">
                    Prazo Fornecimento (Dias)
                  </Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="prod-lead-time"
                      type="number"
                      min="0"
                      placeholder="5"
                      value={leadTimeDays}
                      onChange={(e) => setLeadTimeDays(e.target.value)}
                      className="pl-9 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Frete Unitário Estimado */}
              <div className="space-y-1.5">
                <Label htmlFor="prod-freight" className="text-xs font-semibold">
                  Custo Estimado de Frete Unitário (R$)
                </Label>
                <div className="relative">
                  <Truck className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="prod-freight"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="12.50"
                    value={freightCost}
                    onChange={(e) => setFreightCost(e.target.value)}
                    className="pl-9 text-sm"
                  />
                </div>
              </div>

              {/* Palavras-chave para Matching */}
              <div className="space-y-1.5">
                <Label htmlFor="prod-keywords" className="text-xs font-semibold">
                  Palavras-chave para Matching
                </Label>
                <Input
                  id="prod-keywords"
                  placeholder="Digite a palavra-chave e pressione Enter ou vírgula..."
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={handleAddKeyword}
                  className="text-sm"
                />
                <p className="text-[10px] text-muted-foreground">
                  Termos usados para encontrar correspondência no objeto dos editais (ex: papel A4, sulfite, alcalino, 75g).
                </p>

                {keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {keywords.map((kw) => (
                      <Badge
                        key={kw}
                        variant="secondary"
                        className="gap-1.5 pl-2 pr-1 py-0.5 text-xs"
                      >
                        <span>{kw}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveKeyword(kw)}
                          className="rounded-full hover:bg-muted p-0.5"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Status Ativo */}
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="prod-active" className="text-xs font-semibold">
                    Produto Ativo para Matching
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Quando desativado, o produto não será cruzado com novas licitações.
                  </p>
                </div>
                <Switch
                  id="prod-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving} className="gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId ? "Salvar Alterações" : "Cadastrar Produto"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Diálogo de Confirmação de Exclusão */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir Produto</AlertDialogTitle>
              <AlertDialogDescription className="text-xs">
                Tem certeza que deseja excluir o produto{" "}
                <strong>"{productToDelete?.name}"</strong>? Esta ação não pode ser desfeita e removerá os vínculos comerciais deste item.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteProduct}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  "Excluir Produto"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
