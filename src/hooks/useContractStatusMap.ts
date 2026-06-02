import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { determineContractStatus, ContractStatus } from '@/lib/statusCalculation';

export interface ContractStatusInfo {
  status: ContractStatus;
  lateDays: number;       // jumlah kupon unpaid yang sudah lewat jatuh tempo
  unpaidCount: number;    // total kupon belum dibayar (overdue + belum jatuh tempo)
  lastPaymentDate: string | null;
  completedDate: string | null; // tanggal pembayaran terakhir saat kontrak lunas
}

const PAGE_SIZE = 1000;

async function fetchAll<T>(
  builder: () => any
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await builder().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

/**
 * Membuat Map status real-time untuk setiap kontrak.
 * Keterlambatan = jumlah kupon yang belum dibayar dengan due_date < hari ini.
 * Tanggal lunas = tanggal pembayaran terakhir (payment_date terbesar).
 */
export const useContractStatusMap = () => {
  return useQuery({
    queryKey: ['contract_status_map'],
    staleTime: 60_000,
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      // 1. Semua kupon unpaid (contract_id, due_date)
      const unpaid = await fetchAll<{ contract_id: string; due_date: string }>(
        () =>
          supabase
            .from('installment_coupons')
            .select('contract_id, due_date')
            .eq('status', 'unpaid')
            .order('contract_id')
      );

      // 2. Semua pembayaran (contract_id, payment_date) untuk last payment per kontrak
      const payments = await fetchAll<{ contract_id: string; payment_date: string }>(
        () =>
          supabase
            .from('payment_logs')
            .select('contract_id, payment_date')
            .order('payment_date', { ascending: false })
      );

      // 3. Status kontrak (untuk completed flag)
      const contracts = await fetchAll<{ id: string; status: string }>(
        () => supabase.from('credit_contracts').select('id, status')
      );

      // Agregasi
      const unpaidByContract = new Map<string, { lateDays: number; unpaidCount: number }>();
      for (const c of unpaid) {
        const prev = unpaidByContract.get(c.contract_id) ?? { lateDays: 0, unpaidCount: 0 };
        prev.unpaidCount += 1;
        if (c.due_date <= todayStr && c.due_date < todayStr) {
          // strictly before today => overdue (today belum dianggap terlambat)
          prev.lateDays += 1;
        }
        unpaidByContract.set(c.contract_id, prev);
      }

      const lastPaymentByContract = new Map<string, string>();
      for (const p of payments) {
        if (!lastPaymentByContract.has(p.contract_id)) {
          lastPaymentByContract.set(p.contract_id, p.payment_date);
        }
      }

      const map = new Map<string, ContractStatusInfo>();
      for (const ct of contracts) {
        const unpaidInfo = unpaidByContract.get(ct.id) ?? { lateDays: 0, unpaidCount: 0 };
        const lastPay = lastPaymentByContract.get(ct.id) ?? null;
        const isCompleted = ct.status === 'completed' || unpaidInfo.unpaidCount === 0;
        const status = determineContractStatus({
          status: isCompleted ? 'completed' : ct.status,
          lateDays: unpaidInfo.lateDays,
        });
        map.set(ct.id, {
          status,
          lateDays: unpaidInfo.lateDays,
          unpaidCount: unpaidInfo.unpaidCount,
          lastPaymentDate: lastPay,
          completedDate: isCompleted ? lastPay : null,
        });
      }

      return map;
    },
  });
};