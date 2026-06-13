import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRupiah } from "@/lib/format";
import { Receipt, Wallet, CreditCard, Store as StoreIcon, Search, Package } from "lucide-react";

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

export default function NotaBelanja() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "hutang" | "cash">("all");

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
    return { cash, hutang, items, stores: stores.size, total: cash + hutang };
  }, [rows]);

  const byStore = useMemo(() => {
    const map = new Map<string, { store: string; cash: number; hutang: number; items: number }>();
    for (const r of filtered) {
      const key = r.store || "Tanpa Toko";
      const cur = map.get(key) || { store: key, cash: 0, hutang: 0, items: 0 };
      if (r.status === "cash") cur.cash += r.price || 0;
      else cur.hutang += r.price || 0;
      cur.items += 1;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.cash + b.hutang - (a.cash + a.hutang));
  }, [filtered]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Receipt className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Nota Belanja</h1>
          <p className="text-sm text-muted-foreground">
            Rincian total harga produk berdasarkan status invoice (hutang) dan cash.
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <p className="text-xs text-muted-foreground">Belum dibayar ke toko</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Toko Terlibat</CardTitle>
            <StoreIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.stores}</div>
            <p className="text-xs text-muted-foreground">Jumlah toko unik</p>
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

      {/* Tabs: Detail vs Per Toko */}
      <Tabs defaultValue="detail">
        <TabsList>
          <TabsTrigger value="detail">
            <Package className="h-4 w-4 mr-2" /> Detail Produk
          </TabsTrigger>
          <TabsTrigger value="store">
            <StoreIcon className="h-4 w-4 mr-2" /> Per Toko
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
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byStore.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          Belum ada data.
                        </TableCell>
                      </TableRow>
                    ) : (
                      byStore.map((s, i) => (
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
                          <TableCell className="text-right font-semibold">
                            {formatRupiah(s.cash + s.hutang)}
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
    </div>
  );
}
