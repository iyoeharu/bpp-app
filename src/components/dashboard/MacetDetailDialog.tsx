import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatRupiah } from "@/lib/format";
import type { MacetSummary } from "@/hooks/useMacetSummary";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  data?: MacetSummary;
}

export function MacetDetailDialog({ open, onOpenChange, title, data }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Jumlah Kontrak Macet</p>
              <p className="text-lg font-bold">{data?.macet_count ?? 0}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Total Terbayar dari Kontrak Macet</p>
              <p className="text-lg font-bold">{
                formatRupiah(
                  (data?.contracts || []).reduce((s, c) => s + Number(c.paid || 0), 0)
                )
              }</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Omset</p>
              <p className="text-lg font-bold">{
                formatRupiah(
                  (data?.contracts || []).reduce((s, c) => s + Number(c.contract_total || 0), 0)
                )
              }</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Sisa Tagihan</p>
              <p className="text-lg font-bold text-destructive">{formatRupiah(data?.total_outstanding ?? 0)}</p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">Rekap per Sales</h3>
            <div className="rounded-md border max-h-[260px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Sales</TableHead>
                    <TableHead className="text-right">Kontrak</TableHead>
                    <TableHead className="text-right">Modal</TableHead>
                    <TableHead className="text-right">Harga Jual</TableHead>
                    <TableHead className="text-right">Sisa Tagihan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.by_sales || []).length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Tidak ada data</TableCell></TableRow>
                  ) : data!.by_sales.map((s) => (
                    <TableRow key={s.sales_id || 'none'}>
                      <TableCell>
                        <div className="font-medium">{s.sales_name}</div>
                        {s.sales_code && <div className="text-xs text-muted-foreground">{s.sales_code}</div>}
                      </TableCell>
                      <TableCell className="text-right">{s.contract_count}</TableCell>
                      <TableCell className="text-right">{formatRupiah(s.total_modal)}</TableCell>
                      <TableCell className="text-right">{formatRupiah(s.total_omset)}</TableCell>
                      <TableCell className="text-right text-destructive font-semibold">{formatRupiah(s.total_outstanding)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">Detail Kontrak Macet</h3>
            <div className="rounded-md border max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>No. Kontrak</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead>Sales</TableHead>
                    <TableHead className="text-right">Modal</TableHead>
                    <TableHead className="text-right">Harga Jual</TableHead>
                    <TableHead className="text-right">Dibayar</TableHead>
                    <TableHead className="text-right">Sisa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.contracts || []).length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Tidak ada kontrak macet</TableCell></TableRow>
                  ) : data!.contracts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="whitespace-nowrap">{format(new Date(c.start_date), 'dd MMM yyyy', { locale: idLocale })}</TableCell>
                      <TableCell className="font-mono text-xs">{c.contract_ref}</TableCell>
                      <TableCell>
                        <div className="font-medium">{c.customer_name || '-'}</div>
                        {c.customer_phone && <div className="text-xs text-muted-foreground">{c.customer_phone}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{c.sales_code ? `${c.sales_code} · ` : ''}{c.sales_name}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatRupiah(c.modal)}</TableCell>
                      <TableCell className="text-right">{formatRupiah(c.contract_total)}</TableCell>
                      <TableCell className="text-right text-green-600">{formatRupiah(c.paid)}</TableCell>
                      <TableCell className="text-right text-destructive font-semibold">{formatRupiah(c.outstanding)}</TableCell>
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