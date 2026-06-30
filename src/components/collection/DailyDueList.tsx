import { useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, AlertTriangle, Pencil } from "lucide-react";
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
import { useResetCouponRange } from "@/hooks/useCouponRangeReset";
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
  // installment indices (1-based) yang sudah LUNAS pada batch ini (bisa di-rollback ke Belum Bayar)
  paid_indices: number[];
  // status batch: unpaid | partial | paid
  status: "unpaid" | "partial" | "paid";
}

interface RangeEditTarget {
  handover_ids: string[];
  contract_id: string;
  contract_ref: string;
  customer_name: string;
  collector_name: string | null;
  start_index: number;
  end_index: number;
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

  // Kupon LUNAS dalam batch = start_index..min(currentIndex, end_index)
  const lastPaid = Math.min(currentIndex, h.end_index);
  const paidIndices: number[] = [];
  for (let i = h.start_index; i <= lastPaid; i++) paidIndices.push(i);

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
    paid_indices: paidIndices,
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
  const resetCouponRange = useResetCouponRange();
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

  // Grup berdasarkan nama pelanggan — jika pelanggan sama, tumpuk batch-nya dalam 1 baris
  const groupedRows = useMemo(() => {
    const map = new Map<string, DueRow[]>();
    for (const r of filteredRows) {
      const key = r.customer_name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).map(([customer_name, batches]) => ({
      customer_name,
      batches,
      total_unpaid_count: batches.reduce((s, b) => s + b.unpaid_count, 0),
      total_unpaid_amount: batches.reduce((s, b) => s + b.unpaid_count * b.daily_amount, 0),
    }));
  }, [filteredRows]);

  // Dialog state — selected dapat berisi 1 atau lebih batch (digabung per pelanggan)
  const [selected, setSelected] = useState<DueRow[] | null>(null);
  const [returnedCount, setReturnedCount] = useState<number>(0);
  const [extraNote, setExtraNote] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [rangeEditTarget, setRangeEditTarget] = useState<RangeEditTarget | null>(null);
  const [rangeEditStart, setRangeEditStart] = useState<number>(1);
  const [rangeEditEnd, setRangeEditEnd] = useState<number>(1);
  const [rangeEditReason, setRangeEditReason] = useState<string>("");
  const [rangeEditPassword, setRangeEditPassword] = useState<string>("");
  const [rangeEditSubmitting, setRangeEditSubmitting] = useState(false);

  // Dedupe paid kupon antar batch (handover bisa overlap di indeks yang sama)
  const selectedUniquePaid = useMemo(() => {
    if (!selected) return [] as { contract_id: string; index: number; daily_amount: number }[];
    const seen = new Set<string>();
    const list: { contract_id: string; index: number; daily_amount: number }[] = [];
    for (const r of selected) {
      for (const idx of r.paid_indices) {
        const key = `${r.contract_id}:${idx}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({ contract_id: r.contract_id, index: idx, daily_amount: r.daily_amount });
      }
    }
    return list;
  }, [selected]);
  const selectedTotalPaid = selectedUniquePaid.length;
  const selectedTotalAmount = selectedUniquePaid.reduce((s, x) => s + x.daily_amount, 0);
  const selectedCustomer = selected?.[0]?.customer_name || "";
  const selectedContractRefs = selected
    ? Array.from(new Set(selected.map((r) => r.contract_ref))).join(", ")
    : "";

  // Default returnedCount = semua kupon LUNAS unik dalam grup (rollback ke "belum bayar")
  const openDialog = (rows: DueRow[]) => {
    setSelected(rows);
    const seen = new Set<string>();
    let unique = 0;
    for (const r of rows) {
      for (const idx of r.paid_indices) {
        const key = `${r.contract_id}:${idx}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique++;
      }
    }
    setReturnedCount(unique);
    setExtraNote("");
  };
  const closeDialog = () => {
    setSelected(null);
    setReturnedCount(0);
    setExtraNote("");
  };

  const openRangeEditDialog = (target: RangeEditTarget) => {
    setRangeEditTarget(target);
    setRangeEditStart(target.start_index);
    setRangeEditEnd(target.end_index);
    setRangeEditReason("");
    setRangeEditPassword("");
  };

  const closeRangeEditDialog = () => {
    setRangeEditTarget(null);
    setRangeEditReason("");
    setRangeEditPassword("");
  };

  const handleRangeEditSubmit = async () => {
    if (!rangeEditTarget) return;
    if (!rangeEditPassword.trim()) {
      toast.error("Password admin wajib diisi");
      return;
    }
    if (rangeEditStart < 1 || rangeEditEnd < rangeEditStart) {
      toast.error("Range kupon tidak valid");
      return;
    }

    setRangeEditSubmitting(true);
    try {
      const result = await resetCouponRange.mutateAsync({
        contractId: rangeEditTarget.contract_id,
        startIndex: rangeEditStart,
        endIndex: rangeEditEnd,
        handoverIds: rangeEditTarget.handover_ids,
        reason: rangeEditReason.trim() || undefined,
        adminPassword: rangeEditPassword,
      });

      toast.success(
        `Range ${rangeEditTarget.contract_ref} diperbarui menjadi ${rangeEditStart}-${rangeEditEnd}. ` +
          `${result?.deleted_payment_count ?? 0} pembayaran di luar range dihapus, serah terima lama direset, ` +
          `form serah terima otomatis lanjut ke kupon berikutnya.`,
      );
      logActivity.mutate({
        action: "DAILY_COLLECTION",
        entity_type: "payment",
        entity_id: null,
        description:
          `Edit range kupon ${rangeEditTarget.contract_ref} (${rangeEditTarget.customer_name}) ` +
          `dari ${rangeEditStart}-${rangeEditEnd}` +
          (rangeEditReason.trim() ? ` — Alasan: ${rangeEditReason.trim()}` : ""),
        contract_id: rangeEditTarget.contract_id,
      });
      closeRangeEditDialog();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Terjadi kesalahan";
      toast.error(`Gagal memperbarui range kupon: ${msg}`);
    } finally {
      setRangeEditSubmitting(false);
    }
  };

  // Core processor — modal "Belum Bayar": rollback N kupon LUNAS terakhir menjadi unpaid.
  // Karena handover auto-mark semua kupon LUNAS, di sini kita HAPUS payment_logs untuk
  // kupon yang ditandai "kembali / belum bayar", balikkan installment_coupons → unpaid,
  // dan mundurkan credit_contracts.current_installment_index.
  const processRow = async (
    row: DueRow,
    returnedFromPaid: number,
    extraNote: string,
  ) => {
    const total = row.paid_count;
    const safeReturned = Math.max(0, Math.min(returnedFromPaid, total));
    if (safeReturned <= 0) {
      toast.info("Tidak ada kupon yang ditandai belum bayar");
      return;
    }
    // Ambil N indeks LUNAS TERAKHIR dalam batch untuk di-rollback
    const toRevert = row.paid_indices.slice(-safeReturned);
    if (toRevert.length === 0) return;

    // 1) Hapus payment_logs untuk indeks tsb
    const { error: delErr } = await supabase
      .from("payment_logs")
      .delete()
      .eq("contract_id", row.contract_id)
      .in("installment_index", toRevert);
    if (delErr) throw delErr;

    // 2) Balikkan installment_coupons → unpaid
    const { error: couponErr } = await supabase
      .from("installment_coupons")
      .update({ status: "unpaid" })
      .eq("contract_id", row.contract_id)
      .in("installment_index", toRevert);
    if (couponErr) console.warn("update installment_coupons:", couponErr.message);

    // 3) Mundurkan current_installment_index ke (indeks lunas terendah - 1)
    const newCurrent = Math.min(...toRevert) - 1;
    const { error: cErr } = await supabase
      .from("credit_contracts")
      .update({ current_installment_index: newCurrent })
      .eq("id", row.contract_id);
    if (cErr) throw cErr;

    // 4) Simpan catatan unpaid ke coupon_handovers.notes (append, dengan tanda kutip)
    if (extraNote) {
      const { data: hRow } = await supabase
        .from("coupon_handovers")
        .select("notes")
        .eq("id", row.handover_id)
        .single();
      const prev = (hRow?.notes || "").trim();
      const appended = `"${extraNote}"`;
      const merged = prev ? `${prev} ${appended}` : appended;
      await supabase
        .from("coupon_handovers")
        .update({ notes: merged })
        .eq("id", row.handover_id);
    }

      logActivity.mutate({
        action: "DAILY_COLLECTION",
        entity_type: "payment",
        entity_id: null,
        description:
          `Tandai Belum Bayar ${row.contract_ref} (${row.customer_name}) ` +
          `batch ${row.start_index}-${row.end_index}: ` +
          `${safeReturned} kupon dikembalikan ke status BELUM BAYAR` +
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
        `${row.customer_name}: ${safeReturned} kupon ditandai BELUM BAYAR`,
      );
  };

  // Submit dari modal "Belum Bayar" — distribusi rollback per kontrak dengan dedup indeks
  const handleSubmit = async () => {
    if (!selected || selected.length === 0) return;
    const cap = selectedTotalPaid;
    let remaining = Math.max(0, Math.min(returnedCount, cap));
    if (remaining <= 0) {
      toast.info("Tidak ada kupon yang ditandai belum bayar");
      return;
    }
    // Group selected rows per contract; gabungkan paid_indices (union) agar tidak double
    const byContract = new Map<string, { rows: DueRow[]; paidIndices: number[] }>();
    for (const r of selected) {
      const entry = byContract.get(r.contract_id) || { rows: [], paidIndices: [] };
      entry.rows.push(r);
      for (const idx of r.paid_indices) {
        if (!entry.paidIndices.includes(idx)) entry.paidIndices.push(idx);
      }
      byContract.set(r.contract_id, entry);
    }
    // Urutkan kontrak: kupon LUNAS terakhir terlebih dahulu
    const ordered = Array.from(byContract.values())
      .map((e) => ({ ...e, paidIndices: e.paidIndices.sort((a, b) => a - b) }))
      .sort((a, b) => {
        const aMax = a.paidIndices[a.paidIndices.length - 1] || 0;
        const bMax = b.paidIndices[b.paidIndices.length - 1] || 0;
        return bMax - aMax;
      });
    setSubmitting(true);
    try {
      for (const entry of ordered) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, entry.paidIndices.length);
        if (take <= 0) continue;
        // Buat synthetic row dari row pertama, override paid_indices/paid_count dengan union
        const base = entry.rows[0];
        const synthetic: DueRow = {
          ...base,
          paid_indices: entry.paidIndices,
          paid_count: entry.paidIndices.length,
          // handover_id untuk catatan: pakai handover dengan end_index terbesar
          handover_id: entry.rows.reduce((acc, r) => (r.end_index > acc.end_index ? r : acc), base).handover_id,
        };
        await processRow(synthetic, take, extraNote.trim());
        remaining -= take;
      }
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
            Daftar batch kupon yang sudah diserahterimakan ke kolektor. Secara default
            semua kupon dalam batch <strong>otomatis LUNAS</strong> saat serah terima
            dibuat. Klik <strong>Belum Bayar</strong> hanya jika ada kupon yang
            sebenarnya tidak terbayar — sistem akan menghapus pembayaran tsb.
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
                {groupedRows.length} pelanggan • {filteredRows.length} batch
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
                    <TableHead className="text-center">Sisa</TableHead>
                    <TableHead className="text-right">Total Tagihan</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedRows.map((group) => {
                    const totalAmount = group.batches.reduce(
                      (s, b) => s + b.daily_amount * b.unpaid_count,
                      0,
                    );
                    const uniq = (arr: string[]) =>
                      Array.from(new Set(arr.filter(Boolean)));
                    const contractRefs = uniq(group.batches.map((b) => b.contract_ref));
                    const collectorNames = uniq(
                      group.batches.map((b) => b.collector_name || "-"),
                    );
                    const allPaid = group.batches.every((b) => b.status === "paid");
                    const allUnpaid = group.batches.every((b) => b.status === "unpaid");
                    const mergedStatus: "paid" | "unpaid" | "partial" = allPaid
                      ? "paid"
                      : allUnpaid
                        ? "unpaid"
                        : "partial";
                    const mergedRanges: RangeEditTarget[] = [];
                    const byContract = new Map<string, DueRow[]>();
                    for (const batch of group.batches) {
                      const arr = byContract.get(batch.contract_ref) || [];
                      arr.push(batch);
                      byContract.set(batch.contract_ref, arr);
                    }
                    for (const [ref, batches] of byContract.entries()) {
                      const sorted = [...batches].sort((a, b) => a.start_index - b.start_index);
                      let current = {
                        handover_ids: [sorted[0].handover_id],
                        contract_id: sorted[0].contract_id,
                        contract_ref: ref,
                        customer_name: group.customer_name,
                        collector_name: sorted[0].collector_name,
                        start_index: sorted[0].start_index,
                        end_index: sorted[0].end_index,
                      };

                      for (let i = 1; i < sorted.length; i++) {
                        const next = sorted[i];
                        if (next.start_index <= current.end_index + 1) {
                          current.end_index = Math.max(current.end_index, next.end_index);
                          current.handover_ids.push(next.handover_id);
                        } else {
                          mergedRanges.push({ ...current });
                          current = {
                            handover_ids: [next.handover_id],
                            contract_id: next.contract_id,
                            contract_ref: ref,
                            customer_name: group.customer_name,
                            collector_name: next.collector_name,
                            start_index: next.start_index,
                            end_index: next.end_index,
                          };
                        }
                      }
                      mergedRanges.push({ ...current });
                    }

                    return (
                      <TableRow key={group.customer_name}>
                        <TableCell className="font-mono text-sm">
                          {contractRefs.join(", ")}
                        </TableCell>
                        <TableCell className="font-medium">
                          {group.customer_name}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {collectorNames.join(", ")}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-wrap items-center justify-center gap-1">
                            {mergedRanges.map((m, i) => (
                              <div key={`${m.contract_ref}-${i}`} className="flex items-center gap-1">
                                <Badge
                                  variant="secondary"
                                  className="font-mono text-xs"
                                >
                                  {m.start_index}-{m.end_index}
                                </Badge>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[10px] text-orange-700 hover:text-orange-800 hover:bg-orange-100 dark:text-orange-300 dark:hover:bg-orange-900/30"
                                  onClick={() => openRangeEditDialog(m)}
                                >
                                  <Pencil className="mr-1 h-3 w-3" />
                                  Edit
                                </Button>
                              </div>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {mergedStatus === "paid" ? (
                            <Badge className="bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 hover:bg-emerald-500/20">
                              Lunas
                            </Badge>
                          ) : mergedStatus === "partial" ? (
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
                          <Badge
                            variant="outline"
                            className="text-destructive border-destructive/40"
                          >
                            {group.total_unpaid_count} kupon
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatRupiah(totalAmount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              openDialog(group.batches.filter((b) => b.paid_count > 0))
                            }
                            disabled={group.batches.every((b) => b.paid_count <= 0)}
                            className="gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Belum Bayar
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
              {selectedCustomer} • {selectedContractRefs}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kupon LUNAS:</span>
                  <span className="font-semibold">{selectedTotalPaid} kupon</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total nilai LUNAS:</span>
                  <span className="font-bold text-primary">
                    {formatRupiah(selectedTotalAmount)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="returned-count" className="text-sm font-medium">
                  Jumlah Kupon yang BELUM TERBAYAR
                </Label>
                <Input
                  id="returned-count"
                  type="number"
                  min={0}
                  max={selectedTotalPaid}
                  value={returnedCount}
                  onChange={(e) =>
                    setReturnedCount(
                      Math.max(
                        0,
                        Math.min(
                          selectedTotalPaid,
                          parseInt(e.target.value) || 0,
                        ),
                      ),
                    )
                  }
                  className="text-center font-semibold text-lg"
                />
                <p className="text-xs text-muted-foreground">
                  Default = semua kupon lunas akan di-rollback menjadi{" "}
                  <strong>belum bayar</strong>. Sistem akan memproses dari kupon
                  terakhir. Pembayaran otomatis untuk kupon tsb akan dihapus.
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
                    <span>Tetap LUNAS:</span>
                    <span className="font-semibold">
                      {selectedTotalPaid - returnedCount} kupon
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Di-rollback (belum bayar):</span>
                    <span className="font-semibold">
                      {returnedCount} kupon
                    </span>
                  </div>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="extra-note" className="text-sm font-medium">
                  Catatan <span className="text-xs text-muted-foreground font-normal">(opsional)</span>
                </Label>
                <Textarea
                  id="extra-note"
                  value={extraNote}
                  onChange={(e) => setExtraNote(e.target.value)}
                  placeholder="Tambahkan alasan atau keterangan tambahan..."
                  rows={3}
                />
              </div>
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

      <Dialog open={!!rangeEditTarget} onOpenChange={(o) => !o && closeRangeEditDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-orange-600" />
              Edit Range Kupon
            </DialogTitle>
            <DialogDescription>
              {rangeEditTarget
                ? `${rangeEditTarget.contract_ref} • ${rangeEditTarget.customer_name}`
                : "Pilih range untuk diubah"}
            </DialogDescription>
          </DialogHeader>

          {rangeEditTarget && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Range aktif:</span>
                  <span className="font-semibold font-mono">
                    {rangeEditTarget.start_index}-{rangeEditTarget.end_index}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Kolektor:</span>
                  <span className="font-semibold">{rangeEditTarget.collector_name || "-"}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="range-edit-start" className="text-sm font-medium">
                    Kupon Awal (dipertahankan)
                  </Label>
                  <Input
                    id="range-edit-start"
                    type="number"
                    min={1}
                    value={rangeEditStart}
                    onChange={(e) => setRangeEditStart(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="range-edit-end" className="text-sm font-medium">
                    Kupon Akhir (dipertahankan)
                  </Label>
                  <Input
                    id="range-edit-end"
                    type="number"
                    min={rangeEditStart}
                    value={rangeEditEnd}
                    onChange={(e) =>
                      setRangeEditEnd(Math.max(rangeEditStart, parseInt(e.target.value) || rangeEditStart))
                    }
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Kupon di luar range baru ini akan dihapus dari serah terima &amp; pembayaran.
                Contoh: range lama 1-38 diubah menjadi 1-35 → kupon 36-38 di-reset,
                form serah terima otomatis lanjut ke kupon 36.
              </p>

              <div className="space-y-2">
                <Label htmlFor="range-edit-password" className="text-sm font-medium">
                  Password Admin
                </Label>
                <Input
                  id="range-edit-password"
                  type="password"
                  value={rangeEditPassword}
                  onChange={(e) => setRangeEditPassword(e.target.value)}
                  placeholder="Masukkan password admin"
                  autoComplete="current-password"
                />
                <p className="text-xs text-muted-foreground">
                  Password diverifikasi terhadap admin password yang tersimpan di sistem.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="range-edit-reason" className="text-sm font-medium">
                  Alasan Koreksi <span className="text-xs text-muted-foreground font-normal">(opsional)</span>
                </Label>
                <Textarea
                  id="range-edit-reason"
                  value={rangeEditReason}
                  onChange={(e) => setRangeEditReason(e.target.value)}
                  placeholder="Contoh: koreksi kelebihan input pembayaran / voucher"
                  rows={3}
                />
              </div>

              <Alert>
                <AlertDescription>
                  Sistem akan menghapus pembayaran pada range ini, mengembalikan status kupon,
                  lalu menghitung ulang status kontrak dan saldo.
                </AlertDescription>
              </Alert>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeRangeEditDialog} disabled={rangeEditSubmitting}>
              Batal
            </Button>
            <Button onClick={handleRangeEditSubmit} disabled={rangeEditSubmitting} variant="destructive">
              {rangeEditSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
