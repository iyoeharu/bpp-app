import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { determineContractStatus, calculateLateDays, calculateDaysSinceLastPayment } from '@/lib/statusCalculation';

/**
 * Ringkasan kontrak MACET (status dinamis) — bukan returned.
 * Macet = kontrak masih aktif tapi telat parah berdasarkan rasio hari/angsuran.
 */
export interface MacetSummary {
  macet_count: number;
  total_outstanding: number; // sisa tagihan dari kontrak macet
  total_modal_at_risk: number; // modal yang masih nyangkut di kontrak macet
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

const fetchMacet = async (rangeStart: string, rangeEnd: string): Promise<MacetSummary> => {
  const { data: contracts, error } = await supabase
    .from('credit_contracts')
    .select('id, contract_ref, omset, total_loan_amount, daily_installment_amount, tenor_days, start_date, status, current_installment_index, created_at, sales_agent_id, customers(name, phone), sales_agents(id, name, agent_code)')
    .neq('status', 'returned')
    .neq('status', 'completed')
    .gte('start_date', rangeStart)
    .lte('start_date', rangeEnd);
  if (error) throw error;

  const allIds = (contracts || []).map((c: any) => c.id);

  // Real-time: ambil kupon unpaid (earliest due_date) & last payment per kontrak
  const [{ data: unpaidCoupons, error: cErr }, { data: lastPays, error: lpErr }] = await Promise.all([
    allIds.length
      ? supabase
          .from('installment_coupons')
          .select('contract_id, due_date')
          .eq('status', 'unpaid')
          .in('contract_id', allIds)
      : Promise.resolve({ data: [], error: null } as any),
    allIds.length
      ? supabase
          .from('payment_logs')
          .select('contract_id, payment_date')
          .in('contract_id', allIds)
          .order('payment_date', { ascending: false })
      : Promise.resolve({ data: [], error: null } as any),
  ]);
  if (cErr) throw cErr;
  if (lpErr) throw lpErr;

  const nextUnpaidByContract = new Map<string, string>();
  (unpaidCoupons || []).forEach((c: any) => {
    const prev = nextUnpaidByContract.get(c.contract_id);
    if (!prev || c.due_date < prev) nextUnpaidByContract.set(c.contract_id, c.due_date);
  });

  const lastPaymentByContract = new Map<string, string>();
  (lastPays || []).forEach((p: any) => {
    if (!lastPaymentByContract.has(p.contract_id)) {
      lastPaymentByContract.set(p.contract_id, p.payment_date);
    }
  });

  // Hanya kontrak yang benar-benar MACET berdasarkan determineContractStatus
  const macetContracts = (contracts || []).filter((c: any) => {
    const lateDays = calculateLateDays(nextUnpaidByContract.get(c.id));
    const daysSinceLastPayment = calculateDaysSinceLastPayment(lastPaymentByContract.get(c.id));
    const status = determineContractStatus({
      status: c.status,
      lateDays,
      daysSinceLastPayment,
      createdAt: c.created_at,
    });
    return status === 'macet';
  });
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
    // Sinkron dengan rumus sisa tagihan di hook lain
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

export const useMacetSummary = (month: Date = new Date()) => {
  const s = format(startOfMonth(month), 'yyyy-MM-dd');
  const e = format(endOfMonth(month), 'yyyy-MM-dd');
  return useQuery({
    queryKey: ['macet_summary', s, e],
    queryFn: () => fetchMacet(s, e),
  });
};

export const useMacetSummaryYearly = (year: Date = new Date()) => {
  const s = format(startOfYear(year), 'yyyy-MM-dd');
  const e = format(endOfYear(year), 'yyyy-MM-dd');
  return useQuery({
    queryKey: ['macet_summary_yearly', s, e],
    queryFn: () => fetchMacet(s, e),
  });
};

/**
 * REAL-TIME MACET SUMMARY
 * Query kontrak yang dibuat di bulan itu, tapi hitung status REAL-TIME (hari ini).
 * Ini untuk Dashboard yang ingin menampilkan kontrak yg awalnya macet tapi sudah bayar.
 */
const fetchMacetRealTime = async (rangeStart: string, rangeEnd: string): Promise<MacetSummary> => {
  // Query kontrak yang DIBUAT di range (not based on payment date)
  const { data: contracts, error } = await supabase
    .from('credit_contracts')
    .select('id, contract_ref, omset, total_loan_amount, daily_installment_amount, tenor_days, start_date, status, current_installment_index, created_at, sales_agent_id, customers(name, phone), sales_agents(id, name, agent_code)')
    .neq('status', 'returned')
    .neq('status', 'completed')
    .gte('start_date', rangeStart)
    .lte('start_date', rangeEnd);
  if (error) throw error;

  const allIds = (contracts || []).map((c: any) => c.id);

  // Real-time: ambil kupon unpaid (earliest due_date) & last payment per kontrak (TODAY's status)
  const [{ data: unpaidCoupons, error: cErr }, { data: lastPays, error: lpErr }] = await Promise.all([
    allIds.length
      ? supabase
          .from('installment_coupons')
          .select('contract_id, due_date')
          .eq('status', 'unpaid')
          .in('contract_id', allIds)
      : Promise.resolve({ data: [], error: null } as any),
    allIds.length
      ? supabase
          .from('payment_logs')
          .select('contract_id, payment_date')
          .in('contract_id', allIds)
          .order('payment_date', { ascending: false })
      : Promise.resolve({ data: [], error: null } as any),
  ]);
  if (cErr) throw cErr;
  if (lpErr) throw lpErr;

  const nextUnpaidByContract = new Map<string, string>();
  (unpaidCoupons || []).forEach((c: any) => {
    const prev = nextUnpaidByContract.get(c.contract_id);
    if (!prev || c.due_date < prev) nextUnpaidByContract.set(c.contract_id, c.due_date);
  });

  const lastPaymentByContract = new Map<string, string>();
  (lastPays || []).forEach((p: any) => {
    if (!lastPaymentByContract.has(p.contract_id)) {
      lastPaymentByContract.set(p.contract_id, p.payment_date);
    }
  });

  // Filter REAL-TIME status = macet (status terkini hari ini, bukan saat dibuat)
  const macetContracts = (contracts || []).filter((c: any) => {
    const lateDays = calculateLateDays(nextUnpaidByContract.get(c.id));
    const daysSinceLastPayment = calculateDaysSinceLastPayment(lastPaymentByContract.get(c.id));
    const status = determineContractStatus({
      status: c.status,
      lateDays,
      daysSinceLastPayment,
      createdAt: c.created_at,
    });
    return status === 'macet';  // ← REAL-TIME status
  });
  const ids = macetContracts.map((c: any) => c.id);

  let total_outstanding = 0;
  let total_modal_at_risk = 0;
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

  const detailList: MacetContractDetail[] = [];
  const salesAgg = new Map<string, MacetBySales>();
  macetContracts.forEach((c: any) => {
    const paid = paidMap.get(c.id) || 0;
    const outstanding = (c.omset || 0) - paid;
    total_outstanding += outstanding;
    total_modal_at_risk += c.total_loan_amount || 0;

    const detail: MacetContractDetail = {
      id: c.id,
      contract_ref: c.contract_ref,
      start_date: c.start_date,
      customer_name: c.customers?.name || null,
      customer_phone: c.customers?.phone || null,
      sales_id: c.sales_agent_id,
      sales_name: c.sales_agents?.name || '(Unknown)',
      sales_code: c.sales_agents?.agent_code || null,
      modal: c.total_loan_amount || 0,
      contract_total: c.omset || 0,
      paid,
      outstanding,
    };
    detailList.push(detail);

    const key = `${c.sales_agent_id}|${c.sales_agents?.name || '(Unknown)'}|${c.sales_agents?.agent_code || ''}`;
    const cur = salesAgg.get(key) || {
      sales_id: c.sales_agent_id,
      sales_name: c.sales_agents?.name || '(Unknown)',
      sales_code: c.sales_agents?.agent_code || null,
      contract_count: 0,
      total_modal: 0,
      total_outstanding: 0,
    };
    cur.contract_count += 1;
    cur.total_modal += c.total_loan_amount || 0;
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

export const useMacetSummaryRealTime = (month: Date = new Date()) => {
  const s = format(startOfMonth(month), 'yyyy-MM-dd');
  const e = format(endOfMonth(month), 'yyyy-MM-dd');
  return useQuery({
    queryKey: ['macet_summary_realtime', s, e],
    queryFn: () => fetchMacetRealTime(s, e),
    refetchInterval: 30000, // Update setiap 30 detik untuk real-time
  });
};
