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
 * lateDays = jumlah HARI KERJA (skip Minggu + holiday) dari due_date kupon
 * terakhir yang dibayar (exclusive) sampai hari ini (inclusive).
 * Untuk kontrak yang belum pernah bayar: dihitung dari created_at.
 */
export const useContractStatusMap = () => {
  return useQuery({
    queryKey: ['contract_status_map'],
    staleTime: 60_000,
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      // Kupon unpaid (total + overdue)
      const unpaid = await fetchAll<{ contract_id: string; due_date: string }>(
        () =>
          supabase
            .from('installment_coupons')
            .select('contract_id, due_date')
            .eq('status', 'unpaid')
            .order('contract_id')
      );

      // Kupon paid (untuk cari due_date terakhir yang dibayar)
      const paidCoupons = await fetchAll<{ contract_id: string; due_date: string }>(
        () =>
          supabase
            .from('installment_coupons')
            .select('contract_id, due_date')
            .eq('status', 'paid')
            .order('due_date', { ascending: false })
      );

      // Payment logs (Tgl Lunas)
      const payments = await fetchAll<{ contract_id: string; payment_date: string }>(
        () =>
          supabase
            .from('payment_logs')
            .select('contract_id, payment_date')
            .order('payment_date', { ascending: false })
      );

      // Kontrak
      const contracts = await fetchAll<{ id: string; status: string; created_at?: string }>(
        () => supabase.from('credit_contracts').select('id, status, created_at')
      );

      // Holidays
      const { data: holidaysData } = await supabase
        .from('holidays')
        .select('holiday_date, holiday_type, day_of_week');
      const holidayDates = new Set<string>();
      const recurringWeekdays = new Set<number>([0]); // Minggu default libur
      for (const h of (holidaysData ?? []) as Array<{ holiday_date: string | null; holiday_type: string; day_of_week: number | null }>) {
        if (h.holiday_type === 'specific_date' && h.holiday_date) holidayDates.add(h.holiday_date);
        else if (h.holiday_type === 'recurring_weekday' && h.day_of_week != null) recurringWeekdays.add(h.day_of_week);
      }

      const isWorkingDay = (d: Date) => {
        if (recurringWeekdays.has(d.getDay())) return false;
        const iso = d.toISOString().split('T')[0];
        if (holidayDates.has(iso)) return false;
        return true;
      };

      // Hitung hari kerja antara from (exclusive) sampai today (inclusive)
      const countWorkingDays = (fromIso: string): number => {
        const from = new Date(fromIso);
        from.setHours(0, 0, 0, 0);
        let count = 0;
        const cur = new Date(from);
        cur.setDate(cur.getDate() + 1); // exclusive dari fromIso
        while (cur.getTime() <= today.getTime()) {
          if (isWorkingDay(cur)) count++;
          cur.setDate(cur.getDate() + 1);
        }
        return count;
      };

      // Agregasi
      const unpaidByContract = new Map<string, { overdueCount: number; unpaidCount: number }>();
      for (const c of unpaid) {
        const prev = unpaidByContract.get(c.contract_id) ?? { overdueCount: 0, unpaidCount: 0 };
        prev.unpaidCount += 1;
        if (c.due_date < todayStr) prev.overdueCount += 1;
        unpaidByContract.set(c.contract_id, prev);
      }

      const lastPaidDueByContract = new Map<string, string>();
      for (const c of paidCoupons) {
        const cur = lastPaidDueByContract.get(c.contract_id);
        if (!cur || c.due_date > cur) lastPaidDueByContract.set(c.contract_id, c.due_date);
      }

      const lastPaymentByContract = new Map<string, string>();
      for (const p of payments) {
        if (!lastPaymentByContract.has(p.contract_id)) {
          lastPaymentByContract.set(p.contract_id, p.payment_date);
        }
      }

      const map = new Map<string, ContractStatusInfo>();
      for (const ct of contracts) {
        const unpaidInfo = unpaidByContract.get(ct.id) ?? { overdueCount: 0, unpaidCount: 0 };
        const lastPay = lastPaymentByContract.get(ct.id) ?? null;
        const lastPaidDue = lastPaidDueByContract.get(ct.id) ?? null;
        const isCompleted = ct.status === 'completed' || unpaidInfo.unpaidCount === 0;

        // Realtime lateDays: hitung hari kerja sejak due_date kupon paid terakhir
        // (atau created_at jika belum pernah bayar) sampai hari ini.
        // Cap dengan jumlah kupon overdue yang ada agar tidak overcount.
        let lateDays = 0;
        let daysSinceLastPayment = 0;
        if (!isCompleted) {
          const baseline = lastPaidDue ?? (ct.created_at ? ct.created_at.split('T')[0] : null);
          if (baseline) {
            const working = countWorkingDays(baseline);
            lateDays = Math.min(working, unpaidInfo.overdueCount);
            daysSinceLastPayment = working;
          }
        }

        const status = determineContractStatus({
          status: isCompleted ? 'completed' : ct.status,
          lateDays,
          daysSinceLastPayment,
          createdAt: ct.created_at,
        });

        map.set(ct.id, {
          status,
          lateDays,
          unpaidCount: unpaidInfo.unpaidCount,
          lastPaymentDate: lastPay,
          completedDate: isCompleted ? lastPay : null,
        });
      }

      return map;
    },
  });
};