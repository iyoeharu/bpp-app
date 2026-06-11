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

      // 2. Tanggal kupon terakhir yang sudah dibayar (berdasarkan due_date kupon paid)
      //    Gap "macet" dihitung dari due_date kupon terakhir yang telah dibayar,
      //    BUKAN dari tanggal input payment_log.
      const paidCoupons = await fetchAll<{ contract_id: string; due_date: string }>(
        () =>
          supabase
            .from('installment_coupons')
            .select('contract_id, due_date')
            .eq('status', 'paid')
            .order('due_date', { ascending: false })
      );
      // Untuk Tgl Lunas: tetap ambil payment_date terakhir dari payment_logs
      const payments = await fetchAll<{ contract_id: string; payment_date: string }>(
        () =>
          supabase
            .from('payment_logs')
            .select('contract_id, payment_date')
            .order('payment_date', { ascending: false })
      );

      // 3. Status kontrak (untuk completed flag)
      const contracts = await fetchAll<{ id: string; status: string }>(
        () => supabase.from('credit_contracts').select('id, status, created_at')
      );

      // Agregasi
      const unpaidByContract = new Map<string, { lateDays: number; unpaidCount: number }>();
      for (const c of unpaid) {
        const prev = unpaidByContract.get(c.contract_id) ?? { lateDays: 0, unpaidCount: 0 };
        prev.unpaidCount += 1;
        // Kupon overdue = due_date sudah lewat (sebelum hari ini)
        if (c.due_date < todayStr) prev.lateDays += 1;
        unpaidByContract.set(c.contract_id, prev);
      }

      // Map: due_date kupon paid terakhir (dipakai utk hitung gap macet)
      const lastPaidDueByContract = new Map<string, string>();
      for (const c of paidCoupons) {
        const cur = lastPaidDueByContract.get(c.contract_id);
        if (!cur || c.due_date > cur) lastPaidDueByContract.set(c.contract_id, c.due_date);
      }
      // Map: payment_date terakhir (dipakai utk Tgl Lunas)
      const lastPaymentByContract = new Map<string, string>();
      for (const p of payments) {
        if (!lastPaymentByContract.has(p.contract_id)) {
          lastPaymentByContract.set(p.contract_id, p.payment_date);
        }
      }

      const map = new Map<string, ContractStatusInfo>();
      for (const ct of contracts as Array<{ id: string; status: string; created_at?: string }>) {
        const unpaidInfo = unpaidByContract.get(ct.id) ?? { lateDays: 0, unpaidCount: 0 };
        const lastPay = lastPaymentByContract.get(ct.id) ?? null;
        const lastPaidDue = lastPaidDueByContract.get(ct.id) ?? null;
        const isCompleted = ct.status === 'completed' || unpaidInfo.unpaidCount === 0;
        // Hari sejak due_date kupon terakhir yang sudah dibayar (untuk rule >20 hari -> macet)
        let daysSinceLastPayment = 0;
        if (lastPaidDue) {
          const last = new Date(lastPaidDue);
          last.setHours(0, 0, 0, 0);
          daysSinceLastPayment = Math.max(
            0,
            Math.floor((today.getTime() - last.getTime()) / 86400000)
          );
        }
        const status = determineContractStatus({
          status: isCompleted ? 'completed' : ct.status,
          lateDays: unpaidInfo.lateDays,
          daysSinceLastPayment,
          // PENTING: tanpa createdAt, aturan "belum pernah bayar & kontrak ≥ 6 hari → Macet"
          // tidak akan trigger untuk kontrak baru yang belum ada payment_logs.
          createdAt: ct.created_at,
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