import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/format";
import type { OutstandingDetailsSummary } from "@/hooks/useOutstandingDetails";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  data?: OutstandingDetailsSummary;
}

export function OutstandingDetailDialog({ open, onOpenChange, title, data }: Props) {
  const collectionRate = data && data.total_contract_value > 0
    ? (data.total_paid / data.total_contract_value) * 100
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6">
          {/* Ringkasan total */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Jumlah Kontrak</p>
              <p className="text-lg font-bold">{data?.contracts_count ?? 0}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Total Nilai Kontrak</p>
              <p className="text-lg font-bold">{formatRupiah(data?.total_contract_value ?? 0)}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Sudah Dibayar</p>
              <p className="text-lg font-bold text-green-600">{formatRupiah(data?.total_paid ?? 0)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{collectionRate.toFixed(1)}% terbayar</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Sisa Tagihan</p>
              <p className="text-lg font-bold text-destructive">{formatRupiah(data?.total_outstanding ?? 0)}</p>
            </div>
          </div>

          {/* Per Sales */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Rekap per Sales</h3>
            <div className="rounded-md border">
              <div className="max-h-[260px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>Sales</TableHead>
                      <TableHead className="text-right">Kontrak</TableHead>
                       <TableHead className="text-right">Nilai Kontrak</TableHead>
                       <TableHead className="text-right">Tertagih</TableHead>
                      <TableHead className="text-right">Sisa Tagihan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.by_sales || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          Tidak ada data
                        </TableCell>
                      </TableRow>
                    ) : (
                      data!.by_sales.map((s) => (
                        <TableRow key={s.sales_id || 'none'}>
                          <TableCell>
                            <div className="font-medium">{s.sales_name}</div>
                            {s.sales_code && (
                              <div className="text-xs text-muted-foreground">{s.sales_code}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{s.contract_count}</TableCell>
                          <TableCell className="text-right">{formatRupiah(s.total_contract)}</TableCell>
                          <TableCell className="text-right text-green-600">{formatRupiah(s.total_paid)}</TableCell>
                          <TableCell className="text-right text-destructive font-semibold">{formatRupiah(s.total_outstanding)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          {/* Detail per Kontrak */}
          <div>
            <h3 className="text-sm font-semibold mb-2">Detail Kontrak (urut sisa terbesar)</h3>
            <div className="rounded-md border">
              <div className="max-h-[400px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>Tanggal Mulai</TableHead>
                      <TableHead>No. Kontrak</TableHead>
                      <TableHead>Pelanggan</TableHead>
                      <TableHead>Sales</TableHead>
                       <TableHead className="text-right">Nilai Kontrak</TableHead>
                       <TableHead className="text-right">Dibayar</TableHead>
                      <TableHead className="text-right">Sisa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.contracts || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          Tidak ada sisa tagihan
                        </TableCell>
                      </TableRow>
                    ) : (
                      data!.contracts.map((c) => (
                        <TableRow key={c.contract_id}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(c.start_date), 'dd MMM yyyy', { locale: idLocale })}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{c.contract_ref}</TableCell>
                          <TableCell>
                            <div className="font-medium">{c.customer_name}</div>
                            {c.customer_phone && (
                              <div className="text-xs text-muted-foreground">{c.customer_phone}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {c.sales_code !== '-' ? `${c.sales_code} · ` : ''}{c.sales_name}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatRupiah(c.contract_total)}</TableCell>
                          <TableCell className="text-right text-green-600">{formatRupiah(c.paid_amount)}</TableCell>
                          <TableCell className="text-right text-destructive font-semibold">{formatRupiah(c.outstanding)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
