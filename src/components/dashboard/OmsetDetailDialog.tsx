import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatRupiah } from "@/lib/format";
import type { OmsetDetailsSummary } from "@/hooks/useOmsetDetails";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { useMemo, useState } from "react";
import { Search, Info, Package } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  data?: OmsetDetailsSummary;
}

export function OmsetDetailDialog({ open, onOpenChange, title, data }: Props) {
  const [search, setSearch] = useState("");

  const filteredContracts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = data?.contracts || [];
    if (!q) return list;
    return list.filter((c) =>
      (c.contract_ref || "").toLowerCase().includes(q) ||
      (c.customer_name || "").toLowerCase().includes(q) ||
      (c.customer_phone || "").toLowerCase().includes(q) ||
      (c.sales_name || "").toLowerCase().includes(q) ||
      (c.sales_code || "").toLowerCase().includes(q) ||
      (c.products || []).some((p) => p.toLowerCase().includes(q))
    );
  }, [data?.contracts, search]);

  const totalKonsumen = useMemo(() => {
    if (!data?.contracts) return 0;
    const set = new Set<string>();
    data.contracts.forEach((c) => {
      const key = (c.customer_phone && c.customer_phone.trim())
        || (c.customer_name && c.customer_name.trim().toLowerCase())
        || c.contract_id;
      set.add(key);
    });
    return set.size;
  }, [data?.contracts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Jumlah Kontrak</p>
              <p className="text-lg font-bold">{data?.contracts_count ?? 0}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Total Konsumen</p>
              <p className="text-lg font-bold text-purple-600">{totalKonsumen}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Total Modal</p>
              <p className="text-lg font-bold text-blue-600">{formatRupiah(data?.total_modal ?? 0)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Total DP</p>
              <p className="text-lg font-bold text-orange-600">{formatRupiah(data?.total_dp ?? 0)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Total Omset</p>
              <p className="text-lg font-bold text-indigo-600">{formatRupiah(data?.total_omset ?? 0)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Keuntungan Kotor</p>
              <p className="text-lg font-bold text-green-600">{formatRupiah(data?.total_profit ?? 0)}</p>
            </div>
          </div>

          {(data?.return_adjustments?.length ?? 0) > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                  Penyesuaian Retur Periode Ini ({data?.return_adjustments?.length})
                </p>
                <p className="text-sm font-bold text-red-700 dark:text-red-300">
                  −{formatRupiah(data?.total_return_omset ?? 0)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground mb-2">
                Omset awal kontrak tetap (immutable) di bulan dibuatnya. Retur dialokasikan ke bulan pengajuan.
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {data?.return_adjustments?.map((r) => (
                  <div key={r.contract_id} className="flex justify-between text-xs gap-2">
                    <span className="font-mono">{r.contract_ref}</span>
                    <span className="flex-1 truncate text-muted-foreground">
                      {r.customer_name} · {r.sales_code !== '-' ? r.sales_code : r.sales_name}
                    </span>
                    <span className="text-red-600 font-medium whitespace-nowrap">
                      −{formatRupiah(r.omset)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <h3 className="text-sm font-semibold">Detail Kontrak ({filteredContracts.length})</h3>
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cari kontrak, pelanggan, sales, produk..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>
            <div className="rounded-md border max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>No. Kontrak</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead>Sales</TableHead>
                    <TableHead className="text-right">Modal</TableHead>
                    <TableHead className="text-right">DP</TableHead>
                    <TableHead className="text-right">Omset</TableHead>
                    <TableHead className="text-center">Info</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredContracts.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Tidak ada kontrak</TableCell></TableRow>
                  ) : filteredContracts.map((c) => (
                    <TableRow key={c.contract_id}>
                      <TableCell className="whitespace-nowrap">{format(new Date(c.start_date), 'dd MMM yyyy', { locale: idLocale })}</TableCell>
                      <TableCell className="font-mono text-xs">
                        <div className="flex items-center gap-1">
                          {c.contract_ref}
                          {c.is_returned && <Badge variant="destructive" className="text-[10px] px-1 py-0">Retur</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{c.customer_name}</div>
                        {c.customer_phone && <div className="text-xs text-muted-foreground">{c.customer_phone}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{c.sales_code !== '-' ? `${c.sales_code} · ` : ''}{c.sales_name}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-blue-600">{formatRupiah(c.modal)}</TableCell>
                      <TableCell className="text-right text-orange-600">{formatRupiah(c.dp ?? 0)}</TableCell>
                      <TableCell className="text-right text-indigo-600">{formatRupiah(c.omset)}</TableCell>
                      <TableCell className="text-center">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              disabled={!c.products || c.products.length === 0}
                            >
                              <Info className="h-4 w-4 text-primary" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-64">
                            <div className="flex items-center gap-2 mb-2">
                              <Package className="h-4 w-4 text-primary" />
                              <span className="text-sm font-semibold">Produk Kontrak</span>
                            </div>
                            {c.products && c.products.length > 0 ? (
                              <ul className="space-y-1 text-sm">
                                {c.products.map((p, i) => (
                                  <li key={i} className="flex gap-2">
                                    <span className="text-muted-foreground">{i + 1}.</span>
                                    <span>{p}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-sm text-muted-foreground">Tidak ada produk</p>
                            )}
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
