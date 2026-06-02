import { FileX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/TablePagination";
import { formatRupiah } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { OutstandingCouponSummary } from "@/hooks/useOutstandingCoupons";
import { useContractStatusMap } from "@/hooks/useContractStatusMap";
import { getStatusLabel, getStatusBadgeClass, ContractStatus } from "@/lib/statusCalculation";

interface Contract {
  id: string;
  contract_ref: string;
  current_installment_index: number;
  daily_installment_amount: number;
  tenor_days: number;
  start_date?: string;
  created_at?: string;
  status?: string;
  customers: { name: string } | null;
}

const RETURNED_META = { label: 'Return', cls: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300' };

interface ManifestTableProps {
  contracts: Contract[] | undefined;
  paginatedContracts: Contract[];
  isLoading: boolean;
  currentPage: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  itemsPerPage?: number;
  searchQuery?: string;
  outstandingData?: OutstandingCouponSummary[];
}

export function ManifestTable({
  contracts,
  paginatedContracts,
  isLoading,
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
  itemsPerPage = 10,
  searchQuery,
  outstandingData,
}: ManifestTableProps) {
  const { data: statusMap } = useContractStatusMap();
  // Build outstanding lookup
  const outstandingMap = new Map<string, OutstandingCouponSummary>();
  if (outstandingData) {
    for (const d of outstandingData) {
      outstandingMap.set(d.contract_id, d);
    }
  }

  if (isLoading) {
    return (
      <div className="border rounded-lg print:hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">No</TableHead>
              <TableHead>Kode Kontrak</TableHead>
              <TableHead>Nama Pelanggan</TableHead>
              <TableHead className="text-center">Progress</TableHead>
              <TableHead className="text-right">Angsuran</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-6" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (!contracts || contracts.length === 0) {
    return (
      <div className="border rounded-lg p-12 print:hidden">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <FileX className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-semibold text-lg mb-1">
            {searchQuery ? "Tidak Ada Hasil" : "Tidak Ada Kontrak"}
          </h3>
          <p className="text-muted-foreground text-sm max-w-sm">
            {searchQuery 
              ? `Tidak ada kontrak yang ditemukan dengan kata kunci "${searchQuery}". Coba kata kunci lain atau hapus filter pencarian.`
              : "Tidak ada kontrak aktif yang tersedia untuk penagihan."
            }
          </p>
        </div>
      </div>
    );
  }

  // Summary totals
  const totalAngsuran = (contracts || []).reduce((s, c) => s + c.daily_installment_amount, 0);
  const totalTunggakan = outstandingData
    ? outstandingData.reduce((s, d) => s + d.total_unpaid_amount, 0)
    : 0;

  return (
    <div className="print:hidden">
      {searchQuery && (
        <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <span className="font-medium">Hasil pencarian:</span> Menampilkan {totalItems} kontrak yang mengandung "{searchQuery}"
          </p>
        </div>
      )}
      
      {/* Summary row */}
      <div className="mb-3 flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Total kontrak:</span>
          <span className="font-semibold">{totalItems}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Total angsuran/hari:</span>
          <span className="font-semibold">{formatRupiah(totalAngsuran)}</span>
        </div>
        {totalTunggakan > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Total tunggakan:</span>
            <span className="font-semibold text-destructive">{formatRupiah(totalTunggakan)}</span>
          </div>
        )}
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-12 font-semibold">No</TableHead>
              <TableHead className="font-semibold">Kode Pelanggan</TableHead>
              <TableHead className="font-semibold">Nama Pelanggan</TableHead>
              <TableHead className="font-semibold text-center">Progress Bayar</TableHead>
              <TableHead className="font-semibold text-right">Angsuran</TableHead>
              <TableHead className="font-semibold text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedContracts.map((contract, i) => {
              const progress = contract.tenor_days > 0
                ? (contract.current_installment_index / contract.tenor_days) * 100
                : 0;
              const outstanding = outstandingMap.get(contract.id);
              const unpaidAmount = outstanding?.total_unpaid_amount || 0;
              const unpaidCoupons = outstanding?.coupons_unpaid || 0;

              return (
                <TableRow key={contract.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="text-muted-foreground">
                    {(currentPage - 1) * itemsPerPage + i + 1}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono">
                      {contract.contract_ref}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{contract.customers?.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 justify-center">
                      <Progress value={progress} className="h-1.5 w-16" />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {contract.current_installment_index}/{contract.tenor_days}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatRupiah(contract.daily_installment_amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {(() => {
                      // Kontrak returned tetap ditandai khusus
                      if (contract.status === 'returned') {
                        return (
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant="outline" className={cn("text-xs", RETURNED_META.cls)}>
                              {RETURNED_META.label}
                            </Badge>
                          </div>
                        );
                      }
                      const info = statusMap?.get(contract.id);
                      const st: ContractStatus = info?.status
                        ?? (contract.status === 'completed' ? 'completed' : 'sangat_lancar');
                      const label = getStatusLabel(st);
                      const cls = getStatusBadgeClass(st) + ' border';
                      return (
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className={cn("text-xs", cls)}>
                            {label}
                          </Badge>
                          {info && info.lateDays > 0 && st !== 'completed' && (
                            <span className="text-[10px] text-muted-foreground">
                              Terlambat {info.lateDays} kupon
                            </span>
                          )}
                          {unpaidCoupons > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              {formatRupiah(unpaidAmount)} • {unpaidCoupons} kupon
                            </span>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
          totalItems={totalItems}
        />
      )}
    </div>
  );
}