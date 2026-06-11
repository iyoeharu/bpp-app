import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCustomers } from "@/hooks/useCustomers";
import { useContracts } from "@/hooks/useContracts";
import { usePaymentsByContract } from "@/hooks/usePayments";
import { useCouponsByContract } from "@/hooks/useInstallmentCoupons";
import { useContractStatusMap } from "@/hooks/useContractStatusMap";
import { formatRupiah, formatDate } from "@/lib/format";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { ScrollArea } from "@/components/ui/scroll-area";
import { differenceInDays } from "date-fns";
import { 
  calculateDaysSinceLastPayment, 
  determineContractStatus,
  getStatusLabel,
  getStatusBadgeClass,
  ContractStatus
} from "@/lib/statusCalculation";

type ContractStatusFilter = 'all' | 'sangat_lancar' | 'lancar' | 'kurang_lancar' | 'macet' | 'completed';

export default function CustomerHistory() {
  const { data: customers } = useCustomers();
  const { data: contracts } = useContracts();
  const { data: statusMap } = useContractStatusMap();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<ContractStatusFilter>('all');

  // Helper: ambil status real-time dari statusMap (sumber kebenaran).
  // Saat map belum siap, gunakan heuristik berbasis createdAt agar tidak
  // salah label sebagai 'sangat_lancar'.
  const getStatus = (contract: { id: string; status: string; current_installment_index: number; created_at: string }): ContractStatus => {
    const info = statusMap?.get(contract.id);
    if (info) return info.status;
    if (contract.status === 'completed') return 'completed';
    // Fallback aman: pakai aturan determineContractStatus dgn createdAt
    return determineContractStatus({
      status: contract.status,
      lateDays: 0,
      daysSinceLastPayment: 0,
      createdAt: contract.created_at,
    });
  };

  // Filter customers based on search term AND status filter
  const filteredCustomers = useMemo(() => {
    if (!customers || !contracts) return [];
    
    const query = searchTerm.toLowerCase();
    
    return customers.filter((customer) => {
      // Check name, phone, OR contract_ref search
      const customerContractsAll = contracts.filter(c => c.customer_id === customer.id);
      const matchesSearch = !query ||
        customer.name.toLowerCase().includes(query) ||
        (customer.phone || '').toLowerCase().includes(query) ||
        customerContractsAll.some(c => (c.contract_ref || '').toLowerCase().includes(query));
      if (!matchesSearch) return false;
      
      // If status filter is 'all', include all customers matching search
      if (statusFilter === 'all') return true;
      
      // Check if customer has any contract matching the status filter
      const customerContracts = contracts.filter(c => c.customer_id === customer.id);
      return customerContracts.some(contract => {
        const dynamicStatus = getStatus(contract);
        return dynamicStatus === statusFilter;
      });
    });
  }, [customers, contracts, searchTerm, statusFilter, statusMap]);

  // Filter contracts for selected customer based on status filter
  const customerContracts = useMemo(() => {
    if (!contracts || !selectedCustomerId) return [];
    
    const filtered = contracts.filter(c => c.customer_id === selectedCustomerId);
    
    if (statusFilter === 'all') return filtered;
    
    return filtered.filter(contract => {
      const dynamicStatus = getStatus(contract);
      return dynamicStatus === statusFilter;
    });
  }, [contracts, selectedCustomerId, statusFilter, statusMap]);

  const { data: payments, isLoading: loadingPayments } = usePaymentsByContract(
    selectedContractId
  );

  // Pagination constants
  const ITEMS_PER_PAGE = 5;
  
  // Group bulk payments (same payment_date + notes + collector, consecutive installments) into one row
  const groupedPayments = useMemo(() => {
    if (!payments) return [] as Array<{
      id: string;
      payment_date: string;
      collectors: { name: string; collector_code: string } | null;
      notes: string | null;
      start_index: number;
      end_index: number;
      total_amount: number;
      count: number;
    }>;
    // Extract a batch signature from a note. Bulk inserts (legacy + new) share
    // a common range marker that we use as the grouping key.
    //   - new format: "Kupon yang dibayar adalah 18 - 21"
    //   - legacy:    "Pembayaran kupon 20 (batch 18-21)"
    const batchKey = (note: string | null): string | null => {
      if (!note) return null;
      const m1 = note.match(/adalah\s+(\d+)\s*-\s*(\d+)/i);
      if (m1) return `${m1[1]}-${m1[2]}`;
      const m2 = note.match(/batch\s+(\d+)\s*-\s*(\d+)/i);
      if (m2) return `${m2[1]}-${m2[2]}`;
      return null;
    };
    const sorted = [...payments].sort((a, b) => {
      if (a.payment_date !== b.payment_date) return a.payment_date < b.payment_date ? 1 : -1;
      return a.installment_index - b.installment_index;
    });
    const groups: Array<{
      id: string;
      payment_date: string;
      collectors: { name: string; collector_code: string } | null;
      notes: string | null;
      start_index: number;
      end_index: number;
      total_amount: number;
      count: number;
      _batch: string | null;
    }> = [];
    for (const p of sorted) {
      const last = groups[groups.length - 1];
      const pBatch = batchKey(p.notes);
      const sameGroup =
        last &&
        last.payment_date === p.payment_date &&
        (last.collectors?.name || '') === (p.collectors?.name || '') &&
        p.installment_index === last.end_index + 1 &&
        // Merge when both rows belong to the same batch range, OR when neither
        // has a batch marker and their notes match (single sequential entries).
        ((pBatch !== null && pBatch === last._batch) ||
          (pBatch === null && last._batch === null && (last.notes || '') === (p.notes || '')));
      if (sameGroup) {
        last.end_index = p.installment_index;
        last.total_amount += Number(p.amount_paid);
        last.count += 1;
      } else {
        groups.push({
          id: p.id,
          payment_date: p.payment_date,
          collectors: p.collectors,
          notes: p.notes,
          start_index: p.installment_index,
          end_index: p.installment_index,
          total_amount: Number(p.amount_paid),
          count: 1,
          _batch: pBatch,
        });
      }
    }
    // For grouped (count > 1) rows, normalize the displayed note to the
    // canonical range format so legacy per-coupon notes do not leak through.
    return groups.map((g) => ({
      ...g,
      notes:
        g.count > 1
          ? `Kupon yang dibayar adalah ${g.start_index} - ${g.end_index}`
          : g.notes,
    }));
  }, [payments]);

  // Add pagination for grouped payments
  const { currentPage, totalPages, paginatedItems: paginatedPayments, goToPage, totalItems } = usePagination(groupedPayments, ITEMS_PER_PAGE);

  // Add pagination for customer list
  const { 
    currentPage: customerPage, 
    totalPages: customerTotalPages, 
    paginatedItems: paginatedCustomers, 
    goToPage: goToCustomerPage,
    totalItems: totalCustomers 
  } = usePagination(filteredCustomers, ITEMS_PER_PAGE);

  const selectedContract = contracts?.find((c) => c.id === selectedContractId);
  const selectedCustomer = customers?.find((c) => c.id === selectedCustomerId);
  const { data: coupons } = useCouponsByContract(selectedContractId || null);
  const progress = selectedContract
    ? (selectedContract.current_installment_index / selectedContract.tenor_days) * 100
    : 0;

  // Get dynamic status for selected contract
  const selectedContractDynamicStatus = selectedContract 
    ? getStatus(selectedContract)
    : null;

  // Tanggal jatuh tempo = due_date kupon unpaid berikutnya
  const nextDueCoupon = coupons?.find((c) => c.status === 'unpaid');
  const nextDueDate = nextDueCoupon?.due_date || null;

  // Catatan keterlambatan: hitung kupon unpaid yang due_date < hari ini
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueCoupons = coupons?.filter(
    (c) => c.status === 'unpaid' && new Date(c.due_date) < today
  ) || [];
  const overdueCount = overdueCoupons.length;
  const oldestOverdue = overdueCoupons[0]?.due_date;
  const daysLate = oldestOverdue
    ? differenceInDays(today, new Date(oldestOverdue))
    : 0;
  const lateNote = overdueCount > 0
    ? `Terlambat ${overdueCount} kupon`
    : selectedContract?.status === 'completed'
      ? 'Kontrak telah lunas'
      : 'Tidak ada keterlambatan';

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Riwayat Pelanggan</h2>

      <Card>
        <CardHeader>
          <CardTitle>Cari Pelanggan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search and Filter Row */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari nama, telepon, atau kode kontrak..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {/* Status Filter Toggle */}
            <ToggleGroup 
              type="single" 
              value={statusFilter} 
              onValueChange={(value) => {
                if (value) {
                  setStatusFilter(value as ContractStatusFilter);
                  setSelectedCustomerId("");
                  setSelectedContractId("");
                }
              }}
              className="gap-1 flex-wrap justify-start"
            >
              <ToggleGroupItem value="all" size="sm" className="text-xs px-3">
                Semua
              </ToggleGroupItem>
              <ToggleGroupItem value="sangat_lancar" size="sm" className="text-xs px-3 data-[state=on]:bg-green-100 data-[state=on]:text-green-700">
                Sangat Lancar
              </ToggleGroupItem>
              <ToggleGroupItem value="lancar" size="sm" className="text-xs px-3 data-[state=on]:bg-green-100 data-[state=on]:text-green-700">
                Lancar
              </ToggleGroupItem>
              <ToggleGroupItem value="kurang_lancar" size="sm" className="text-xs px-3 data-[state=on]:bg-yellow-100 data-[state=on]:text-yellow-700">
                K. Lancar
              </ToggleGroupItem>
              <ToggleGroupItem value="macet" size="sm" className="text-xs px-3 data-[state=on]:bg-red-100 data-[state=on]:text-red-700">
                Macet
              </ToggleGroupItem>
              <ToggleGroupItem value="completed" size="sm" className="text-xs px-3 data-[state=on]:bg-blue-100 data-[state=on]:text-blue-700">
                Lunas
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {/* Show filtered list or all customers with pagination */}
          <ScrollArea className="border rounded-lg h-64">
            <div className="space-y-1 p-2">
              {paginatedCustomers?.map((customer) => {
                // Get contracts for this customer to show status badges
                const custContracts = contracts?.filter(c => c.customer_id === customer.id) || [];
                const statusCounts = custContracts.reduce((acc, c) => {
                  const status = getStatus(c);
                  acc[status] = (acc[status] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>);
                
                return (
                  <div
                    key={customer.id}
                    className={`p-3 hover:bg-muted cursor-pointer rounded-md ${
                      selectedCustomerId === customer.id ? "bg-muted" : ""
                    }`}
                    onClick={() => {
                      setSelectedCustomerId(customer.id);
                      setSelectedContractId("");
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{customer.name}</div>
                        <div className="text-xs text-muted-foreground">
                          NIK: {customer.nik || "-"} • {custContracts.length} kontrak
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {statusCounts.sangat_lancar && (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                            {statusCounts.sangat_lancar}
                          </Badge>
                        )}
                        {statusCounts.lancar && (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                            {statusCounts.lancar}
                          </Badge>
                        )}
                        {statusCounts.kurang_lancar && (
                          <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                            {statusCounts.kurang_lancar}
                          </Badge>
                        )}
                        {statusCounts.macet && (
                          <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                            {statusCounts.macet}
                          </Badge>
                        )}
                        {statusCounts.completed && (
                          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                            {statusCounts.completed}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {(!paginatedCustomers || paginatedCustomers.length === 0) && (
                <div className="p-3 text-center text-muted-foreground">
                  {statusFilter !== 'all' 
                    ? `Tidak ada pelanggan dengan status ${statusFilter.replace('_', ' ')}`
                    : 'Pelanggan tidak ditemukan'
                  }
                </div>
              )}
            </div>
          </ScrollArea>
          
          {/* Customer pagination */}
          {customerTotalPages > 1 && (
            <TablePagination
              currentPage={customerPage}
              totalPages={customerTotalPages}
              onPageChange={goToCustomerPage}
              totalItems={totalCustomers}
            />
          )}

          {selectedCustomerId && (
            <div>
              <Select
                value={selectedContractId}
                onValueChange={setSelectedContractId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kontrak" />
                </SelectTrigger>
                <SelectContent>
                  {customerContracts?.map((contract) => {
                    const contractStatus = getStatus(contract);
                    return (
                      <SelectItem key={contract.id} value={contract.id}>
                        <div className="flex items-center gap-2">
                          <span>{contract.contract_ref} - {formatRupiah(contract.total_loan_amount)}</span>
                          <Badge variant="outline" className={`text-xs ${getStatusBadgeClass(contractStatus)}`}>
                            {getStatusLabel(contractStatus)}
                          </Badge>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedContract && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Detail Kontrak</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Pelanggan & Kontrak Ref */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Pelanggan</p>
                    <p className="font-medium">{selectedCustomer?.name || "-"}</p>
                    <p className="text-xs text-muted-foreground">
                      Kontrak: {selectedContract.contract_ref}
                    </p>
                  </div>
                  <div className="sm:text-right">
                    <p className="text-sm text-muted-foreground">Jumlah Pinjaman</p>
                    <p className="font-medium">{formatRupiah(selectedContract.total_loan_amount)}</p>
                    <p className="text-xs text-muted-foreground">
                      Cicilan harian: {formatRupiah(selectedContract.daily_installment_amount)}
                    </p>
                  </div>
                </div>

                {/* Informasi Alamat & Kode */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2 border-t">
                  <div>
                    <p className="text-sm text-muted-foreground">Alamat Rumah</p>
                    <p className="font-medium text-sm">{selectedContract.customers?.address || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Alamat Usaha</p>
                    <p className="font-medium text-sm">{selectedContract.customers?.business_address || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Kode Sales</p>
                    <p className="font-medium">{selectedContract.sales_agents?.agent_code || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Nama Kolektor</p>
                    <p className="font-medium">{selectedContract.collectors?.name || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tgl Pengambilan</p>
                    <p className="font-medium">{selectedContract.start_date ? formatDate(selectedContract.start_date) : "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tgl Lunas</p>
                    <p className="font-medium">
                      {(() => {
                        const info = statusMap?.get(selectedContract.id);
                        const isLunas = info?.status === 'completed' || selectedContract.status === 'completed';
                        if (!isLunas) return "-";
                        // Ambil tanggal pembayaran terakhir = max(payment_date)
                        const latest = info?.completedDate
                          ?? (payments && payments.length > 0
                              ? payments.reduce((max, p) => (p.payment_date > max ? p.payment_date : max), payments[0].payment_date)
                              : null);
                        return latest ? formatDate(latest) : "-";
                      })()}
                    </p>
                  </div>
                </div>

                {/* Cicilan yang dibayar - Progress */}
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex justify-between text-sm">
                    <span>Cicilan Dibayar</span>
                    <span className="font-medium">
                      {selectedContract.current_installment_index} / {selectedContract.tenor_days} kupon
                    </span>
                  </div>
                  <Progress value={progress} className="h-4" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      Terbayar: {formatRupiah(selectedContract.current_installment_index * selectedContract.daily_installment_amount)}
                    </span>
                    <span>
                      Sisa: {formatRupiah((selectedContract.tenor_days - selectedContract.current_installment_index) * selectedContract.daily_installment_amount)}
                    </span>
                  </div>
                </div>

                {/* Tanggal Jatuh Tempo */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
                  <div>
                    <p className="text-sm text-muted-foreground">Tanggal Jatuh Tempo Berikutnya</p>
                    <p className="font-medium">
                      {nextDueDate ? formatDate(nextDueDate) : "—"}
                    </p>
                    {nextDueCoupon && (
                      <p className="text-xs text-muted-foreground">
                        Kupon ke-{nextDueCoupon.installment_index}
                      </p>
                    )}
                  </div>
                  <div className="sm:text-right">
                    <p className="text-sm text-muted-foreground">Catatan Keterlambatan</p>
                    <p className={`font-medium text-sm ${overdueCount > 0 ? 'text-destructive' : 'text-foreground'}`}>
                      {lateNote}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t">
                  {selectedContractDynamicStatus && (
                    <Badge className={getStatusBadgeClass(selectedContractDynamicStatus)}>
                      {getStatusLabel(selectedContractDynamicStatus)}
                    </Badge>
                  )}
                  <Badge variant="outline">
                    {selectedContract.product_type || "N/A"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Riwayat Pembayaran</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kupon</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead className="text-right">Jumlah</TableHead>
                      <TableHead>Kolektor</TableHead>
                      <TableHead>Catatan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingPayments ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center">Memuat...</TableCell>
                      </TableRow>
                    ) : paginatedPayments?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          Belum ada pembayaran
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedPayments?.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell>
                            <Badge variant="outline">
                              {payment.start_index === payment.end_index
                                ? payment.start_index
                                : `${payment.start_index} - ${payment.end_index}`}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(payment.payment_date)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatRupiah(payment.total_amount)}
                          </TableCell>
                          <TableCell>{payment.collectors?.name || "-"}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {payment.notes || "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              
              {/* Payments pagination */}
              {totalPages > 1 && (
                <div className="mt-4">
                  <TablePagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={goToPage}
                    totalItems={totalItems}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!selectedCustomerId && customers && customers.length > 0 && (
        <div className="text-center py-6 text-muted-foreground">
          Pilih pelanggan dari daftar di atas untuk melihat riwayat pinjaman
        </div>
      )}
    </div>
  );
}
