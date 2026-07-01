import { useState, useEffect, useMemo } from "react";
import { FileText, CreditCard, AlertCircle, TrendingUp, Download, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

import { useCollectors } from "@/hooks/useCollectors";
import { useContracts } from "@/hooks/useContracts";
import { useSalesAgents } from "@/hooks/useSalesAgents";
import { useCreatePayment, useCreateBulkPayment, usePayments } from "@/hooks/usePayments";
import { usePagination } from "@/hooks/usePagination";
import { useCreateCouponHandover, useCouponHandovers } from "@/hooks/useCouponHandovers";
import { ManifestFilters } from "@/components/collection/ManifestFilters";
import { ManifestTable } from "@/components/collection/ManifestTable";
import { DailyDueList } from "@/components/collection/DailyDueList";
import { DailyProfitList } from "@/components/collection/DailyProfitList";
import { CollectorDailyPerformance } from "@/components/collection/CollectorDailyPerformance";
import { SearchInput } from "@/components/ui/search-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePaymentsByContract } from "@/hooks/usePayments";
import { OutstandingCouponsTable } from "@/components/collection/OutstandingCouponsTable";
import { HandoverCouponForm } from "@/components/collection/HandoverCouponForm";
import { addToQueue } from "@/lib/offlineQueue";
import { notifyQueueUpdated } from "@/hooks/useOfflineQueue";
import { exportHandoverPerCollectorDaily } from "@/lib/exportHandoverPerCollectorDaily";
import { exportPaymentPerCollectorDaily } from "@/lib/exportPaymentPerCollectorDaily";
import { useContractStatusMap } from '@/hooks/useContractStatusMap';

export default function Collection() {
  // Manifest state (declared first so hooks below can use them)
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("paid");

  const { data: collectors } = useCollectors();
  const { data: contracts, isLoading: contractsLoading } = useContracts("active");
  const { data: salesAgents } = useSalesAgents();
  const { data: payments, isLoading: paymentsLoading } = usePayments(selectedDate, selectedDate);
  const createPayment = useCreatePayment();
  const createBulkPayment = useCreateBulkPayment();
  const createHandover = useCreateCouponHandover();
  const { data: handovers, isLoading: handoversLoading } = useCouponHandovers(selectedDate);
  const { data: contractStatusMap } = useContractStatusMap();
  // Selected contract id for payment form (lifted state to allow selection from search results)
  const [paymentSelectedContract, setPaymentSelectedContract] = useState("");
  // Sort states per tab
  const [manifestSort, setManifestSort] = useState<string>("contract_ref");
  const [paymentSort, setPaymentSort] = useState<string>("handover_date");
  const [outstandingSort, setOutstandingSort] = useState<string>("handover_date");

  // Filter contracts for manifest
  const manifestContracts = contracts?.filter((c) => {
    if (!c.customers) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase().trim();
      if (query) {
        // Search by contract_ref or customer name
        return (
          c.contract_ref.toLowerCase().includes(query) ||
          c.customers.name.toLowerCase().includes(query)
        );
      }
    }
    return true;
  }) || [];

  // Apply sorting to manifest contracts
  const sortedManifestContracts = useMemo(() => {
    const arr = [...manifestContracts];
    switch (manifestSort) {
      case 'customer_name':
        return arr.sort((a: any, b: any) => (a.customers?.name || '').localeCompare(b.customers?.name || ''));
      case 'start_date':
        return arr.sort((a: any, b: any) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());
      case 'amount_asc':
        return arr.sort((a: any, b: any) => (Number(a.total_loan_amount || 0) - Number(b.total_loan_amount || 0)));
      case 'amount_desc':
        return arr.sort((a: any, b: any) => (Number(b.total_loan_amount || 0) - Number(a.total_loan_amount || 0)));
      default:
        return arr.sort((a: any, b: any) => a.contract_ref.localeCompare(b.contract_ref));
    }
  }, [manifestContracts, manifestSort]);

  // Pagination for manifest
  const MANIFEST_ITEMS_PER_PAGE = 10;
  const {
    paginatedItems: paginatedManifestContracts,
    currentPage: manifestPage,
    goToPage: setManifestPage,
    totalPages: manifestTotalPages,
    totalItems: manifestTotalItems,
  } = usePagination(sortedManifestContracts, MANIFEST_ITEMS_PER_PAGE);
  // Use pagination over the sorted list
  // (replace previous pagination source)

  // Reset pagination when filters change
  useEffect(() => {
    setManifestPage(1);
  }, [searchQuery, setManifestPage]);

  const handleSubmitPayment = async (data: {
    contract_id: string;
    payment_date: string;
    installment_index: number;
    amount_paid: number;
    collector_id: string | null;
    notes: string;
  }) => {
    if (!navigator.onLine) {
  addToQueue('payment', data as unknown as Record<string, unknown>);
  notifyQueueUpdated();
  toast.info(`Pembayaran kupon ${data.installment_index} disimpan offline. Akan disinkronkan saat online.`);
      return;
    }
    try {
      await createPayment.mutateAsync(data);
  toast.success(`Pembayaran kupon ${data.installment_index} berhasil dicatat`);
    } catch {
      // Fallback to offline queue on network error
      addToQueue('payment', data as unknown as Record<string, unknown>);
      notifyQueueUpdated();
      toast.info("Koneksi gagal. Pembayaran disimpan offline.");
    }
  };

  const handleBulkSubmitPayment = async (data: {
    contract_id: string;
    payment_date: string;
    start_index: number;
    coupon_count: number;
    amount_per_coupon: number;
    collector_id: string | null;
    notes: string;
  }) => {
    if (!navigator.onLine) {
  addToQueue('bulk_payment', data as unknown as Record<string, unknown>);
  notifyQueueUpdated();
  const endIndex = data.start_index + data.coupon_count - 1;
  toast.info(`Pembayaran kupon ${data.start_index}-${endIndex} disimpan offline.`);
      return;
    }
    try {
      await createBulkPayment.mutateAsync(data);
  const endIndex = data.start_index + data.coupon_count - 1;
  toast.success(`Pembayaran kupon ${data.start_index}-${endIndex} (${data.coupon_count} kupon) berhasil dicatat`);
    } catch {
      addToQueue('bulk_payment', data as unknown as Record<string, unknown>);
      notifyQueueUpdated();
      toast.info("Koneksi gagal. Pembayaran disimpan offline.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Penagihan</h1>
        <p className="text-muted-foreground">Kelola manifest penagihan dan input pembayaran</p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="manifest" className="w-full">
        <TabsList className="grid w-full grid-cols-5 max-w-4xl">
          <TabsTrigger value="manifest" className="gap-2">
            <FileText className="h-4 w-4" />
            Manifest
          </TabsTrigger>
          <TabsTrigger value="payment" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Input Pembayaran
          </TabsTrigger>
          <TabsTrigger value="outstanding" className="gap-2">
            <AlertCircle className="h-4 w-4" />
            Belum Bayar
          </TabsTrigger>
          <TabsTrigger value="profit" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Keuntungan Harian
          </TabsTrigger>
          <TabsTrigger value="collector" className="gap-2">
            <Users className="h-4 w-4" />
            Performa Kolektor
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manifest" className="space-y-4 mt-6">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <ManifestFilters
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                contractCount={manifestContracts.length}
              />
            </div>
            <div className="w-56">
              <label className="text-sm text-muted-foreground">Urutkan</label>
              <Select value={manifestSort} onValueChange={(v) => setManifestSort(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Urutkan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contract_ref">Kode Kontrak</SelectItem>
                  <SelectItem value="customer_name">Nama Pelanggan</SelectItem>
                  <SelectItem value="start_date">Tanggal Mulai</SelectItem>
                  <SelectItem value="amount_desc">Nominal (Terbesar)</SelectItem>
                  <SelectItem value="amount_asc">Nominal (Terkecil)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <ManifestTable
            contracts={sortedManifestContracts}
            paginatedContracts={paginatedManifestContracts}
            isLoading={contractsLoading}
            currentPage={manifestPage}
            totalPages={manifestTotalPages}
            totalItems={manifestTotalItems}
            onPageChange={setManifestPage}
            searchQuery={searchQuery}
            outstandingData={undefined}
          />
        </TabsContent>

        <TabsContent value="payment" className="mt-6">
          <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
            <div className="flex items-end gap-4">
              <div className="w-48">
                <label className="text-sm text-muted-foreground">Pilih Tanggal</label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="w-56">
                <label className="text-sm text-muted-foreground">Filter Status Pembayaran</label>
                <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Filter Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unpaid">Belum Bayar</SelectItem>
                    <SelectItem value="partial">Sebagian Bayar</SelectItem>
                    <SelectItem value="paid">Lunas</SelectItem>
                    <SelectItem value="all">Semua</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  const hasData = (payments && payments.length > 0) || (handovers && handovers.length > 0);
                  if (!hasData) {
                    toast.error("Tidak ada data untuk diexport");
                    return;
                  }
                  try {
                    exportPaymentPerCollectorDaily(payments, contracts || [], selectedDate, handovers || [], contractStatusMap as any);
                    toast.success("Export pembayaran per kolektor berhasil");
                  } catch (error) {
                    toast.error("Gagal export pembayaran per kolektor");
                    console.error(error);
                  }
                }}
                disabled={paymentsLoading || handoversLoading}
              >
                <Download className="mr-2 h-4 w-4" /> Export Per Kolektor
              </Button>
            </div>
          </div>
          
          <DailyDueList
            selectedDate={selectedDate}
            statusFilter={paymentStatusFilter as "unpaid" | "partial" | "paid" | "all"}
          />
        </TabsContent>

        <TabsContent value="outstanding" className="space-y-6 mt-6">
          <HandoverCouponForm
            contracts={contracts}
            collectors={collectors}
            onSubmit={async (data) => {
              try {
                await createHandover.mutateAsync(data);
                toast.success(`Serah terima ${data.coupon_count} kupon berhasil dicatat`);
              } catch (error) {
                const message = error instanceof Error ? error.message : "Gagal menyimpan serah terima";
                toast.error(message);
              }
            }}
            isSubmitting={createHandover.isPending}
          />
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-48">
                <label className="text-sm text-muted-foreground">Pilih Tanggal</label>
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  if (!handovers || handovers.length === 0) {
                    toast.error("Tidak ada data serah terima untuk diexport");
                    return;
                  }
                  try {
                    const enriched = (handovers || []).map((h: any) => {
                      const currentIndex = h.credit_contracts?.current_installment_index || 0;
                      const paidInRange = Math.max(0, Math.min(currentIndex, h.end_index) - h.start_index + 1);
                      const unpaidInRange = h.coupon_count - Math.max(0, paidInRange);
                      const daily = h.credit_contracts?.daily_installment_amount || 0;
                      return { ...h, _paidInRange: paidInRange, _unpaidInRange: unpaidInRange, _unpaidAmount: unpaidInRange * daily };
                    });
                    exportHandoverPerCollectorDaily(enriched as any, selectedDate);
                    toast.success("Export serah terima per kolektor berhasil");
                  } catch (error) {
                    toast.error("Gagal export serah terima per kolektor");
                    console.error(error);
                  }
                }}
                disabled={handoversLoading}
                className="mt-6"
              >
                <Download className="mr-2 h-4 w-4" /> Export Per Kolektor
              </Button>
            </div>
            <div className="w-56">
              <label className="text-sm text-muted-foreground">Urutkan</label>
              <Select value={outstandingSort} onValueChange={(v) => setOutstandingSort(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Urutkan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="handover_date">Tanggal Serah Terima</SelectItem>
                  <SelectItem value="customer_name">Nama Pelanggan</SelectItem>
                  <SelectItem value="contract_ref">Kode Kontrak</SelectItem>
                  <SelectItem value="amount_unpaid_desc">Jumlah Sisa (Terbesar)</SelectItem>
                  <SelectItem value="amount_unpaid_asc">Jumlah Sisa (Terkecil)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {handoversLoading ? (
            <div className="p-6">
              <p className="text-sm text-muted-foreground">Memuat data serah terima...</p>
            </div>
          ) : (handovers && handovers.length > 0) ? (
            <OutstandingCouponsTable
              isLoading={false}
              handovers={(() => {
                const enriched = (handovers || []).map((h: any) => {
                  const currentIndex = h.credit_contracts?.current_installment_index || 0;
                  const paidInRange = Math.max(0, Math.min(currentIndex, h.end_index) - h.start_index + 1);
                  const unpaidInRange = h.coupon_count - Math.max(0, paidInRange);
                  const daily = h.credit_contracts?.daily_installment_amount || 0;
                  return { ...h, _paidInRange: paidInRange, _unpaidInRange: unpaidInRange, _unpaidAmount: unpaidInRange * daily };
                });
                const arr = [...enriched];
                switch (outstandingSort) {
                  case 'customer_name':
                    arr.sort((a, b) => (a.credit_contracts?.customers?.name || '').localeCompare(b.credit_contracts?.customers?.name || ''));
                    break;
                  case 'contract_ref':
                    arr.sort((a, b) => (a.credit_contracts?.contract_ref || '').localeCompare(b.credit_contracts?.contract_ref || ''));
                    break;
                  case 'amount_unpaid_desc':
                    arr.sort((a, b) => (b._unpaidAmount - a._unpaidAmount));
                    break;
                  case 'amount_unpaid_asc':
                    arr.sort((a, b) => (a._unpaidAmount - b._unpaidAmount));
                    break;
                  default:
                    arr.sort((a, b) => new Date(b.handover_date).getTime() - new Date(a.handover_date).getTime());
                }
                return arr;
              })()}
            />
          ) : (
            <div className="p-6">
              <p className="text-sm text-muted-foreground">Belum ada serah terima kupon</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="profit" className="mt-6">
          <DailyProfitList />
        </TabsContent>

        <TabsContent value="collector" className="mt-6">
          <CollectorDailyPerformance />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// --- Small helper component to render payments for a contract ---
function ContractPayments({ contractId }: { contractId: string }) {
  const { data: payments, isLoading } = usePaymentsByContract(contractId);

  if (isLoading) return <div className="text-sm text-muted-foreground">Memuat riwayat...</div>;
  if (!payments || payments.length === 0) return <div className="text-sm text-muted-foreground">Belum ada pembayaran tercatat.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="pb-2">Tanggal</th>
            <th className="pb-2">Kupon</th>
            <th className="pb-2 text-right">Jumlah</th>
            <th className="pb-2">Kolektor</th>
            <th className="pb-2">Catatan</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p: any) => (
            <tr key={p.id} className="border-t">
              <td className="py-2 align-top">{new Date(p.payment_date).toLocaleDateString('id-ID')}</td>
              <td className="py-2 align-top">{p.installment_index}</td>
              <td className="py-2 align-top text-right">{p.amount_paid?.toLocaleString ? p.amount_paid.toLocaleString() : p.amount_paid}</td>
              <td className="py-2 align-top">{p.collectors?.name || '-'}</td>
              <td className="py-2 align-top">{p.notes || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
