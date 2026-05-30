import { useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import { useCouponHandovers, type CouponHandover } from "@/hooks/useCouponHandovers";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useLogActivity } from "@/hooks/useActivityLog";

/**
 * DailyDueList — Daftar Penagihan Harian (Daily Collection Queue)
 *
 * KONSEP METODE DAFTAR PENAGIHAN HARIAN:
 * 
 * Props:
 *  - selectedDate: Date parameter untuk filter handover berdasarkan handover_date
 *                 Hanya tampilkan handover yang sesuai dengan tanggal yang dipilih
 * 
 * Alur Kerja Setiap Hari:
 * ┌─────────────────────────────────────────────────────────┐
 * │ 1. PAGI - Serah Terima Kupon (Tab "Belum Bayar")       │
 * │    └─ Input HandoverCouponForm → coupon_handovers baru │
 * │                                                         │
 * │ 2. SIANG - Input Pembayaran (Tab "Input Pembayaran")   │
 * │    └─ Daftar ditampilkan di DailyDueList              │
 * │    └─ Kolektor membayar hasil penagihan                │
 * │    └─ Sebagian/Semua kupon dibayar                     │
 * │                                                         │
 * │ 3. AKHIR HARI - Data Daftar Menghilang               │
 * │    └─ Trigger: currentIndex >= start_index            │
 * │    └─ Data batch TIDAK ditampilkan lagi                │
 * │                                                         │
 * │ 4. BESOK - Cycle Berulang                             │
 * │    └─ Sisa kupon dari kemarin → Handover baru          │
 * │    └─ Daftar muncul lagi di DailyDueList              │
 * └─────────────────────────────────────────────────────────┘
 *
 * Sumber data: `coupon_handovers` (kupon yang sudah keluar/diserahterimakan ke kolektor).
 * "Penagihan hari ini" = batch handover yang BELUM PERNAH ADA PEMBAYARAN
 * (currentIndex < start_index = belum ada pembayaran dalam batch ini).
 *
 * Logika penampilan:
 *  - Tampilkan: Jika belum ada pembayaran dalam batch (currentIndex < start_index)
 *  - Hilang: Segera setelah ada pembayaran (baik sebagian atau penuh)
 *            → currentIndex >= start_index = sudah diproses minimal 1 kupon
 *  - Hilang juga: Jika semua kupon lunas (unpaid = 0)
 *
 * Saat pembayaran:
 *  - Default Kupon Kembali = 0 → semua kupon outstanding dianggap LUNAS
 *  - Kupon yang ditandai kembali tetap UNPAID & muncul di tab "Belum Bayar"
 */

interface DueRow {
  handover_id: string;
  contract_id: string;
  contract_ref: string;
  customer_name: string;
  collector_id: string | null;
  collector_name: string | null;
  daily_amount: number;
  start_index: number;
  end_index: number;
  current_installment_index: number;
  paid_count: number;
  unpaid_count: number;
  // installment indices (1-based) yang masih outstanding pada batch ini
  unpaid_indices: number[];
  // status batch: unpaid | partial | paid
  status: "unpaid" | "partial" | "paid";
}

function buildRow(h: CouponHandover): DueRow | null {
  if (!h.credit_contracts) return null;
  const currentIndex = h.credit_contracts.current_installment_index || 0;
  const paidInRange = Math.max(
    0,
    Math.min(currentIndex, h.end_index) - h.start_index + 1,
  );
  const paid = Math.max(0, paidInRange);
  const unpaid = h.coupon_count - paid;

  // Status batch (auto-calculated)
  let status: "unpaid" | "partial" | "paid";
  if (currentIndex < h.start_index) status = "unpaid";
  else if (currentIndex >= h.end_index) status = "paid";
  else status = "partial";

  // Kupon outstanding = index dari max(start_index, currentIndex+1) sampai end_index
  const firstUnpaid = Math.max(h.start_index, currentIndex + 1);
  const indices: number[] = [];
  for (let i = firstUnpaid; i <= h.end_index; i++) indices.push(i);

  return {
    handover_id: h.id,
    contract_id: h.contract_id,
    contract_ref: h.credit_contracts.contract_ref,
    customer_name: h.credit_contracts.customers?.name || "-",
    collector_id: h.collector_id,
    collector_name: h.collectors?.name || null,
    daily_amount: h.credit_contracts.daily_installment_amount,
    start_index: h.start_index,
    end_index: h.end_index,
    current_installment_index: currentIndex,
    paid_count: paid,
    unpaid_count: unpaid,
    unpaid_indices: indices,
    status,
  };
}

export function DailyDueList({
  selectedDate,
  statusFilter = "unpaid",
}: {
  selectedDate?: string;
  statusFilter?: "unpaid" | "partial" | "paid" | "all";
}) {
  const queryClient = useQueryClient();
  const logActivity = useLogActivity();
  const { data: handovers, isLoading } = useCouponHandovers(selectedDate);
  const [searchQuery, setSearchQuery] = useState("");

  // Build rows dari semua handover lalu filter berdasarkan status
  const rows = useMemo(() => {
    const all = (handovers || [])
      .map(buildRow)
      .filter((r): r is DueRow => r !== null);
    if (statusFilter === "all") return all;
    return all.filter((r) => r.status === statusFilter);
  }, [handovers, statusFilter]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.customer_name.toLowerCase().includes(q) ||
        r.contract_ref.toLowerCase().includes(q) ||
        (r.collector_name || "").toLowerCase().includes(q),
    );
  }, [rows, searchQuery]);

  // Dialog state
  const [selected, setSelected] = useState<DueRow | null>(null);
  const [returnedCount, setReturnedCount] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);

  // Default returnedCount = semua unpaid (manual modal = tandai "belum bayar")
  const openDialog = (row: DueRow) => {
    setSelected(row);
    setReturnedCount(row.unpaid_count);
  };
  const closeDialog = () => {
    setSelected(null);
    setReturnedCount(0);
  };

  // Core processor — dipakai oleh tombol "Bayar" (auto lunas) dan modal "Belum Bayar"
  const processRow = async (
    row: DueRow,
    returned: number,
    extraNote: string,
  ) => {
    const total = row.unpaid_count;
    const safeReturned = Math.max(0, Math.min(returned, total));
    const paidCount = total - safeReturned;
    const toPayIndices = row.unpaid_indices.slice(0, paidCount);

      if (toPayIndices.length > 0) {
        const today = new Date().toISOString().split("T")[0];
        const payments = toPayIndices.map((idx) => ({
          contract_id: row.contract_id,
          payment_date: today,
          installment_index: idx,
          amount_paid: row.daily_amount,
          collector_id: row.collector_id,
          notes:
            `Pembayaran kupon ${idx} (batch ${row.start_index}-${row.end_index})` +
            (extraNote ? ` — ${extraNote}` : ""),
        }));
        const { error: payErr } = await supabase
          .from("payment_logs")
          .insert(payments);
        if (payErr) throw payErr;
        const { error: couponErr } = await supabase
          .from("installment_coupons")
          .update({ status: "paid" })
          .eq("contract_id", row.contract_id)
          .in("installment_index", toPayIndices);
        if (couponErr) {
          console.warn("update installment_coupons:", couponErr.message);
        }
        const maxIndex = Math.max(...toPayIndices);
        const { error: cErr } = await supabase
          .from("credit_contracts")
          .update({ current_installment_index: maxIndex })
          .eq("id", row.contract_id)
          .lt("current_installment_index", maxIndex);
        if (cErr) throw cErr;
      }

      logActivity.mutate({
        action: "DAILY_COLLECTION",
        entity_type: "payment",
        entity_id: null,
        description:
          `Penagihan ${row.contract_ref} (${row.customer_name}) ` +
          `batch ${row.start_index}-${row.end_index}: ` +
          `${paidCount} kupon LUNAS, ${safeReturned} kupon KEMBALI` +
          (extraNote ? ` — Catatan: ${extraNote}` : ""),
        contract_id: row.contract_id,
      });

      queryClient.invalidateQueries({ queryKey: ["coupon_handovers"] });
      queryClient.invalidateQueries({ queryKey: ["installment_coupons"] });
      queryClient.invalidateQueries({ queryKey: ["payment_logs"] });
      queryClient.invalidateQueries({ queryKey: ["credit_contracts"] });
      queryClient.invalidateQueries({ queryKey: ["outstanding_coupons"] });
      queryClient.invalidateQueries({ queryKey: ["collection_trend"] });
      queryClient.invalidateQueries({ queryKey: ["aggregated_payments"] });

      toast.success(
        `${row.customer_name}: ${paidCount} lunas, ${safeReturned} kembali`,
      );
  };

  // Submit dari modal "Belum Bayar" (manual)
  const handleSubmit = async () => {
    if (!selected) return;
    const returned = Math.max(0, Math.min(returnedCount, selected.unpaid_count));
    setSubmitting(true);
    try {
      await processRow(selected, returned, "");
      closeDialog();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Terjadi kesalahan";
      toast.error(`Gagal mencatat penagihan: ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Total summary
  const totalUnpaidCoupons = filteredRows.reduce((s, r) => s + r.unpaid_count, 0);
  const totalUnpaidAmount = filteredRows.reduce(
    (s, r) => s + r.unpaid_count * r.daily_amount,
    0,
  );

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Daftar Penagihan Hari Ini
          </CardTitle>
          <CardDescription>
            Daftar pelanggan dengan kupon <strong>keluar</strong> (sudah diserahterimakan ke
            kolektor) yang <strong>belum pernah diproses</strong> (belum ada pembayaran). 
            Klik <strong>Bayar</strong> untuk mencatat hasil tagihan; data akan hilang dari 
            daftar segera setelah diproses (baik sebagian maupun penuh).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Cari pelanggan, kontrak, atau kolektor..."
              className="max-w-md"
            />
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm">
                {filteredRows.length} batch
              </Badge>
              <Badge variant="outline" className="text-sm">
                {totalUnpaidCoupons} kupon • {formatRupiah(totalUnpaidAmount)}
              </Badge>
            </div>
          </div>

          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Memuat daftar...
            </div>
          ) : filteredRows.length === 0 ? (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                {searchQuery
                  ? "Tidak ada pelanggan yang cocok dengan pencarian."
                  : "Semua kupon yang sudah diserahterimakan sudah lunas. 🎉"}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode Kontrak</TableHead>
                    <TableHead>Pelanggan</TableHead>
                    <TableHead>Kolektor</TableHead>
                    <TableHead className="text-center">Range Kupon</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Outstanding</TableHead>
                    <TableHead className="text-right">Total Tagihan</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={row.handover_id}>
                      <TableCell className="font-mono text-sm">
                        {row.contract_ref}
                      </TableCell>
                      <TableCell className="font-medium">{row.customer_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.collector_name || "-"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="font-mono text-xs">
                          {row.start_index}-{row.end_index}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {row.status === "paid" ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 hover:bg-emerald-500/20">
                            Lunas
                          </Badge>
                        ) : row.status === "partial" ? (
                          <Badge className="bg-amber-500/15 text-amber-700 border border-amber-500/30 hover:bg-amber-500/20">
                            Sebagian
                          </Badge>
                        ) : (
                          <Badge className="bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/20">
                            Belum Bayar
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-destructive border-destructive/40">
                          {row.unpaid_count} kupon
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatRupiah(row.daily_amount * row.unpaid_count)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openDialog(row)}
                            disabled={row.unpaid_count <= 0}
                            className="gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Belum Bayar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment Dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Tandai Belum Bayar
            </DialogTitle>
            <DialogDescription>
              {selected?.customer_name} • {selected?.contract_ref} • Batch{" "}
              {selected?.start_index}-{selected?.end_index}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kupon outstanding:</span>
                  <span className="font-semibold">{selected.unpaid_count} kupon</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nominal per kupon:</span>
                  <span className="font-semibold">{formatRupiah(selected.daily_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total tagihan:</span>
                  <span className="font-bold text-primary">
                    {formatRupiah(selected.daily_amount * selected.unpaid_count)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="returned-count" className="text-sm font-medium">
                  Jumlah Kupon Kembali (Belum Terbayar)
                </Label>
                <Input
                  id="returned-count"
                  type="number"
                  min={0}
                  max={selected.unpaid_count}
                  value={returnedCount}
                  onChange={(e) =>
                    setReturnedCount(
                      Math.max(
                        0,
                        Math.min(
                          selected.unpaid_count,
                          parseInt(e.target.value) || 0,
                        ),
                      ),
                    )
                  }
                  className="text-center font-semibold text-lg"
                />
                <p className="text-xs text-muted-foreground">
                  Default = semua kupon ditandai <strong>belum bayar</strong>. Ubah
                  jika sebagian sebenarnya lunas (sisa = kupon yang dikembalikan
                  kolektor / gagal tagih).
                </p>
              </div>

              <Alert
                className={
                  returnedCount > 0
                    ? "border-warning/40 bg-warning/5"
                    : "border-primary/40 bg-primary/5"
                }
              >
                {returnedCount > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-warning" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                )}
                <AlertDescription className="ml-2 space-y-1">
                  <div className="flex justify-between">
                    <span>Lunas:</span>
                    <span className="font-semibold">
                      {selected.unpaid_count - returnedCount} kupon (
                      {formatRupiah(
                        selected.daily_amount *
                          (selected.unpaid_count - returnedCount),
                      )}
                      )
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Kembali (belum bayar):</span>
                    <span className="font-semibold">
                      {returnedCount} kupon (
                      {formatRupiah(selected.daily_amount * returnedCount)})
                    </span>
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={submitting}>
              Batal
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              variant="destructive"
            >
              {submitting ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
