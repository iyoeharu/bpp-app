import { differenceInDays } from 'date-fns';

/**
 * Hitung hari keterlambatan dari due date
 * @param dueDate - Tanggal jatuh tempo kupon berikutnya
 * @returns Jumlah hari terlambat (0 jika belum jatuh tempo)
 */
export const calculateLateDays = (dueDate: string | null | undefined): number => {
  if (!dueDate) return 0;
  
  const due = new Date(dueDate);
  const today = new Date();
  const lateDays = differenceInDays(today, due);
  
  return Math.max(0, lateDays);
};

/**
 * Hitung hari tanpa pembayaran sejak last payment
 * @param lastPaymentDate - Tanggal pembayaran terakhir
 * @returns Jumlah hari sejak pembayaran terakhir
 */
export const calculateDaysSinceLastPayment = (lastPaymentDate: string | null | undefined): number => {
  if (!lastPaymentDate) return 0;
  
  const lastPayment = new Date(lastPaymentDate);
  const today = new Date();
  const daysSince = differenceInDays(today, lastPayment);
  
  return Math.max(0, daysSince);
};

/**
 * Status Kontrak berdasarkan keterlambatan pembayaran
 * Keterlambatan dihitung dari jumlah kupon (hari) yang belum dibayar
 * sejak due_date kupon unpaid paling awal.
 * - sangat_lancar: Bayar tepat di tanggal jatuh tempo (0 hari terlambat)
 * - lancar       : Terlambat < 3 hari (1-3 kupon belum dibayar)
 * - kurang_lancar: Terlambat > 3 sampai 20 hari (4-20 kupon)
 * - macet        : Terlambat > 20 hari (lebih dari 20 kupon)
 */
export type ContractStatus = 'completed' | 'sangat_lancar' | 'lancar' | 'kurang_lancar' | 'macet';

export interface ContractStatusInput {
  status: string; // 'completed', 'active', 'returned'
  lateDays?: number; // Hari terlambat pembayaran
  daysSinceLastPayment?: number; // Hari tanpa pembayaran
  createdAt?: string; // Tanggal pembuatan kontrak (fallback untuk first payment)
}

/**
 * Tentukan status kontrak berdasarkan keterlambatan
 * @param input - Objek berisi data keterlambatan
 * @returns Status kontrak
 */
export const determineContractStatus = (input: ContractStatusInput): ContractStatus => {
  // Jika kontrak selesai
  if (input.status === 'completed') return 'completed';
  
  const lateDays = input.lateDays ?? 0;

  // Klasifikasi berdasarkan hari keterlambatan kupon (1 kupon = 1 hari)
  if (lateDays <= 0) return 'sangat_lancar';
  if (lateDays <= 3) return 'lancar';        // 1-3 hari
  if (lateDays <= 20) return 'kurang_lancar'; // 4-20 hari
  return 'macet';                              // > 20 hari
};

/**
 * Legacy: calculateContractStatus untuk backward compatibility
 * Menggunakan heuristik jika tidak ada data pembayaran real-time
 * @deprecated Gunakan determineContractStatus dengan data real-time
 */
export const calculateContractStatusLegacy = (contract: {
  status: string;
  current_installment_index: number;
  created_at: string;
}): 'completed' | 'sangat_lancar' | 'lancar' | 'kurang_lancar' | 'macet' => {
  if (contract.status === 'completed') return 'completed';
  
  const daysSinceCreation = differenceInDays(new Date(), new Date(contract.created_at));
  const installmentsPaid = contract.current_installment_index;

  // Estimasi: lateDays = hari berlalu sejak start - kupon dibayar
  const lateDays = Math.max(0, daysSinceCreation - installmentsPaid);
  return determineContractStatus({ status: contract.status, lateDays });
};

/**
 * Get label status dalam Bahasa Indonesia
 */
export const getStatusLabel = (status: ContractStatus): string => {
  const labels: Record<ContractStatus, string> = {
    completed: 'Lunas',
    sangat_lancar: 'Sangat Lancar',
    lancar: 'Lancar',
    kurang_lancar: 'Kurang Lancar',
    macet: 'Macet'
  };
  return labels[status] || status;
};

/**
 * Get color class untuk Badge
 */
export const getStatusBadgeClass = (status: ContractStatus): string => {
  const classes: Record<ContractStatus, string> = {
    completed: 'bg-blue-100 text-blue-700',
    sangat_lancar: 'bg-green-100 text-green-700',
    lancar: 'bg-green-50 text-green-600',
    kurang_lancar: 'bg-yellow-100 text-yellow-700',
    macet: 'bg-red-100 text-red-700'
  };
  return classes[status] || 'bg-gray-100 text-gray-700';
};
