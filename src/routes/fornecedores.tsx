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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  Building2,
  Plus,
  Search,
  Edit2,
  Trash2,
  Loader2,
  AlertCircle,
  Clock,
  DollarSign,
  Truck,
  Phone,
  Link as LinkIcon,
  BarChart2,
  Award,
  CheckCircle2,
  Calendar,
  Package,
} from "lucide-react";

export const Route = createFileRoute("/fornecedores")({
  head: () => ({
    meta: [
      { title: "Fornecedores — Radar de Licitações" },
      {
        name: "description",
        content: "Gerencie fornecedores, cotações e compare preços lado a lado.",
      },
    ],
  }),
  component: FornecedoresPage,
});

interface Supplier {
  id: string;
  owner_id: string;
  name: string;
  contact_info: string | null;
  payment_terms_days: number | null;
  default_freight_cost: number | null;
  created_at: string;
  updated_at: string;
}

interface ProductItem {
  id: string;
  name: string;
  category: string | null;
}

interface ProductSupplier {
  id: string;
  owner_id: string;
  product_id: string;
  supplier_id: string;
  unit_price: number;
  lead_time_days: number | null;
  freight_cost: number | null;
  payment_terms_days: number | null;
  created_at: string;
  updated_at: string;
  // Campos vinculados
  product?: ProductItem;
  supplier?: Supplier;
}

function FornecedoresPage() {
  const { user } = useAuth();

  // Estados Principais
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [productSuppliers, setProductSuppliers] = useState<ProductSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Aba ativa
  const [activeTab, setActiveTab] = useState("suppliers");

  // Busca e Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProductForComparison, setSelectedProductForComparison] = useState<string>("all");

  // Modal Fornecedor
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [supplierContact, setSupplierContact] = useState("");
  const [supplierPaymentTerms, setSupplierPaymentTerms] = useState<string | number>("");
  const [supplierDefaultFreight, setSupplierDefaultFreight] = useState<string | number>("");

  // Modal Vínculo Produto↔Fornecedor
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [linkProductId, setLinkProductId] = useState("");
  const [linkSupplierId, setLinkSupplierId] = useState("");
  const [linkUnitPrice, setLinkUnitPrice] = useState<string | number>("");
  const [linkLeadTime, setLinkLeadTime] = useState<string | number>("");
  const [linkFreight, setLinkFreight] = useState<string | number>("");
  const [linkPaymentTerms, setLinkPaymentTerms] = useState<string | number>("");

  // Diálogo de Exclusão
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteType, setDeleteType] = useState<"supplier" | "link">("supplier");
  const [itemToDelete, setItemToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Carregar todos os dados
  const loadData = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Carregar fornecedores
      const { data: supData, error: supError } = await supabase
        .from("suppliers")
        .select("*")
        .eq("owner_id", user.id)
        .order("name", { ascending: true });

      if (supError) throw supError;

      // 2. Carregar produtos
      const { data: prodData, error: prodError } = await supabase
        .from("products")
        .select("id, name, category")
        .eq("owner_id", user.id)
        .order("name", { ascending: true });

      if (prodError) throw prodError;

      // 3. Carregar product_suppliers com join
      const { data: psData, error: psError } = await supabase
        .from("product_suppliers")
        .select(`
          *,
          product:products(id, name, category),
          supplier:suppliers(id, name, contact_info, payment_terms_days, default_freight_cost)
        `)
        .eq("owner_id", user.id)
        .order("unit_price", { ascending: true });

      if (psError) throw psError;

      setSuppliers((supData as Supplier[]) || []);
      setProducts((prodData as ProductItem[]) || []);
      setProductSuppliers((psData as any[]) || []);

      if (prodData && prodData.length > 0 && selectedProductForComparison === "all") {
        setSelectedProductForComparison(prodData[0].id);
      }
    } catch (err: any) {
      console.error("Erro ao carregar dados de fornecedores:", err);
      setError(err.message || "Não foi possível carregar as informações.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  // Handler Fornecedor
  const handleOpenNewSupplier = () => {
    setEditingSupplierId(null);
    setSupplierName("");
    setSupplierContact("");
    setSupplierPaymentTerms("");
    setSupplierDefaultFreight("");
    setSupplierModalOpen(true);
  };

  const handleOpenEditSupplier = (sup: Supplier) => {
    setEditingSupplierId(sup.id);
    setSupplierName(sup.name);
    setSupplierContact(sup.contact_info || "");
    setSupplierPaymentTerms(sup.payment_terms_days ?? "");
    setSupplierDefaultFreight(sup.default_freight_cost ?? "");
    setSupplierModalOpen(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!supplierName.trim()) {
      toast.error("O nome do fornecedor é obrigatório.");
      return;
    }

    setSavingSupplier(true);

    const payload = {
      name: supplierName.trim(),
      contact_info: supplierContact.trim() || null,
      payment_terms_days:
        supplierPaymentTerms !== "" ? parseInt(String(supplierPaymentTerms), 10) : null,
      default_freight_cost:
        supplierDefaultFreight !== "" ? Number(supplierDefaultFreight) : null,
    };

    try {
      if (editingSupplierId) {
        const { error: updateError } = await supabase
          .from("suppliers")
          .update(payload)
          .eq("id", editingSupplierId)
          .eq("owner_id", user.id);

        if (updateError) throw updateError;
        toast.success("Fornecedor atualizado com sucesso!");
      } else {
        const { error: insertError } = await supabase
          .from("suppliers")
          .insert({
            owner_id: user.id,
            ...payload,
          });

        if (insertError) throw insertError;
        toast.success("Fornecedor cadastrado com sucesso!");
      }

      setSupplierModalOpen(false);
      loadData();
    } catch (err: any) {
      console.error("Erro ao salvar fornecedor:", err);
      toast.error("Erro ao salvar fornecedor: " + (err.message || "Tente novamente"));
    } finally {
      setSavingSupplier(false);
    }
  };

  // Handler Vínculo Produto ↔ Fornecedor
  const handleOpenNewLink = () => {
    setEditingLinkId(null);
    setLinkProductId(products.length > 0 ? products[0].id : "");
    setLinkSupplierId(suppliers.length > 0 ? suppliers[0].id : "");
    setLinkUnitPrice("");
    setLinkLeadTime("");
    setLinkFreight("");
    setLinkPaymentTerms("");
    setLinkModalOpen(true);
  };

  const handleOpenEditLink = (ps: ProductSupplier) => {
    setEditingLinkId(ps.id);
    setLinkProductId(ps.product_id);
    setLinkSupplierId(ps.supplier_id);
    setLinkUnitPrice(ps.unit_price);
    setLinkLeadTime(ps.lead_time_days ?? "");
    setLinkFreight(ps.freight_cost ?? "");
    setLinkPaymentTerms(ps.payment_terms_days ?? "");
    setLinkModalOpen(true);
  };

  const handleSaveLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!linkProductId || !linkSupplierId) {
      toast.error("Selecione um produto e um fornecedor.");
      return;
    }

    if (linkUnitPrice === "" || Number(linkUnitPrice) < 0) {
      toast.error("Informe um preço unitário válido.");
      return;
    }

    setSavingLink(true);

    const payload = {
      product_id: linkProductId,
      supplier_id: linkSupplierId,
      unit_price: Number(linkUnitPrice),
      lead_time_days: linkLeadTime !== "" ? parseInt(String(linkLeadTime), 10) : null,
      freight_cost: linkFreight !== "" ? Number(linkFreight) : null,
      payment_terms_days:
        linkPaymentTerms !== "" ? parseInt(String(linkPaymentTerms), 10) : null,
    };

    try {
      if (editingLinkId) {
        const { error: updateError } = await supabase
          .from("product_suppliers")
          .update(payload)
          .eq("id", editingLinkId)
          .eq("owner_id", user.id);

        if (updateError) throw updateError;
        toast.success("Vínculo comercial atualizado!");
      } else {
        const { error: insertError } = await supabase
          .from("product_suppliers")
          .insert({
            owner_id: user.id,
            ...payload,
          });

        if (insertError) {
          if (insertError.message.includes("unique") || insertError.code === "23505") {
            throw new Error("Este produto já possui vínculo cadastrado com este fornecedor.");
          }
          throw insertError;
        }
        toast.success("Vínculo comercial registrado com sucesso!");
      }

      setLinkModalOpen(false);
      loadData();
    } catch (err: any) {
      console.error("Erro ao salvar vínculo comercial:", err);
      toast.error("Erro ao salvar vínculo: " + (err.message || "Tente novamente"));
    } finally {
      setSavingLink(false);
    }
  };

  // Exclusão
  const confirmDeleteSupplier = (sup: Supplier) => {
    setDeleteType("supplier");
    setItemToDelete({ id: sup.id, name: sup.name });
    setDeleteDialogOpen(true);
  };

  const confirmDeleteLink = (ps: ProductSupplier) => {
    setDeleteType("link");
    const label = `${ps.product?.name || "Produto"} ↔ ${ps.supplier?.name || "Fornecedor"}`;
    setItemToDelete({ id: ps.id, name: label });
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete || !user) return;
    setDeleting(true);

    try {
      if (deleteType === "supplier") {
        const { error: delError } = await supabase
          .from("suppliers")
          .delete()
          .eq("id", itemToDelete.id)
          .eq("owner_id", user.id);

        if (delError) throw delError;
        toast.success("Fornecedor excluído com sucesso.");
      } else {
        const { error: delError } = await supabase
          .from("product_suppliers")
          .delete()
          .eq("id", itemToDelete.id)
          .eq("owner_id", user.id);

        if (delError) throw delError;
        toast.success("Vínculo comercial removido com sucesso.");
      }

      setDeleteDialogOpen(false);
      setItemToDelete(null);
      loadData();
    } catch (err: any) {
      console.error("Erro ao excluir:", err);
      toast.error("Erro ao excluir: " + (err.message || "Tente novamente"));
    } finally {
      setDeleting(false);
    }
  };

  // Filtro de Fornecedores
  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.contact_info && s.contact_info.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Vínculos do produto selecionado para comparação
  const comparisonLinks = productSuppliers.filter(
    (ps) => ps.product_id === selectedProductForComparison
  );

  const bestPrice =
    comparisonLinks.length > 0
      ? Math.min(...comparisonLinks.map((l) => l.unit_price))
      : 0;

  const bestLeadTime =
    comparisonLinks.length > 0 &&
    comparisonLinks.some((l) => l.lead_time_days !== null && l.lead_time_days > 0)
      ? Math.min(
          ...comparisonLinks
            .map((l) => l.lead_time_days)
            .filter((d): d is number => d !== null && d > 0)
        )
      : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHeader
          title="Gestão de Fornecedores & Cotações"
          description="Cadastre fornecedores, registre preços por produto e compare condições comerciais lado a lado para embasar suas propostas."
          action={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenNewLink}
                disabled={suppliers.length === 0 || products.length === 0}
                className="gap-1.5 text-xs h-9"
              >
                <LinkIcon className="h-3.5 w-3.5" />
                Vincular Cotação
              </Button>
              <Button onClick={handleOpenNewSupplier} size="sm" className="gap-1.5 text-xs h-9 shadow-xs">
                <Plus className="h-4 w-4" />
                Novo Fornecedor
              </Button>
            </div>
          }
        />

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erro ao carregar dados</AlertTitle>
            <AlertDescription className="text-xs flex items-center justify-between">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={loadData} className="h-7 text-xs">
                Tentar novamente
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 max-w-md">
            <TabsTrigger value="suppliers" className="text-xs">
              Fornecedores ({suppliers.length})
            </TabsTrigger>
            <TabsTrigger value="links" className="text-xs">
              Cotações ({productSuppliers.length})
            </TabsTrigger>
            <TabsTrigger value="comparison" className="text-xs">
              Comparador
            </TabsTrigger>
          </TabsList>

          {/* ================= ABA 1: FORNECEDORES ================= */}
          <TabsContent value="suppliers" className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-xs">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar fornecedor por nome ou contato..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 text-sm h-9"
                />
              </div>
              <span className="text-xs text-muted-foreground hidden sm:inline-block">
                Total: <strong>{suppliers.length}</strong> cadastrados
              </span>
            </div>

            {loading ? (
              <div className="space-y-2 rounded-xl border border-border bg-card p-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : suppliers.length === 0 ? (
              <div className="flex min-h-[350px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 p-8 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4">
                  <Building2 className="h-7 w-7" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">Nenhum fornecedor cadastrado</h3>
                <p className="max-w-md text-sm text-muted-foreground mt-1 mb-5">
                  Cadastre seus fornecedores parceiros para registrar cotações, prazos e fretes para cada item.
                </p>
                <Button onClick={handleOpenNewSupplier} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Cadastrar Primeiro Fornecedor
                </Button>
              </div>
            ) : filteredSuppliers.length === 0 ? (
              <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-border bg-card p-6 text-center">
                <Search className="h-7 w-7 text-muted-foreground mb-2" />
                <p className="text-sm font-semibold">Nenhum fornecedor encontrado</p>
                <p className="text-xs text-muted-foreground">Tente alterar os termos de busca.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Contato Comercial</TableHead>
                      <TableHead className="text-center">Prazo Pagamento</TableHead>
                      <TableHead className="text-right">Frete Padrão</TableHead>
                      <TableHead className="text-center">Itens Cotados</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSuppliers.map((supplier) => {
                      const linkedCount = productSuppliers.filter(
                        (ps) => ps.supplier_id === supplier.id
                      ).length;

                      return (
                        <TableRow key={supplier.id} className="hover:bg-muted/30">
                          <TableCell className="font-semibold text-sm">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span>{supplier.name}</span>
                            </div>
                          </TableCell>

                          <TableCell className="text-xs text-muted-foreground">
                            {supplier.contact_info ? (
                              <span className="flex items-center gap-1.5">
                                <Phone className="h-3 w-3" />
                                {supplier.contact_info}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/60 italic">Sem contato</span>
                            )}
                          </TableCell>

                          <TableCell className="text-center text-xs">
                            {supplier.payment_terms_days !== null ? (
                              <Badge variant="outline" className="text-xs font-normal">
                                {supplier.payment_terms_days} dias
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>

                          <TableCell className="text-right font-medium text-xs">
                            {supplier.default_freight_cost !== null ? (
                              `R$ ${supplier.default_freight_cost.toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}`
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>

                          <TableCell className="text-center text-xs">
                            <Badge variant="secondary" className="font-normal text-xs">
                              {linkedCount} {linkedCount === 1 ? "produto" : "produtos"}
                            </Badge>
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenEditSupplier(supplier)}
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                title="Editar Fornecedor"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => confirmDeleteSupplier(supplier)}
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                title="Excluir Fornecedor"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ================= ABA 2: COTAÇÕES (VÍNCULOS) ================= */}
          <TabsContent value="links" className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-xs">
              <p className="text-xs text-muted-foreground">
                Tabela geral de vínculos produto ↔ fornecedor com preços de custo e prazos.
              </p>
              <Button
                onClick={handleOpenNewLink}
                size="sm"
                disabled={suppliers.length === 0 || products.length === 0}
                className="gap-1.5 text-xs h-8"
              >
                <Plus className="h-3.5 w-3.5" />
                Nova Cotação
              </Button>
            </div>

            {productSuppliers.length === 0 ? (
              <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 p-8 text-center">
                <LinkIcon className="h-10 w-10 text-muted-foreground mb-3" />
                <h4 className="text-base font-semibold">Nenhuma cotação vinculada</h4>
                <p className="max-w-md text-xs text-muted-foreground mt-1 mb-4">
                  Vincule um produto a um fornecedor informando preço de compra, prazo de entrega e frete.
                </p>
                <Button
                  onClick={handleOpenNewLink}
                  size="sm"
                  disabled={suppliers.length === 0 || products.length === 0}
                >
                  Criar Vínculo Comercial
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Produto</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead className="text-right">Preço Unitário</TableHead>
                      <TableHead className="text-center">Prazo Entrega</TableHead>
                      <TableHead className="text-right">Frete Unitário</TableHead>
                      <TableHead className="text-center">Prazo Pagto.</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productSuppliers.map((ps) => (
                      <TableRow key={ps.id} className="hover:bg-muted/30">
                        <TableCell className="font-semibold text-xs text-foreground">
                          {ps.product?.name || "Produto"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {ps.supplier?.name || "Fornecedor"}
                        </TableCell>
                        <TableCell className="text-right font-bold text-xs text-foreground">
                          {`R$ ${ps.unit_price.toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`}
                        </TableCell>
                        <TableCell className="text-center text-xs">
                          {ps.lead_time_days !== null ? (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {ps.lead_time_days}d
                            </span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {ps.freight_cost !== null ? (
                            `R$ ${ps.freight_cost.toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-center text-xs">
                          {ps.payment_terms_days !== null ? (
                            <Badge variant="outline" className="text-[11px] font-normal">
                              {ps.payment_terms_days}d
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenEditLink(ps)}
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => confirmDeleteLink(ps)}
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ================= ABA 3: COMPARADOR LADO A LADO ================= */}
          <TabsContent value="comparison" className="space-y-4">
            <Card className="border-border shadow-xs">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                      <BarChart2 className="h-5 w-5 text-primary" />
                      Comparação Lado a Lado de Fornecedores
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      Selecione um produto para comparar preços unitários, prazos e condições entre fornecedores cotados.
                    </CardDescription>
                  </div>

                  {products.length > 0 && (
                    <div className="w-full sm:w-[280px]">
                      <Select
                        value={selectedProductForComparison}
                        onValueChange={setSelectedProductForComparison}
                      >
                        <SelectTrigger className="text-xs h-9">
                          <SelectValue placeholder="Selecione o produto" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent>
                {products.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    Cadastre produtos e vincule fornecedores para utilizar o comparador.
                  </p>
                ) : comparisonLinks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <Package className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm font-semibold">Nenhuma cotação para este produto</p>
                    <p className="text-xs text-muted-foreground mt-1 mb-4">
                      Vincule fornecedores a este item para comparar custos e prazos.
                    </p>
                    <Button onClick={handleOpenNewLink} size="sm" className="gap-1.5 text-xs">
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar Cotação para este Produto
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Resumo do Melhor Fornecedor */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1">
                          <Award className="h-3.5 w-3.5" />
                          Menor Preço Unitário
                        </span>
                        <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300 mt-1">
                          R${" "}
                          {bestPrice.toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                      </div>

                      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                        <span className="text-[11px] font-semibold text-primary uppercase tracking-wider flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          Menor Prazo de Entrega
                        </span>
                        <p className="text-lg font-bold text-foreground mt-1">
                          {bestLeadTime > 0 ? `${bestLeadTime} dias` : "Não informado"}
                        </p>
                      </div>

                      <div className="rounded-lg border border-border bg-muted/40 p-3">
                        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          Total de Cotações
                        </span>
                        <p className="text-lg font-bold text-foreground mt-1">
                          {comparisonLinks.length}{" "}
                          {comparisonLinks.length === 1 ? "fornecedor" : "fornecedores"}
                        </p>
                      </div>
                    </div>

                    {/* Tabela de Comparação Lado a Lado */}
                    <div className="rounded-lg border border-border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/40">
                            <TableHead>Fornecedor</TableHead>
                            <TableHead className="text-right">Preço Unitário</TableHead>
                            <TableHead className="text-center">Prazo Fornec.</TableHead>
                            <TableHead className="text-right">Frete Unitário</TableHead>
                            <TableHead className="text-right">Custo Direto (Preço+Frete)</TableHead>
                            <TableHead className="text-center">Prazo Pagto.</TableHead>
                            <TableHead className="text-center">Destaque</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {comparisonLinks.map((link) => {
                            const isLowestPrice = link.unit_price === bestPrice;
                            const isFastest =
                              bestLeadTime > 0 && link.lead_time_days === bestLeadTime;
                            const directCost = link.unit_price + (link.freight_cost || 0);

                            return (
                              <TableRow
                                key={link.id}
                                className={isLowestPrice ? "bg-emerald-500/5 hover:bg-emerald-500/10" : "hover:bg-muted/30"}
                              >
                                <TableCell className="font-semibold text-xs">
                                  <div className="space-y-0.5">
                                    <span className="text-foreground">{link.supplier?.name}</span>
                                    {link.supplier?.contact_info && (
                                      <span className="text-[10px] text-muted-foreground block">
                                        {link.supplier.contact_info}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>

                                <TableCell className="text-right font-bold text-xs">
                                  <span
                                    className={
                                      isLowestPrice
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : "text-foreground"
                                    }
                                  >
                                    R${" "}
                                    {link.unit_price.toLocaleString("pt-BR", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </span>
                                </TableCell>

                                <TableCell className="text-center text-xs">
                                  {link.lead_time_days !== null ? (
                                    <span
                                      className={
                                        isFastest
                                          ? "font-semibold text-primary"
                                          : "text-muted-foreground"
                                      }
                                    >
                                      {link.lead_time_days} dias
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </TableCell>

                                <TableCell className="text-right text-xs">
                                  {link.freight_cost !== null
                                    ? `R$ ${link.freight_cost.toLocaleString("pt-BR", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}`
                                    : "R$ 0,00"}
                                </TableCell>

                                <TableCell className="text-right font-semibold text-xs">
                                  R${" "}
                                  {directCost.toLocaleString("pt-BR", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </TableCell>

                                <TableCell className="text-center text-xs">
                                  {link.payment_terms_days !== null
                                    ? `${link.payment_terms_days} dias`
                                    : "À vista"}
                                </TableCell>

                                <TableCell className="text-center">
                                  {isLowestPrice && (
                                    <Badge className="bg-emerald-500 text-white text-[10px] px-1.5 py-0">
                                      Menor Preço 🏆
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal Fornecedor (Criar / Editar) */}
        <Dialog open={supplierModalOpen} onOpenChange={setSupplierModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingSupplierId ? "Editar Fornecedor" : "Novo Fornecedor"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Cadastre os dados de contato e prazos padrão do fornecedor.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveSupplier} className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="sup-name" className="text-xs font-semibold">
                  Nome do Fornecedor / Empresa <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="sup-name"
                  placeholder="Ex: Distribuidora Central Ltda"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="text-sm"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sup-contact" className="text-xs font-semibold">
                  Contato Comercial (E-mail / Telefone / Vendedor)
                </Label>
                <Input
                  id="sup-contact"
                  placeholder="Ex: contato@distribuidora.com | (11) 98765-4321"
                  value={supplierContact}
                  onChange={(e) => setSupplierContact(e.target.value)}
                  className="text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="sup-terms" className="text-xs font-semibold">
                    Prazo Pagto. Padrão (Dias)
                  </Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="sup-terms"
                      type="number"
                      min="0"
                      placeholder="30"
                      value={supplierPaymentTerms}
                      onChange={(e) => setSupplierPaymentTerms(e.target.value)}
                      className="pl-9 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sup-freight" className="text-xs font-semibold">
                    Frete Padrão (R$)
                  </Label>
                  <div className="relative">
                    <Truck className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="sup-freight"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="50.00"
                      value={supplierDefaultFreight}
                      onChange={(e) => setSupplierDefaultFreight(e.target.value)}
                      className="pl-9 text-sm"
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSupplierModalOpen(false)}
                  disabled={savingSupplier}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={savingSupplier} className="gap-2">
                  {savingSupplier && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingSupplierId ? "Salvar Alterações" : "Cadastrar Fornecedor"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal Vínculo Produto ↔ Fornecedor (Cotação) */}
        <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingLinkId ? "Editar Cotação" : "Vincular Produto a Fornecedor"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                Registre os custos e prazos específicos desta combinação para alimentar simulações e comparação.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveLink} className="space-y-4 py-2">
              {/* Seleção de Produto e Fornecedor */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Produto <span className="text-destructive">*</span>
                  </Label>
                  <Select value={linkProductId} onValueChange={setLinkProductId} disabled={!!editingLinkId}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Selecione o produto" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">
                    Fornecedor <span className="text-destructive">*</span>
                  </Label>
                  <Select value={linkSupplierId} onValueChange={setLinkSupplierId} disabled={!!editingLinkId}>
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="Selecione o fornecedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Preço Unitário e Prazo */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="link-price" className="text-xs font-semibold">
                    Preço Unitário (R$) <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-semibold">
                      R$
                    </span>
                    <Input
                      id="link-price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="120.00"
                      value={linkUnitPrice}
                      onChange={(e) => setLinkUnitPrice(e.target.value)}
                      className="pl-9 text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="link-lead" className="text-xs font-semibold">
                    Prazo Entrega (Dias)
                  </Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="link-lead"
                      type="number"
                      min="0"
                      placeholder="7"
                      value={linkLeadTime}
                      onChange={(e) => setLinkLeadTime(e.target.value)}
                      className="pl-9 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Frete e Prazo de Pagamento */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="link-freight" className="text-xs font-semibold">
                    Frete Unitário (R$)
                  </Label>
                  <div className="relative">
                    <Truck className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="link-freight"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="8.50"
                      value={linkFreight}
                      onChange={(e) => setLinkFreight(e.target.value)}
                      className="pl-9 text-sm"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="link-payment" className="text-xs font-semibold">
                    Prazo Pagto. (Dias)
                  </Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="link-payment"
                      type="number"
                      min="0"
                      placeholder="30"
                      value={linkPaymentTerms}
                      onChange={(e) => setLinkPaymentTerms(e.target.value)}
                      className="pl-9 text-sm"
                    />
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLinkModalOpen(false)}
                  disabled={savingLink}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={savingLink} className="gap-2">
                  {savingLink && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingLinkId ? "Salvar Cotação" : "Salvar Vínculo"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Diálogo de Confirmação de Exclusão */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {deleteType === "supplier" ? "Excluir Fornecedor" : "Remover Cotação"}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs">
                {deleteType === "supplier" ? (
                  <>
                    Tem certeza que deseja excluir o fornecedor{" "}
                    <strong>"{itemToDelete?.name}"</strong>? Todas as cotações e vínculos deste fornecedor também serão removidos.
                  </>
                ) : (
                  <>
                    Tem certeza que deseja remover o vínculo comercial{" "}
                    <strong>"{itemToDelete?.name}"</strong>?
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  "Confirmar Exclusão"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
