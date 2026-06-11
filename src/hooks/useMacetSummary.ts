import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { determineContractStatus } from '@/lib/statusCalculation';

/**
 * Ringkasan kontrak MACET (status real-time).
 *
 * ACUAN: identik dengan halaman Riwayat Pelanggan (useContractStatusMap).
 *   lateDays            = jumlah kupon unpaid yg due_date < hari ini
 *   daysSinceLastPayment = hari sejak due_date kupon PAID terakhir
 *   status              = determineContractStatus({...})
 * Kontrak dianggap MACET bila status === 'macet'.
 *
 * Card "Macet" di Dashboard (bulanan & tahunan) memakai data GLOBAL — tidak
 * difilter oleh periode start_date, supaya sinkron dengan tampilan Riwayat
 * Pelanggan yang menampilkan semua kontrak macet aktif.
 */
export interface MacetSummary {
  macet_count: number;
  total_outstanding: number;
  total_modal_at_risk: number;
  contracts: MacetContractDetail[];
  by_sales: MacetBySales[];
}

export interface MacetContractDetail {
  id: string;
  contract_ref: string;
  start_date: string;
  customer_name: string | null;
  customer_phone: string | null;
  sales_id: string | null;
  sales_name: string;
  sales_code: string | null;
  modal: number;
  contract_total: number;
  paid: number;
  outstanding: number;
}

export interface MacetBySales {
  sales_id: string | null;
  sales_name: string;
  sales_code: string | null;
  contract_count: number;
  total_modal: number;
  total_outstanding: number;
}

const PAGE_SIZE = 1000;
async function fetchAll<T>(builder: () => any): Promise<T[]> {
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

const fetchMacetGlobal = async (): Promise<MacetSummary> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  // 1. Semua kontrak aktif (bukan returned)
  const { data: contracts, error } = await supabase
    .from('credit_contracts')
    .select('id, contract_ref, omset, total_loan_amount, start_date, status, created_at, sales_agent_id, customers(name, phone), sales_agents(id, name, agent_code)')
    .neq('status', 'returned');
  if (error) throw error;

  // 2. Semua kupon unpaid (utk lateDays & unpaidCount)
  const unpaid = await fetchAll<{ contract_id: string; due_date: string }>(() =>
    supabase.from('installment_coupons').select('contract_id, due_date').eq('status', 'unpaid').order('contract_id'),
  );
  // 3. Kupon PAID (utk gap macet — pakai due_date kupon terakhir yg dibayar)
  const paidCoupons = await fetchAll<{ contract_id: string; due_date: string }>(() =>
    supabase.from('installment_coupons').select('contract_id, due_date').eq('status', 'paid').order('due_date', { ascending: false }),
  );

  const overdueCountByContract = new Map<string, number>();
  const unpaidCountByContract = new Map<string, number>();
  for (const c of unpaid) {
    unpaidCountByContract.set(c.contract_id, (unpaidCountByContract.get(c.contract_id) || 0) + 1);
    if (c.due_date < todayStr) {
      overdueCountByContract.set(c.contract_id, (overdueCountByContract.get(c.contract_id) || 0) + 1);
    }
  }
  const lastPaidDueByContract = new Map<string, string>();
  for (const c of paidCoupons) {
    const cur = lastPaidDueByContract.get(c.contract_id);
    if (!cur || c.due_date > cur) lastPaidDueByContract.set(c.contract_id, c.due_date);
  }

  // 4. Filter macet pakai aturan yang sama dgn useContractStatusMap
  const macetContracts = (contracts || []).filter((c: any) => {
    const lateDays = overdueCountByContract.get(c.id) || 0;
    const unpaidCount = unpaidCountByContract.get(c.id) || 0;
    const isCompleted = c.status === 'completed' || unpaidCount === 0;
    const lastPaidDue = lastPaidDueByContract.get(c.id);
    let daysSinceLastPayment = 0;
    if (lastPaidDue) {
      const last = new Date(lastPaidDue);
      last.setHours(0, 0, 0, 0);
      daysSinceLastPayment = Math.max(0, Math.floor((today.getTime() - last.getTime()) / 86400000));
    }
    const status = determineContractStatus({
      status: isCompleted ? 'completed' : c.status,
      lateDays,
      daysSinceLastPayment,
      createdAt: c.created_at,
    });
    return status === 'macet';
  });

  // 5. Total dibayar per kontrak (utk outstanding nominal)
  const ids = macetContracts.map((c: any) => c.id);
  const paidMap = new Map<string, number>();
  if (ids.length > 0) {
    const { data: payments, error: pErr } = await supabase
      .from('payment_logs')
      .select('contract_id, amount_paid')
      .in('contract_id', ids);
    if (pErr) throw pErr;
    (payments || []).forEach((p: any) => {
      paidMap.set(p.contract_id, (paidMap.get(p.contract_id) || 0) + Number(p.amount_paid || 0));
    });
  }

  let total_outstanding = 0;
  let total_modal_at_risk = 0;
  const detailList: MacetContractDetail[] = [];
  const salesAgg = new Map<string, MacetBySales>();
  macetContracts.forEach((c: any) => {
    const contractTotal = Number(c.total_loan_amount || 0);
    const paid = paidMap.get(c.id) || 0;
    const outstanding = Math.max(0, contractTotal - paid);
    const modal = Number(c.omset || 0);
    total_outstanding += outstanding;
    total_modal_at_risk += modal;

    const salesName = c.sales_agents?.name || '— Tanpa Sales —';
    const salesCode = c.sales_agents?.agent_code || null;
    const salesId = c.sales_agent_id || null;

    detailList.push({
      id: c.id,
      contract_ref: c.contract_ref,
      start_date: c.start_date,
      customer_name: c.customers?.name || null,
      customer_phone: c.customers?.phone || null,
      sales_id: salesId,
      sales_name: salesName,
      sales_code: salesCode,
      modal,
      contract_total: contractTotal,
      paid,
      outstanding,
    });

    const key = salesId || '__none__';
    const cur = salesAgg.get(key) || { sales_id: salesId, sales_name: salesName, sales_code: salesCode, contract_count: 0, total_modal: 0, total_outstanding: 0 };
    cur.contract_count += 1;
    cur.total_modal += modal;
    cur.total_outstanding += outstanding;
    salesAgg.set(key, cur);
  });

  return {
    macet_count: macetContracts.length,
    total_outstanding,
    total_modal_at_risk,
    contracts: detailList.sort((a, b) => b.outstanding - a.outstanding),
    by_sales: Array.from(salesAgg.values()).sort((a, b) => b.total_outstanding - a.total_outstanding),
  };
};

/**
 * Macet GLOBAL — sinkron dgn Riwayat Pelanggan. Tidak difilter periode.
 * Signature `month`/`year` dipertahankan utk kompat, tapi diabaikan dlm hasil
 * (cuma dipakai utk cache key per periode agar refetch tetap teratur).
 */
export const useMacetSummary = (month: Date = new Date()) => {
  const s = format(startOfMonth(month), 'yyyy-MM-dd');
  const e = format(endOfMonth(month), 'yyyy-MM-dd');
  return useQuery({
    queryKey: ['macet_summary_global', s, e],
    queryFn: fetchMacetGlobal,
  });
};

export const useMacetSummaryYearly = (year: Date = new Date()) => {
  const s = format(startOfYear(year), 'yyyy-MM-dd');
  const e = format(endOfYear(year), 'yyyy-MM-dd');
  return useQuery({
    queryKey: ['macet_summary_global_yearly', s, e],
    queryFn: fetchMacetGlobal,
  });
};

export const useMacetSummaryRealTime = (month: Date = new Date()) => {
  const s = format(startOfMonth(month), 'yyyy-MM-dd');
  const e = format(endOfMonth(month), 'yyyy-MM-dd');
  return useQuery({
    queryKey: ['macet_summary_global_rt', s, e],
    queryFn: fetchMacetGlobal,
    refetchInterval: 30000,
  });
};
