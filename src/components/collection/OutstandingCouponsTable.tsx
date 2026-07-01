import { useState } from "react";
import { FileX, Download, Clock, UserCheck, ArrowRight, CheckCircle2, AlertTriangle, BarChart3, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/TablePagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { formatRupiah, formatDate } from "@/lib/format";
import { usePagination } from "@/hooks/usePagination";
import { exportHandoversToExcel } from "@/lib/exportOutstandingCoupons";
import { toast } from "sonner";
import { SearchInput } from "@/components/ui/search-input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CouponHandover } from "@/hooks/useCouponHandovers";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useLogActivity } from "@/hooks/useActivityLog";

interface Props {
  data?: unknown;
  isLoading: boolean;
  handovers?: CouponHandover[];
  // callback when a contract row is selected from the list
  onSelect?: (contractId?: string) => void;
}

export type HandoverStatus = 'fully_paid' | 'partially_paid' | 'unpaid';

export function getHandoverStatus(handover: CouponHandover) {
  const currentIndex = handover.credit_contracts?.current_installment_index || 0;
  const paidInRange = Math.max(0, Math.min(currentIndex, handover.end_index) - handover.start_index + 1);
  const unpaidInRange = handover.coupon_count - Math.max(0, paidInRange);

  let status: HandoverStatus = 'unpaid';
  if (paidInRange >= handover.coupon_count) status = 'fully_paid';
  else if (paidInRange > 0) status = 'partially_paid';

  return { paidInRange: Math.max(0, paidInRange), unpaidInRange: Math.max(0, unpaidInRange), status };
}

/* ─── Status Badge ─── */
function StatusBadge({ status }: { status: HandoverStatus }) {
  if (status === 'fully_paid') {
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800 text-sm px-2.5 py-0.5">Lunas</Badge>;
  }
  if (status === 'partially_paid') {
    return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800 text-sm px-2.5 py-0.5">Sebagian</Badge>;
  }
  return <Badge variant="destructive" className="text-sm px-2.5 py-0.5">Belum</Badge>;
}

/* ─── Main Component ─── */
export function OutstandingCouponsTable({ isLoading, handovers }: Props) {
  const queryClient = useQueryClient();
  const logActivity = useLogActivity();
  const [searchQuery, setSearchQuery] = useState("");
  // Default: hanya tampilkan yang belum bayar (sebagian/belum). Yang lunas disembunyikan
  // — sudah tersedia di Excel "Export Per Kolektor" pada tab Input Pembayaran.
  const [statusFilter, setStatusFilter] = useState<string>("unpaid_only");

  // Hapus serah terima state
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    contract_id: string;
    contract_ref: string;
    customer_name: string;
    start_index: number;
    end_index: number;
  } | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const closeDeleteDialog = () => {
    setDeleteTarget(null);
    setDeletePassword("");
    setDeleteReason("");
  };

  const handleDeleteSubmit = async () => {
    if (!deleteTarget) return;
    if (!deletePassword.trim()) {
      toast.error("Password admin wajib diisi");
      return;
    }
    setDeleteSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email;
      if (!email) {
        toast.error("Sesi tidak valid, silakan login ulang");
        setDeleteSubmitting(false);
        return;
      }
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email,
        password: deletePassword,
      });
      if (verifyErr) {
        toast.error("Password salah");
        setDeleteSubmitting(false);
        return;
      }

      const { start_index: startIdx, end_index: endIdx, contract_id: contractId } = deleteTarget;

      const { error: delErr } = await supabase
        .from("coupon_handovers").delete().eq("id", deleteTarget.id);
      if (delErr) throw delErr;

      const { error: delPayErr } = await supabase
        .from("payment_logs").delete()
        .eq("contract_id", contractId)
        .gte("installment_index", startIdx)
        .lte("installment_index", endIdx);
      if (delPayErr) throw delPayErr;

      const { error: updCouponErr } = await supabase
        .from("installment_coupons").update({ status: "unpaid" })
        .eq("contract_id", contractId)
        .gte("installment_index", startIdx)
        .lte("installment_index", endIdx);
      if (updCouponErr) throw updCouponErr;

      const newCurrent = Math.max(0, startIdx - 1);
      const { error: updContractErr } = await supabase
        .from("credit_contracts")
        .update({ current_installment_index: newCurrent, status: "active" })
        .eq("id", contractId);
      if (updContractErr) throw updContractErr;

      logActivity.mutate({
        action: "DAILY_COLLECTION",
        entity_type: "coupon_handover",
        entity_id: null,
        description:
          `Hapus serah terima kupon ${deleteTarget.contract_ref} (${deleteTarget.customer_name}) ` +
          `range ${startIdx}-${endIdx} — form serah terima kembali ke ${startIdx}` +
          (deleteReason.trim() ? ` — Alasan: ${deleteReason.trim()}` : ""),
        contract_id: contractId,
      });

      queryClient.invalidateQueries({ queryKey: ["coupon_handovers"] });
      queryClient.invalidateQueries({ queryKey: ["outstanding_coupons"] });
      queryClient.invalidateQueries({ queryKey: ["credit_contracts"] });
      queryClient.invalidateQueries({ queryKey: ["installment_coupons"] });
      queryClient.invalidateQueries({ queryKey: ["payment_logs"] });
      queryClient.invalidateQueries({ queryKey: ["aggregated_payments"] });
      queryClient.invalidateQueries({ queryKey: ["monthly_performance_contract_v5"] });
      queryClient.invalidateQueries({ queryKey: ["yearly_financial_summary_contract_v5"] });

      toast.success(
        `Serah terima ${deleteTarget.contract_ref} range ${startIdx}-${endIdx} dihapus, form kembali ke kupon ${startIdx}`,
      );
      closeDeleteDialog();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Terjadi kesalahan";
      toast.error(`Gagal menghapus kupon: ${msg}`);
    } finally {
      setDeleteSubmitting(false);
    }
  };


  // Enrich handovers with status
  const enrichedHandovers = (handovers || []).map(h => ({
    ...h,
    ...getHandoverStatus(h),
  }));

  // Filter
  const filteredHandovers = enrichedHandovers.filter(h => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      const name = h.credit_contracts?.customers?.name || '';
      const ref = h.credit_contracts?.contract_ref || '';
      const collector = h.collectors?.name || '';
      if (!name.toLowerCase().includes(q) && !ref.toLowerCase().includes(q) && !collector.toLowerCase().includes(q)) return false;
    }
    if (statusFilter === 'unpaid_only') {
      if (h.status === 'fully_paid') return false;
    } else if (statusFilter !== 'all' && h.status !== statusFilter) return false;
    return true;
  });

  const ITEMS_PER_PAGE = 15;
  const { paginatedItems, currentPage, goToPage, totalPages, totalItems } = usePagination(filteredHandovers, ITEMS_PER_PAGE);

  // Stats
  const allHandovers = enrichedHandovers;
  const totalCoupons = allHandovers.reduce((s, h) => s + h.coupon_count, 0);
  const totalPaid = allHandovers.reduce((s, h) => s + h.paidInRange, 0);
  const totalUnpaid = allHandovers.reduce((s, h) => s + h.unpaidInRange, 0);
  const totalAmount = allHandovers.reduce((s, h) => s + h.coupon_count * (h.credit_contracts?.daily_installment_amount || 0), 0);
  const totalPaidAmount = allHandovers.reduce((s, h) => s + h.paidInRange * (h.credit_contracts?.daily_installment_amount || 0), 0);
  const totalUnpaidAmount = totalAmount - totalPaidAmount;
  const collectionRate = totalCoupons > 0 ? (totalPaid / totalCoupons) * 100 : 0;
  const fullyPaidCount = allHandovers.filter(h => h.status === 'fully_paid').length;
  const partialCount = allHandovers.filter(h => h.status === 'partially_paid').length;
  const unpaidCount = allHandovers.filter(h => h.status === 'unpaid').length;

  const handleExport = async () => {
    if (filteredHandovers.length === 0) return;
    try {
      await exportHandoversToExcel(filteredHandovers);
      toast.success("File Excel berhasil diunduh");
    } catch {
      toast.error("Gagal mengekspor Excel");
    }
  };

  /* ─── Loading State ─── */
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="border rounded-lg">
          <Table>
            <TableHeader><TableRow>
              {[...Array(6)].map((_, j) => <TableHead key={j}><Skeleton className="h-4 w-16" /></TableHead>)}
            </TableRow></TableHeader>
            <TableBody>
              {[...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  {[...Array(6)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  /* ─── Summary Cards ─── */
  const SummaryCards = () => (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card className="shadow-sm border-l-4 border-l-destructive">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <p className="text-sm font-medium text-muted-foreground">Belum Tertagih</p>
          </div>
          <p className="text-xl font-bold tracking-tight text-destructive">{formatRupiah(totalUnpaidAmount)}</p>
          <p className="text-xs text-muted-foreground">{totalUnpaid} kupon • {unpaidCount + partialCount} batch</p>
        </CardContent>
      </Card>

      <Card className="shadow-sm border-l-4 border-l-green-500">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <p className="text-sm font-medium text-muted-foreground">Tertagih</p>
          </div>
          <p className="text-xl font-bold tracking-tight">{formatRupiah(totalPaidAmount)}</p>
          <p className="text-xs text-muted-foreground">{totalPaid} kupon • {fullyPaidCount} batch lunas</p>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className={cn("h-4 w-4", collectionRate >= 80 ? "text-green-600 dark:text-green-400" : collectionRate >= 50 ? "text-yellow-600 dark:text-yellow-400" : "text-destructive")} />
            <p className="text-sm font-medium text-muted-foreground">Tingkat Tagih</p>
          </div>
          <p className="text-xl font-bold tracking-tight">{collectionRate.toFixed(1)}%</p>
          <Progress value={collectionRate} className="h-2 mt-1.5" />
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium text-muted-foreground">Total Serah Terima</p>
          </div>
          <p className="text-xl font-bold tracking-tight">{allHandovers.length}</p>
          <p className="text-xs text-muted-foreground">{totalCoupons} kupon diserahkan</p>
        </CardContent>
      </Card>
    </div>
  );

  /* ─── Filters ─── */
  const FiltersRow = () => (
    <div className="flex flex-col sm:flex-row gap-2">
      <div className="flex-1">
        <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Cari konsumen, kontrak, atau kolektor..." />
      </div>
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-full sm:w-52">
          <SelectValue placeholder="Semua Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unpaid_only">Belum Bayar Saja ({unpaidCount + partialCount})</SelectItem>
          <SelectItem value="all">Semua ({allHandovers.length})</SelectItem>
          <SelectItem value="fully_paid">Lunas ({fullyPaidCount})</SelectItem>
          <SelectItem value="partially_paid">Sebagian ({partialCount})</SelectItem>
          <SelectItem value="unpaid">Belum Bayar ({unpaidCount})</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  /* ─── Empty State ─── */
  if (!handovers || allHandovers.length === 0) {
    return (
      <div className="space-y-4">
        <FiltersRow />
        <div className="border rounded-lg p-10">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-muted p-3 mb-3">
              <FileX className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-base mb-1">Belum Ada Serah Terima Kupon</h3>
            <p className="text-muted-foreground text-sm max-w-xs">
              Gunakan form di atas untuk mencatat serah terima kupon ke kolektor.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (filteredHandovers.length === 0) {
    return (
      <div className="space-y-4">
        <SummaryCards />
        <FiltersRow />
        <div className="border rounded-lg p-10">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-muted p-3 mb-3">
              <FileX className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-base mb-1">Tidak Ada Data</h3>
            <p className="text-muted-foreground text-sm max-w-xs">
              Tidak ada data yang cocok dengan filter pencarian.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Filtered totals
  const fCoupons = filteredHandovers.reduce((s, h) => s + h.coupon_count, 0);
  const fPaid = filteredHandovers.reduce((s, h) => s + h.paidInRange, 0);
  const fUnpaid = filteredHandovers.reduce((s, h) => s + h.unpaidInRange, 0);
  const fTotal = filteredHandovers.reduce((s, h) => s + h.coupon_count * (h.credit_contracts?.daily_installment_amount || 0), 0);
  const fPaidAmt = filteredHandovers.reduce((s, h) => s + h.paidInRange * (h.credit_contracts?.daily_installment_amount || 0), 0);

  return (
    <div className="space-y-4">
      <SummaryCards />
      <FiltersRow />

      {/* ─── Unified Table ─── */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-10 text-sm">No</TableHead>
              <TableHead className="text-sm">Tanggal</TableHead>
              <TableHead className="text-sm">Kolektor</TableHead>
              <TableHead className="text-sm">Konsumen / Kontrak</TableHead>
              <TableHead className="text-sm text-center">Kupon</TableHead>
              <TableHead className="text-sm text-center">Status</TableHead>
              <TableHead className="text-sm text-right">Nominal</TableHead>
              <TableHead className="text-sm text-center w-16">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedItems.map((h, i) => {
              const amt = h.credit_contracts?.daily_installment_amount || 0;
              const total = h.coupon_count * amt;
              const paidAmt = h.paidInRange * amt;
              const rate = h.coupon_count > 0 ? (h.paidInRange / h.coupon_count) * 100 : 0;

              return (
                  <TableRow
                    key={h.id}
                    className="hover:bg-muted/30"
                  >
                  <TableCell className="text-sm text-muted-foreground py-3">
                    {(currentPage - 1) * ITEMS_PER_PAGE + i + 1}
                  </TableCell>

                  <TableCell className="py-3">
                    <p className="text-sm font-medium">{formatDate(h.handover_date)}</p>
                  </TableCell>

                  <TableCell className="py-3">
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 text-primary shrink-0" />
                      <div>
                        <p className="text-sm font-medium leading-tight">{h.collectors?.name}</p>
                        <span className="text-xs text-muted-foreground">{h.collectors?.collector_code}</span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="py-3">
                    <p className="text-base font-medium leading-tight">{h.credit_contracts?.customers?.name || '-'}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="font-mono text-xs px-1.5 py-0">{h.credit_contracts?.contract_ref}</Badge>
                      <span className="text-xs text-muted-foreground">{formatRupiah(amt)}/hari</span>
                    </div>
                  </TableCell>

                  <TableCell className="text-center py-3">
                    <Badge variant="secondary" className="font-mono text-xs px-2 py-0.5">{h.start_index}-{h.end_index}</Badge>
                    <p className="text-xs text-muted-foreground mt-0.5">{h.coupon_count} kupon</p>
                  </TableCell>

                  <TableCell className="text-center py-3">
                    <div className="flex flex-col items-center gap-1">
                      <StatusBadge status={h.status} />
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-green-600 dark:text-green-400 font-medium">{h.paidInRange}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <span className="text-destructive font-medium">{h.unpaidInRange}</span>
                      </div>
                      <Progress value={rate} className="h-1.5 w-16" />
                    </div>
                  </TableCell>

                  <TableCell className="text-right py-3">
                    <p className="text-sm font-bold">{formatRupiah(total)}</p>
                    <p className="text-xs text-green-600 dark:text-green-400">{formatRupiah(paidAmt)} tertagih</p>
                    {h.unpaidInRange > 0 && (
                      <p className="text-xs text-destructive">{formatRupiah(total - paidAmt)} sisa</p>
                    )}
                  </TableCell>

                  <TableCell className="text-center py-3">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                      title="Hapus serah terima"
                      onClick={() => {
                        setDeleteTarget({
                          id: h.id,
                          contract_id: h.contract_id,
                          contract_ref: h.credit_contracts?.contract_ref || '-',
                          customer_name: h.credit_contracts?.customers?.name || '-',
                          start_index: h.start_index,
                          end_index: h.end_index,
                        });
                        setDeletePassword("");
                        setDeleteReason("");
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}

            {/* Footer */}
            <TableRow className="bg-muted/50 font-semibold border-t-2">
              <TableCell colSpan={4} className="text-right text-sm py-3">TOTAL</TableCell>
              <TableCell className="text-center text-sm py-3">{fCoupons} kupon</TableCell>
              <TableCell className="text-center py-3">
                <span className="text-sm text-green-600 dark:text-green-400">{fPaid}</span>
                <span className="text-sm text-muted-foreground"> / </span>
                <span className="text-sm text-destructive">{fUnpaid}</span>
              </TableCell>
              <TableCell className="text-right py-3">
                <p className="text-sm">{formatRupiah(fTotal)}</p>
                <p className="text-xs text-destructive">{formatRupiah(fTotal - fPaidAmt)} sisa</p>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <TablePagination currentPage={currentPage} totalPages={totalPages} onPageChange={goToPage} totalItems={totalItems} />
      )}
    </div>
  );
}
