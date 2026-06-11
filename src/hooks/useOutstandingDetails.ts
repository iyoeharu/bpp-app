import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, endOfMonth, startOfYear, endOfYear, format } from 'date-fns';

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
  /** @deprecated kept for backward-compat; always empty. */
  contracts: never[];
}

/**
 * Detail sisa tagihan per sales — KONSISTEN dengan card Dashboard.
 *
 * Rumus (sama dengan card "Sisa Tagihan" bulanan/tahunan):
 *   total_contract  = SUM(total_loan_amount) untuk kontrak yang start_date-nya di periode
 *   total_paid      = SUM(payment_logs.amount_paid) yang payment_date-nya di periode
 *                     untuk kontrak-kontrak tersebut
 *   total_outstanding = MAX(0, total_contract − total_paid)
 *
 * Per-sales agregat menggunakan rumus yg sama; total ringkasan = SUM per-sales.
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

  const [
    { data: contracts, error: cErr },
    { data: agents, error: aErr },
  ] = await Promise.all([
    supabase
      .from('credit_contracts')
      .select('id, total_loan_amount, sales_agent_id, start_date, status')
      .neq('status', 'returned')
      .gte('start_date', start)
      .lte('start_date', end),
    supabase.from('sales_agents').select('id, name, agent_code'),
  ]);
  if (cErr) throw cErr;
  if (aErr) throw aErr;

  const contractIds = (contracts || []).map((c: any) => c.id);

  let payments: any[] = [];
  if (contractIds.length > 0) {
    const { data: payData, error: pErr } = await supabase
      .from('payment_logs')
      .select('contract_id, amount_paid, payment_date')
      .in('contract_id', contractIds)
      .gte('payment_date', start)
      .lte('payment_date', end);
    if (pErr) throw pErr;
    payments = payData || [];
  }

  const agentLookup = new Map<string, { name: string; code: string }>();
  (agents || []).forEach((a: any) => agentLookup.set(a.id, { name: a.name, code: a.agent_code }));

  const paidByContract = new Map<string, number>();
  payments.forEach((p: any) => {
    paidByContract.set(p.contract_id, (paidByContract.get(p.contract_id) || 0) + Number(p.amount_paid || 0));
  });

  const bySalesMap = new Map<string, OutstandingBySales>();
  let totalOutstanding = 0;
  let totalContractValue = 0;
  let totalPaid = 0;

  (contracts || []).forEach((c: any) => {
    const contractValue = Number(c.total_loan_amount || 0);
    const paid = paidByContract.get(c.id) || 0;
    const outstanding = Math.max(0, contractValue - paid);

    totalContractValue += contractValue;
    totalPaid += paid;
    totalOutstanding += outstanding;

    const agentInfo = c.sales_agent_id ? agentLookup.get(c.sales_agent_id) : null;
    const salesName = agentInfo?.name || 'Tanpa Sales';
    const salesCode = agentInfo?.code || '-';
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
    existing.total_contract += contractValue;
    existing.total_paid += paid;
    existing.total_outstanding += outstanding;
    bySalesMap.set(key, existing);
  });

  const by_sales = Array.from(bySalesMap.values()).sort((a, b) => b.total_outstanding - a.total_outstanding);

  return {
    scope,
    period_label: scope === 'monthly'
      ? format(periodDate, 'yyyy-MM')
      : String(periodDate.getFullYear()),
    total_outstanding: totalOutstanding,
    total_contract_value: totalContractValue,
    total_paid: totalPaid,
    contracts_count: (contracts || []).length,
    by_sales,
    contracts: [] as never[],
  };
};

export const useOutstandingDetailsMonthly = (month: Date = new Date()) => {
  const start = format(startOfMonth(month), 'yyyy-MM-dd');
  return useQuery({
    queryKey: ['outstanding_details_monthly_v3', start],
    queryFn: () => fetchOutstandingDetails('monthly', month),
  });
};

export const useOutstandingDetailsYearly = (year: Date = new Date()) => {
  const yr = year.getFullYear();
  return useQuery({
    queryKey: ['outstanding_details_yearly_v3', yr],
    queryFn: () => fetchOutstandingDetails('yearly', year),
  });
};
