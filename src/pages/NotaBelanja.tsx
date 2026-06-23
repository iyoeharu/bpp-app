import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatRupiah, formatDate } from "@/lib/format";
import { toast } from "sonner";
import {
  Receipt,
  Wallet,
  CreditCard,
  Store as StoreIcon,
  Search,
  Package,
  Wallet2,
  Plus,
  History,
  ArrowLeft,
  ChevronRight,
  Calendar,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  addMonths,
  subMonths,
  addYears,
  subYears,
  isWithinInterval,
  parseISO,
} from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface NotaProductRow {
  id: string;
  contract_id: string;
  position: number;
  name: string;
  price: number;
  status: "hutang" | "cash";
  store: string | null;
  pickup_date: string | null;
  created_at: string;
  credit_contracts: {
    contract_ref: string;
    start_date: string;
    status: string | null;
    customers: { name: string } | null;
  } | null;
}

interface NotaPayment {
  id: string;
  store: string;
  amount: number;
  payment_date: string;
  notes: string | null;
  created_at: string;
}

export default function NotaBelanja() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "hutang" | "cash">("all");
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [periodDate, setPeriodDate] = useState<Date>(new Date());
  const [payDialog, setPayDialog] = useState<{ open: boolean; store: string; readonly?: boolean }>({
    open: false,
    store: "",
    readonly: false,
  });
  const [historyDialog, setHistoryDialog] = useState<{ open: boolean; store: string }>({
    open: false,
    store: "",
  });
  const [payAmount, setPayAmount] = useState(0);
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [payNotes, setPayNotes] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  // pickup date now follows contract start_date (read-only)
  const [storePopoverOpen, setStorePopoverOpen] = useState(false);

  // Encode/decode product_ids inside notes field (since DB has no dedicated column)
  const PIDS_RE = /^\[PIDS:([^\]]*)\]\s?/;
  const encodeNotes = (ids: string[], notes: string) =>
    `[PIDS:${ids.join(",")}] ${notes || ""}`.trim();
  const decodeNotes = (raw: string | null): { ids: string[]; notes: string } => {
    if (!raw) return { ids: [], notes: "" };
    const m = raw.match(PIDS_RE);
    if (!m) return { ids: [], notes: raw };
    const ids = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    return { ids, notes: raw.replace(PIDS_RE, "").trim() };
  };


  const qc = useQueryClient();

  const periodRange = useMemo(() => {
    if (period === "yearly") {
      return { start: startOfYear(periodDate), end: endOfYear(periodDate) };
    }
    return { start: startOfMonth(periodDate), end: endOfMonth(periodDate) };
  }, [period, periodDate]);

  const periodLabel = useMemo(() => {
    return period === "yearly"
      ? `Tahun ${periodDate.getFullYear()}`
      : format(periodDate, "MMMM yyyy", { locale: idLocale });
  }, [period, periodDate]);

  const shiftPeriod = (delta: number) => {
    if (period === "yearly") {
      setPeriodDate((d) => (delta > 0 ? addYears(d, 1) : subYears(d, 1)));
    } else {
      setPeriodDate((d) => (delta > 0 ? addMonths(d, 1) : subMonths(d, 1)));
    }
  };

  const { data: allRows = [], isLoading } = useQuery({
    queryKey: ["contract_products_all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contract_products")
        .select(
          "id, contract_id, position, name, price, status, store, pickup_date, created_at, credit_contracts(contract_ref, start_date, status, customers(name))"
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as NotaProductRow[];
    },
  });

  const { data: allPayments = [] } = useQuery({
    queryKey: ["nota_payments"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("nota_payments")
        .select("*")
        .order("payment_date", { ascending: false });
      if (error) throw error;
      return (data || []) as NotaPayment[];
    },
  });

  // Filter rows by parent contract start_date (mirrors Dashboard period logic)
  // Exclude products from contracts that have been returned (sinkron dengan Dashboard yang juga exclude status 'returned')
  const rows = useMemo(() => {
    return allRows.filter((r) => {
      if (r.credit_contracts?.status === "returned") return false;
      const sd = r.credit_contracts?.start_date
        ? parseISO(r.credit_contracts.start_date)
        : r.created_at
        ? parseISO(r.created_at)
        : null;
      if (!sd) return false;
      return isWithinInterval(sd, periodRange);
    });
  }, [allRows, periodRange]);

  const payments = useMemo(() => {
    return allPayments.filter((p) => {
      const d = p.payment_date ? parseISO(p.payment_date) : null;
      if (!d) return false;
      return isWithinInterval(d, periodRange);
    });
  }, [allPayments, periodRange]);

  const createPayment = useMutation({
    mutationFn: async (input: { store: string; amount: number; payment_date: string; notes: string }) => {
      const { error } = await (supabase as any).from("nota_payments").insert(input);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nota_payments"] });
      toast.success("Pembayaran berhasil dicatat");
      setPayDialog({ open: false, store: "" });
      setPayAmount(0);
      setPayNotes("");
    },
    onError: (e: any) => toast.error(e.message || "Gagal mencatat pembayaran"),
  });



  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        (r.store || "").toLowerCase().includes(q) ||
        (r.credit_contracts?.contract_ref || "").toLowerCase().includes(q) ||
        (r.credit_contracts?.customers?.name || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  const paidByStore = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of payments) m.set(p.store, (m.get(p.store) || 0) + Number(p.amount || 0));
    return m;
  }, [payments]);

  const totals = useMemo(() => {
    let cash = 0,
      hutang = 0,
      items = 0;
    const stores = new Set<string>();
    for (const r of rows) {
      if (r.status === "cash") cash += r.price || 0;
      else hutang += r.price || 0;
      items += 1;
      if (r.store) stores.add(r.store);
    }
    const paidTotal = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
    const sisa = hutang - paidTotal;
    return { cash, hutang, items, stores: stores.size, total: cash + hutang, paidTotal, sisa };
  }, [rows, payments]);

  const byStore = useMemo(() => {
    const map = new Map<
      string,
      { store: string; cash: number; hutang: number; items: number }
    >();
    for (const r of rows) {
      const key = r.store || "Tanpa Toko";
      const cur = map.get(key) || { store: key, cash: 0, hutang: 0, items: 0 };
      if (r.status === "cash") cur.cash += r.price || 0;
      else cur.hutang += r.price || 0;
      cur.items += 1;
      map.set(key, cur);
    }
    for (const s of paidByStore.keys()) {
      if (!map.has(s)) map.set(s, { store: s, cash: 0, hutang: 0, items: 0 });
    }
    return Array.from(map.values())
      .map((s) => {
        const paid = paidByStore.get(s.store) || 0;
        return { ...s, paid, sisa: s.hutang - paid };
      })
      .sort((a, b) => b.sisa - a.sisa);
  }, [rows, paidByStore]);

  // Map store -> sorted unique pickup dates from product rows (within period)
  const pickupDatesByStore = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of rows) {
      if (!r.store || !r.pickup_date) continue;
      const arr = m.get(r.store) || [];
      if (!arr.includes(r.pickup_date)) arr.push(r.pickup_date);
      m.set(r.store, arr);
    }
    for (const [k, v] of m) v.sort();
    return m;
  }, [rows]);

  const storePayments = useMemo(
    () => payments.filter((p) => p.store === historyDialog.store),
    [payments, historyDialog.store]
  );

  // Pesanan produk untuk toko yang sedang dibayar (status hutang dalam periode)
  const dialogStoreProducts = useMemo(() => {
    if (!payDialog.store) return [] as NotaProductRow[];
    const target = payDialog.store.trim().toLowerCase();
    return rows.filter(
      (r) => r.status === "hutang" && (r.store || "").trim().toLowerCase() === target
    );
  }, [rows, payDialog.store]);

  const dialogStoreTotals = useMemo(() => {
    const hutang = dialogStoreProducts.reduce((s, r) => s + Number(r.price || 0), 0);
    const paid = paidByStore.get(payDialog.store.trim()) || 0;
    return { hutang, paid, sisa: hutang - paid };
  }, [dialogStoreProducts, paidByStore, payDialog.store]);

  const storeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of allRows) {
      const s = (r.store || "").trim();
      if (s) set.add(s);
    }
    for (const p of allPayments) {
      const s = (p.store || "").trim();
      if (s) set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allRows, allPayments]);

  const productById = useMemo(() => {
    const m = new Map<string, NotaProductRow>();
    for (const r of allRows) m.set(r.id, r);
    return m;
  }, [allRows]);

  // Set of product IDs that have already been paid (from any prior nota_payment)
  const paidProductIds = useMemo(() => {
    const s = new Set<string>();
    for (const p of allPayments) {
      const { ids } = decodeNotes(p.notes);
      for (const id of ids) s.add(id);
    }
    return s;
  }, [allPayments]);


  const openPayDialog = (store: string, suggested = 0) => {
    setPayDialog({ open: true, store, readonly: false });
    setPayAmount(suggested);
    setPayDate(new Date().toISOString().split("T")[0]);
    setPayNotes("");
    setSelectedProductIds(new Set());
  };

  const openDetailDialog = (store: string) => {
    setPayDialog({ open: true, store, readonly: true });
    setPayAmount(0);
    setPayDate(new Date().toISOString().split("T")[0]);
    setPayNotes("");
    setSelectedProductIds(new Set());
  };


  const sisaColor =
    totals.sisa > 0 ? "text-red-600" : totals.sisa < 0 ? "text-emerald-600" : "text-foreground";

  const productPagination = usePagination(filtered, 10);
  const storePagination = usePagination(byStore, 10);
  const paymentPagination = usePagination(payments, 10);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Receipt className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Nota Belanja</h1>
            <p className="text-sm text-muted-foreground">
              Rincian total harga produk berdasarkan status invoice (hutang) dan cash, beserta pembayaran ke toko.
            </p>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Bulanan</SelectItem>
              <SelectItem value="yearly">Tahunan</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => shiftPeriod(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md min-w-[140px] justify-center">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">{periodLabel}</span>
          </div>
          <Button variant="outline" size="icon" onClick={() => shiftPeriod(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total Belanja</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatRupiah(totals.total)}</div>
            <p className="text-xs text-muted-foreground">{totals.items} item · {periodLabel}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Cash</CardTitle>
            <Wallet className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatRupiah(totals.cash)}</div>
            <p className="text-xs text-muted-foreground">Sudah lunas saat beli</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Hutang (Invoice)</CardTitle>
            <CreditCard className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatRupiah(totals.hutang)}</div>
            <p className="text-xs text-muted-foreground">Total tagihan ke toko</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Sudah Dibayar</CardTitle>
            <Wallet2 className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatRupiah(totals.paidTotal)}</div>
            <p className="text-xs text-muted-foreground">{payments.length} transaksi</p>
          </CardContent>
        </Card>
        <Card className="border-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Sisa Hutang</CardTitle>
            <StoreIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${sisaColor}`}>
              {totals.sisa < 0 ? `- ${formatRupiah(Math.abs(totals.sisa))}` : formatRupiah(totals.sisa)}
            </div>
            <p className="text-xs text-muted-foreground">
              {totals.sisa < 0 ? "Lebih bayar ke toko" : totals.sisa > 0 ? "Masih kurang bayar" : "Lunas"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama produk, toko, kontrak, atau pelanggan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <TabsList>
              <TabsTrigger value="all">Semua</TabsTrigger>
              <TabsTrigger value="cash">Cash</TabsTrigger>
              <TabsTrigger value="hutang">Hutang</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="detail">
        <TabsList>
          <TabsTrigger value="detail">
            <Package className="h-4 w-4 mr-2" /> Detail Produk
          </TabsTrigger>
          <TabsTrigger value="store">
            <StoreIcon className="h-4 w-4 mr-2" /> Per Toko
          </TabsTrigger>
          <TabsTrigger value="payments">
            <History className="h-4 w-4 mr-2" /> Riwayat Pembayaran
          </TabsTrigger>
        </TabsList>

        <TabsContent value="detail">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daftar Produk ({filtered.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">No</TableHead>
                      <TableHead>Kontrak</TableHead>
                      <TableHead>Pelanggan</TableHead>
                      <TableHead>Nama Produk</TableHead>
                      <TableHead>Toko</TableHead>
                      <TableHead>Tgl Pengambilan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Harga</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          Memuat...
                        </TableCell>
                      </TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                          Belum ada data produk untuk {periodLabel}.
                        </TableCell>
                      </TableRow>
                    ) : (
                      productPagination.paginatedItems.map((r, i) => {
                        const pickupDate = r.pickup_date || null;
                        const globalIdx = (productPagination.currentPage - 1) * 10 + i + 1;
                        return (
                          <TableRow key={r.id}>
                            <TableCell>{globalIdx}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {r.credit_contracts?.contract_ref || "-"}
                            </TableCell>
                            <TableCell>{r.credit_contracts?.customers?.name || "-"}</TableCell>
                            <TableCell className="font-medium">{r.name}</TableCell>
                            <TableCell>{r.store || "-"}</TableCell>
                            <TableCell className="text-sm">
                              {pickupDate ? (
                                formatDate(pickupDate)
                              ) : (
                                <span className="text-xs text-muted-foreground italic">belum di isi</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={r.status === "hutang" ? "destructive" : "secondary"}>
                                {r.status === "hutang" ? "Hutang" : "Cash"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatRupiah(r.price || 0)}
                            </TableCell>
                            <TableCell className="text-right">
                              {(() => {
                                if (!r.store || r.status !== 'hutang') return <span className="text-xs text-muted-foreground">-</span>;
                                // compute total hutang for this store in current period
                                const storeHutangTotal = rows
                                  .filter((rr) => rr.store === r.store && rr.status === 'hutang')
                                  .reduce((s, it) => s + Number(it.price || 0), 0);
                                const paidForStore = paidByStore.get(r.store) || 0;
                                const sisaForStore = storeHutangTotal - paidForStore;
                                // show Bayar button only if there's outstanding for the store
                                if (sisaForStore > 0) {
                                  return (
                                    <Button
                                      size="sm"
                                      onClick={() => openPayDialog(r.store as string, Number(r.price || 0))}
                                    >
                                      <Plus className="h-3 w-3 mr-1" /> Bayar
                                    </Button>
                                  );
                                }
                                return <span className="text-xs text-muted-foreground">-</span>;
                              })()}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              <TablePagination
                currentPage={productPagination.currentPage}
                totalPages={productPagination.totalPages}
                onPageChange={productPagination.goToPage}
                totalItems={productPagination.totalItems}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="store">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rekap Per Toko ({byStore.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">No</TableHead>
                      <TableHead>Toko</TableHead>
                      <TableHead className="text-right">Item</TableHead>
                      <TableHead className="text-right">Cash</TableHead>
                      <TableHead className="text-right">Hutang</TableHead>
                      <TableHead className="text-right">Dibayar</TableHead>
                      <TableHead className="text-right">Sisa</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byStore.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          Belum ada data.
                        </TableCell>
                      </TableRow>
                    ) : (
                      storePagination.paginatedItems.map((s, i) => {
                        const sisaClass =
                          s.sisa > 0
                            ? "text-red-600"
                            : s.sisa < 0
                              ? "text-emerald-600"
                              : "text-muted-foreground";
                        const globalIdx = (storePagination.currentPage - 1) * 10 + i + 1;
                        return (
                          <TableRow key={s.store}>
                            <TableCell>{globalIdx}</TableCell>
                            <TableCell className="font-medium">{s.store}</TableCell>
                            <TableCell className="text-right">{s.items}</TableCell>
                            <TableCell className="text-right text-green-600">
                              {formatRupiah(s.cash)}
                            </TableCell>
                            <TableCell className="text-right text-red-600">
                              {formatRupiah(s.hutang)}
                            </TableCell>
                            <TableCell className="text-right text-blue-600">
                              {formatRupiah(s.paid)}
                            </TableCell>
                            <TableCell className={`text-right font-semibold ${sisaClass}`}>
                              {s.sisa < 0
                                ? `- ${formatRupiah(Math.abs(s.sisa))}`
                                : formatRupiah(s.sisa)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setHistoryDialog({ open: true, store: s.store })}
                                >
                                  <History className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => openDetailDialog(s.store)}
                                >
                                  <Search className="h-3 w-3 mr-1" /> Detail
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              <TablePagination
                currentPage={storePagination.currentPage}
                totalPages={storePagination.totalPages}
                onPageChange={storePagination.goToPage}
                totalItems={storePagination.totalItems}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Riwayat Pembayaran ({payments.length})</CardTitle>
              <p className="text-xs text-muted-foreground">
                Pencatatan pembayaran dilakukan melalui tombol <span className="font-semibold">Detail</span> pada tab "Per Toko".
              </p>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">No</TableHead>
                      <TableHead>Tgl Pembayaran</TableHead>
                      <TableHead>Toko</TableHead>
                      <TableHead>Tgl Pengambilan (Produk Dibayar)</TableHead>
                      <TableHead>Catatan</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Belum ada pembayaran untuk {periodLabel}.
                        </TableCell>
                      </TableRow>
                    ) : (
                      paymentPagination.paginatedItems.map((p, i) => {
                        const globalIdx = (paymentPagination.currentPage - 1) * 10 + i + 1;
                        const { ids, notes } = decodeNotes(p.notes);
                        const paidProducts = ids
                          .map((id) => productById.get(id))
                          .filter(Boolean) as NotaProductRow[];
                        const paidPickups = Array.from(
                          new Set(
                            paidProducts
                              .map((pp) => pp.pickup_date || pp.credit_contracts?.start_date)
                              .filter(Boolean) as string[]
                          )
                        ).sort();
                        return (
                          <TableRow key={p.id}>
                            <TableCell>{globalIdx}</TableCell>
                            <TableCell>{formatDate(p.payment_date)}</TableCell>
                            <TableCell className="font-medium">{p.store}</TableCell>
                            <TableCell className="text-xs">
                              {paidProducts.length === 0 ? (
                                <span className="italic text-muted-foreground">-</span>
                              ) : paidPickups.length === 0 ? (
                                <span className="italic text-muted-foreground">belum di isi</span>
                              ) : (
                                <div className="space-y-0.5">
                                  {paidPickups.map((d) => (
                                    <div key={d}>{formatDate(d)}</div>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {notes || "-"}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-blue-600">
                              {formatRupiah(Number(p.amount))}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>

                </Table>
              </div>
              <TablePagination
                currentPage={paymentPagination.currentPage}
                totalPages={paymentPagination.totalPages}
                onPageChange={paymentPagination.goToPage}
                totalItems={paymentPagination.totalItems}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Payment Dialog */}
      <Dialog
        open={payDialog.open}
        onOpenChange={(o) => setPayDialog((d) => ({ ...d, open: o }))}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {payDialog.readonly ? `Detail Toko – ${payDialog.store}` : "Catat Pembayaran ke Toko"}
            </DialogTitle>
            <DialogDescription>
              {payDialog.readonly
                ? "Tampilan hanya-baca berisi rincian pesanan produk dan ringkasan pembayaran untuk toko ini."
                : "Pembayaran akan mengurangi sisa hutang. Pembayaran lebih dari hutang menghasilkan nilai negatif (lebih bayar)."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4">
            <div>
              <Label>Nama Toko {payDialog.readonly ? "" : "*"}</Label>
              {payDialog.readonly ? (
                <div className="w-full rounded-md border bg-muted px-3 py-2 text-sm font-medium">
                  {payDialog.store || "-"}
                </div>
              ) : (
                <Popover open={storePopoverOpen} onOpenChange={setStorePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={storePopoverOpen}
                      className="w-full justify-between font-normal"
                    >
                      <span className={cn("truncate", !payDialog.store && "text-muted-foreground")}>
                        {payDialog.store || "Pilih atau ketik nama toko..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command
                      filter={(value, search) =>
                        value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                      }
                    >
                      <CommandInput
                        placeholder="Cari atau ketik toko baru..."
                        value={payDialog.store}
                        onValueChange={(v) => setPayDialog((d) => ({ ...d, store: v }))}
                      />
                      <CommandList>
                        <CommandEmpty>
                          <div className="text-xs text-muted-foreground py-1">
                            Tekan Enter untuk pakai "{payDialog.store}" sebagai toko baru.
                          </div>
                        </CommandEmpty>
                        <CommandGroup heading="Toko tersedia">
                          {storeOptions.map((s) => (
                            <CommandItem
                              key={s}
                              value={s}
                              onSelect={(val) => {
                                setPayDialog((d) => ({ ...d, store: val }));
                                setStorePopoverOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  payDialog.store.trim().toLowerCase() === s.toLowerCase()
                                    ? "opacity-100"
                                    : "opacity-0"
                                )}
                              />
                              {s}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Pesanan produk untuk toko ini */}
            {payDialog.store && (
              <div className="rounded-md border bg-muted/30">
                <div className="px-3 py-2 border-b flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">
                      Pesanan Produk – {payDialog.store} ({periodLabel})
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {dialogStoreProducts.length} item hutang
                  </div>
                </div>
                {/* Tanggal Pengambilan Summary */}
                {(() => {
                  const pickupDates = dialogStoreProducts
                    .map((p) => p.pickup_date || p.credit_contracts?.start_date || null)
                    .filter((d) => d !== null && d !== undefined) as string[];
                  const uniqueDates = Array.from(new Set(pickupDates));
                  const hasNoPickup = dialogStoreProducts.some((p) => !(p.pickup_date || p.credit_contracts?.start_date));
                  return (
                    <div className="px-3 py-2 border-b bg-blue-50/50">
                      <p className="text-xs font-semibold text-blue-900 mb-1">Tanggal Pengambilan Produk:</p>
                      <div className="text-xs text-blue-800">
                        {uniqueDates.length > 0 ? (
                          <div className="space-y-0.5">
                            {uniqueDates.map((date) => (
                              <div key={date}>• {formatDate(date)}</div>
                            ))}
                            {hasNoPickup && <div className="italic text-muted-foreground">• belum di isi</div>}
                          </div>
                        ) : (
                          <div className="italic text-muted-foreground">Semua produk belum memiliki tanggal pengambilan</div>
                        )}
                      </div>
                    </div>
                  );
                })()}
                <div className="max-h-48 overflow-y-auto">
                  {dialogStoreProducts.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                      Tidak ada pesanan hutang untuk toko ini di periode {periodLabel}.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {!payDialog.readonly && <TableHead className="h-8 w-10">Pilih</TableHead>}
                          <TableHead className="h-8">Produk</TableHead>
                          <TableHead className="h-8">Kontrak</TableHead>
                          <TableHead className="h-8">Tgl Ambil</TableHead>
                          <TableHead className="h-8 text-right">Harga</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dialogStoreProducts.map((p) => {
                          const isPaid = paidProductIds.has(p.id);
                          const checked = selectedProductIds.has(p.id) || isPaid;
                          return (
                            <TableRow key={p.id} className={isPaid ? "opacity-60" : undefined}>
                              {!payDialog.readonly && (
                                <TableCell className="py-1.5">
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
                                    checked={checked}
                                    disabled={isPaid}
                                    title={isPaid ? "Produk sudah terbayar" : undefined}
                                    onChange={(e) => {
                                      if (isPaid) return;
                                      setSelectedProductIds((prev) => {
                                        const next = new Set(prev);
                                        if (e.target.checked) next.add(p.id);
                                        else next.delete(p.id);
                                        // auto-sum
                                        const sum = dialogStoreProducts
                                          .filter((dp) => next.has(dp.id))
                                          .reduce((s, dp) => s + Number(dp.price || 0), 0);
                                        setPayAmount(sum);
                                        return next;
                                      });
                                    }}
                                  />
                                </TableCell>
                              )}

                              <TableCell className="py-1.5 text-xs font-medium">{p.name}</TableCell>
                              <TableCell className="py-1.5 text-xs font-mono">
                                {p.credit_contracts?.contract_ref || "-"}
                              </TableCell>
                              <TableCell className="py-1.5 text-xs">
                                {p.pickup_date || p.credit_contracts?.start_date ? (
                                  formatDate(p.pickup_date || p.credit_contracts!.start_date!)
                                ) : (
                                  <span className="italic text-muted-foreground">belum di isi</span>
                                )}
                              </TableCell>
                              <TableCell className="py-1.5 text-xs text-right">
                                {formatRupiah(Number(p.price || 0))}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>

                  )}
                </div>
                <div className="px-3 py-2 border-t grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Hutang</p>
                    <p className="font-semibold text-red-600">{formatRupiah(dialogStoreTotals.hutang)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Dibayar</p>
                    <p className="font-semibold text-blue-600">{formatRupiah(dialogStoreTotals.paid)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Sisa</p>
                    <p className={`font-semibold ${dialogStoreTotals.sisa > 0 ? "text-red-600" : dialogStoreTotals.sisa < 0 ? "text-emerald-600" : ""}`}>
                      {dialogStoreTotals.sisa < 0
                        ? `- ${formatRupiah(Math.abs(dialogStoreTotals.sisa))}`
                        : formatRupiah(dialogStoreTotals.sisa)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!payDialog.readonly && (
              <>
                <div>
                  <Label>Tanggal Pembayaran *</Label>
                  <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                </div>
                <div>
                  <Label>Jumlah Pembayaran *</Label>
                  <CurrencyInput value={payAmount} onValueChange={(v) => setPayAmount(v || 0)} />
                </div>
                <div>
                  <Label>Catatan</Label>
                  <Textarea
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    placeholder="Opsional"
                    rows={2}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPayDialog({ open: false, store: "", readonly: false })}
            >
              {payDialog.readonly ? "Tutup" : "Batal"}
            </Button>
            {!payDialog.readonly && (
              <Button
                disabled={!payDialog.store.trim() || payAmount <= 0 || createPayment.isPending}
                onClick={() =>
                  createPayment.mutate({
                    store: payDialog.store.trim(),
                    amount: payAmount,
                    payment_date: payDate,
                    notes: encodeNotes(Array.from(selectedProductIds), payNotes.trim()),
                  })

                }
              >
                {createPayment.isPending ? "Menyimpan..." : "Simpan Pembayaran"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog
        open={historyDialog.open}
        onOpenChange={(o) => setHistoryDialog((d) => ({ ...d, open: o }))}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Riwayat Pembayaran – {historyDialog.store}</DialogTitle>
            <DialogDescription>
              Total dibayar ({periodLabel}):{" "}
              <span className="font-semibold text-blue-600">
                {formatRupiah(paidByStore.get(historyDialog.store) || 0)}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tgl Pembayaran</TableHead>
                  <TableHead>Tgl Pengambilan (Dibayar)</TableHead>
                  <TableHead>Catatan</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {storePayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                      Belum ada pembayaran untuk toko ini di periode ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  storePayments.map((p) => {
                    const { ids, notes } = decodeNotes(p.notes);
                    const paidProducts = ids
                      .map((id) => productById.get(id))
                      .filter(Boolean) as NotaProductRow[];
                    const paidPickups = Array.from(
                      new Set(
                        paidProducts
                          .map((pp) => pp.pickup_date || pp.credit_contracts?.start_date)
                          .filter(Boolean) as string[]
                      )
                    ).sort();
                    return (
                      <TableRow key={p.id}>
                        <TableCell>{formatDate(p.payment_date)}</TableCell>
                        <TableCell className="text-xs">
                          {paidProducts.length === 0 ? (
                            <span className="italic text-muted-foreground">-</span>
                          ) : paidPickups.length === 0 ? (
                            <span className="italic text-muted-foreground">belum di isi</span>
                          ) : (
                            <div className="space-y-0.5">
                              {paidPickups.map((d) => (
                                <div key={d}>{formatDate(d)}</div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {notes || "-"}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-blue-600">
                          {formatRupiah(Number(p.amount))}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>

            </Table>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setHistoryDialog({ open: false, store: "" });
                openPayDialog(historyDialog.store);
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Tambah Pembayaran
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
