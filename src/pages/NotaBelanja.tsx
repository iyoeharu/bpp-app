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
  Trash2,
} from "lucide-react";

interface NotaProductRow {
  id: string;
  contract_id: string;
  position: number;
  name: string;
  price: number;
  status: "hutang" | "cash";
  store: string | null;
  created_at: string;
  credit_contracts: {
    contract_ref: string;
    start_date: string;
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
  const [payDialog, setPayDialog] = useState<{ open: boolean; store: string }>({
    open: false,
    store: "",
  });
  const [historyDialog, setHistoryDialog] = useState<{ open: boolean; store: string }>({
    open: false,
    store: "",
  });
  const [payAmount, setPayAmount] = useState(0);
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [payNotes, setPayNotes] = useState("");

  const qc = useQueryClient();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["contract_products_all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contract_products")
        .select(
          "id, contract_id, position, name, price, status, store, created_at, credit_contracts(contract_ref, start_date, customers(name))"
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as NotaProductRow[];
    },
  });

  const { data: payments = [] } = useQuery({
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

  const deletePayment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("nota_payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nota_payments"] });
      toast.success("Pembayaran dihapus");
    },
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

  // Per-store payment totals
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
    const sisa = hutang - paidTotal; // bisa negatif (lebih bayar)
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
    // include stores that only appear in payments
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

  const storePayments = useMemo(
    () => payments.filter((p) => p.store === historyDialog.store),
    [payments, historyDialog.store]
  );

  const openPayDialog = (store: string, suggested = 0) => {
    setPayDialog({ open: true, store });
    setPayAmount(suggested);
    setPayDate(new Date().toISOString().split("T")[0]);
    setPayNotes("");
  };

  const sisaColor =
    totals.sisa > 0 ? "text-red-600" : totals.sisa < 0 ? "text-emerald-600" : "text-foreground";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Receipt className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Nota Belanja</h1>
          <p className="text-sm text-muted-foreground">
            Rincian total harga produk berdasarkan status invoice (hutang) dan cash, beserta pembayaran ke toko.
          </p>
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
            <p className="text-xs text-muted-foreground">{totals.items} item produk</p>
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
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Harga</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Memuat...
                        </TableCell>
                      </TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Belum ada data produk.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((r, i) => (
                        <TableRow key={r.id}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {r.credit_contracts?.contract_ref || "-"}
                          </TableCell>
                          <TableCell>{r.credit_contracts?.customers?.name || "-"}</TableCell>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell>{r.store || "-"}</TableCell>
                          <TableCell>
                            <Badge variant={r.status === "hutang" ? "destructive" : "secondary"}>
                              {r.status === "hutang" ? "Hutang" : "Cash"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatRupiah(r.price || 0)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
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
                      byStore.map((s, i) => {
                        const sisaClass =
                          s.sisa > 0
                            ? "text-red-600"
                            : s.sisa < 0
                              ? "text-emerald-600"
                              : "text-muted-foreground";
                        return (
                          <TableRow key={s.store}>
                            <TableCell>{i + 1}</TableCell>
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
                                  onClick={() => openPayDialog(s.store, Math.max(s.sisa, 0))}
                                >
                                  <Plus className="h-3 w-3 mr-1" /> Bayar
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Riwayat Pembayaran ({payments.length})</CardTitle>
              <Button size="sm" onClick={() => openPayDialog("")}>
                <Plus className="h-4 w-4 mr-1" /> Catat Pembayaran
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">No</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Toko</TableHead>
                      <TableHead>Catatan</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Belum ada pembayaran.
                        </TableCell>
                      </TableRow>
                    ) : (
                      payments.map((p, i) => (
                        <TableRow key={p.id}>
                          <TableCell>{i + 1}</TableCell>
                          <TableCell>{formatDate(p.payment_date)}</TableCell>
                          <TableCell className="font-medium">{p.store}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {p.notes || "-"}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-blue-600">
                            {formatRupiah(Number(p.amount))}
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (confirm("Hapus pembayaran ini?")) deletePayment.mutate(p.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3 text-red-600" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Payment Dialog */}
      <Dialog
        open={payDialog.open}
        onOpenChange={(o) => setPayDialog((d) => ({ ...d, open: o }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Catat Pembayaran ke Toko</DialogTitle>
            <DialogDescription>
              Pembayaran akan mengurangi sisa hutang. Pembayaran lebih dari hutang menghasilkan nilai negatif (lebih bayar).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nama Toko *</Label>
              <Input
                value={payDialog.store}
                onChange={(e) => setPayDialog((d) => ({ ...d, store: e.target.value }))}
                placeholder="cth: Toko Sumber Rejeki"
              />
            </div>
            <div>
              <Label>Tanggal Pembayaran *</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            </div>
            <div>
              <Label>Jumlah Pembayaran *</Label>
              <CurrencyInput value={payAmount} onChange={setPayAmount} />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog({ open: false, store: "" })}>
              Batal
            </Button>
            <Button
              disabled={!payDialog.store.trim() || payAmount <= 0 || createPayment.isPending}
              onClick={() =>
                createPayment.mutate({
                  store: payDialog.store.trim(),
                  amount: payAmount,
                  payment_date: payDate,
                  notes: payNotes.trim(),
                })
              }
            >
              {createPayment.isPending ? "Menyimpan..." : "Simpan Pembayaran"}
            </Button>
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
              Total dibayar:{" "}
              <span className="font-semibold text-blue-600">
                {formatRupiah(paidByStore.get(historyDialog.store) || 0)}
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Catatan</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {storePayments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">
                      Belum ada pembayaran untuk toko ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  storePayments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{formatDate(p.payment_date)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.notes || "-"}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-blue-600">
                        {formatRupiah(Number(p.amount))}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (confirm("Hapus pembayaran ini?")) deletePayment.mutate(p.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3 text-red-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
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
