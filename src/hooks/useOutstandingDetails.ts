import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, endOfMonth, startOfYear, endOfYear, format } from 'date-fns';

export interface OutstandingContractDetail {
  contract_id: string;
  contract_ref: string;
  customer_name: string;
  customer_phone: string | null;
  sales_id: string | null;
  sales_name: string;
  sales_code: string;
  start_date: string;
  contract_total: number;     // Total nilai kupon (paid+unpaid) yg due dalam periode
  paid_amount: number;        // Sum kupon PAID yg due dalam periode
  outstanding: number;        // Sum kupon UNPAID yg due dalam periode
  status: string;
}

export interface OutstandingBySales {
  sales_id: string | null;
  sales_name: string;
  sales_code: string;
  contract_count: number;
  total_outstanding: number;
  total_contract: number;
  total_paid: number;
}

export interface OutstandingDetailsSummary {
  scope: 'monthly' | 'yearly';
  period_label: string;
  total_outstanding: number;
  total_contract_value: number;
  total_paid: number;
  contracts_count: number;
  by_sales: OutstandingBySales[];
  contracts: OutstandingContractDetail[];
}

/**
 * Detail sisa tagihan per kontrak untuk periode (bulan/tahun).
 * KONSEP BARU: Berbasis kupon yang due_date-nya jatuh dalam periode
 * (lintas semua kontrak, termasuk tenor lama yg belum dibayar).
 *   - contract_total = SUM(amount) semua kupon (paid+unpaid) yg due dlm periode
 *   - paid_amount    = SUM(amount) kupon PAID yg due dlm periode
 *   - outstanding    = SUM(amount) kupon UNPAID yg due dlm periode
 *   - contracts_count = jumlah kontrak unik yg punya kupon due dlm periode
 */
const fetchOutstandingDetails = async (
  scope: 'monthly' | 'yearly',
  periodDate: Date,
): Promise<OutstandingDetailsSummary> => {
  const start = scope === 'monthly'
    ? format(startOfMonth(periodDate), 'yyyy-MM-dd')
    : format(startOfYear(periodDate), 'yyyy-MM-dd');
  const end = scope === 'monthly'
    ? format(endOfMonth(periodDate), 'yyyy-MM-dd')
    : format(endOfYear(periodDate), 'yyyy-MM-dd');

  // 1. Fetch semua kupon yg due dalam periode
  const { data: coupons, error: cpErr } = await supabase
    .from('installment_coupons')
    .select('contract_id, amount, status, due_date')
    .gte('due_date', start)
    .lte('due_date', end);
  if (cpErr) throw cpErr;

  const contractIds = Array.from(new Set((coupons || []).map((c: any) => c.contract_id)));

  // 2. Fetch kontrak & sales
  const [
    { data: contracts, error: cErr },
    { data: agents, error: aErr },
  ] = await Promise.all([
    contractIds.length > 0
      ? supabase
          .from('credit_contracts')
          .select('id, contract_ref, start_date, status, sales_agent_id, customers(name, phone)')
          .in('id', contractIds)
      : Promise.resolve({ data: [], error: null } as any),
    supabase.from('sales_agents').select('id, name, agent_code'),
  ]);
  if (cErr) throw cErr;
  if (aErr) throw aErr;

  const agentLookup = new Map<string, { name: string; code: string }>();
  (agents || []).forEach((a: any) => agentLookup.set(a.id, { name: a.name, code: a.agent_code }));

  const contractLookup = new Map<string, any>();
  (contracts || []).forEach((c: any) => contractLookup.set(c.id, c));

  // 3. Aggregate per kontrak (hanya kupon yg due dlm periode)
  const totalByContract = new Map<string, number>();
  const paidByContract = new Map<string, number>();
  const unpaidByContract = new Map<string, number>();
  (coupons || []).forEach((c: any) => {
    const amt = Number(c.amount || 0);
    totalByContract.set(c.contract_id, (totalByContract.get(c.contract_id) || 0) + amt);
    if (c.status === 'paid') {
      paidByContract.set(c.contract_id, (paidByContract.get(c.contract_id) || 0) + amt);
    } else if (c.status === 'unpaid') {
      unpaidByContract.set(c.contract_id, (unpaidByContract.get(c.contract_id) || 0) + amt);
    }
  });

  const details: OutstandingContractDetail[] = [];
  const bySalesMap = new Map<string, OutstandingBySales>();
  let totalOutstanding = 0;
  let totalContractValue = 0;
  let totalPaid = 0;

  contractIds.forEach((cid) => {
    const c = contractLookup.get(cid);
    if (!c) return;
    if (c.status === 'returned') return;
    const tagihan = totalByContract.get(cid) || 0;
    const paid = paidByContract.get(cid) || 0;
    const outstanding = unpaidByContract.get(cid) || 0;

    const agentInfo = c.sales_agent_id ? agentLookup.get(c.sales_agent_id) : null;
    const salesName = agentInfo?.name || 'Tanpa Sales';
    const salesCode = agentInfo?.code || '-';

    details.push({
      contract_id: c.id,
      contract_ref: c.contract_ref || c.id,
      customer_name: c.customers?.name || '-',
      customer_phone: c.customers?.phone || null,
      sales_id: c.sales_agent_id || null,
      sales_name: salesName,
      sales_code: salesCode,
      start_date: c.start_date,
      contract_total: tagihan,
      paid_amount: paid,
      outstanding,
      status: c.status,
    });

    totalOutstanding += outstanding;
    totalContractValue += tagihan;
    totalPaid += paid;

    const key = c.sales_agent_id || 'none';
    const existing = bySalesMap.get(key) || {
      sales_id: c.sales_agent_id || null,
      sales_name: salesName,
      sales_code: salesCode,
      contract_count: 0,
      total_outstanding: 0,
      total_contract: 0,
      total_paid: 0,
    };
    existing.contract_count += 1;
    existing.total_outstanding += outstanding;
    existing.total_contract += tagihan;
    existing.total_paid += paid;
    bySalesMap.set(key, existing);
  });

  details.sort((a, b) => b.outstanding - a.outstanding);
  const by_sales = Array.from(bySalesMap.values()).sort((a, b) => b.total_outstanding - a.total_outstanding);

  return {
    scope,
    period_label: scope === 'monthly'
      ? format(periodDate, 'yyyy-MM')
      : String(periodDate.getFullYear()),
    total_outstanding: totalOutstanding,
    total_contract_value: totalContractValue,
    total_paid: totalPaid,
    contracts_count: details.length,
    by_sales,
    contracts: details,
  };
};

export const useOutstandingDetailsMonthly = (month: Date = new Date()) => {
  const start = format(startOfMonth(month), 'yyyy-MM-dd');
  return useQuery({
    queryKey: ['outstanding_details_monthly_v2', start],
    queryFn: () => fetchOutstandingDetails('monthly', month),
  });
};

export const useOutstandingDetailsYearly = (year: Date = new Date()) => {
  const yr = year.getFullYear();
  return useQuery({
    queryKey: ['outstanding_details_yearly_v2', yr],
    queryFn: () => fetchOutstandingDetails('yearly', year),
  });
};
