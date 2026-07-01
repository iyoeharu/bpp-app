import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, endOfMonth, startOfYear, endOfYear, format } from 'date-fns';

export interface OmsetContractDetail {
  contract_id: string;
  contract_ref: string;
  customer_name: string;
  customer_phone: string | null;
  sales_id: string | null;
  sales_name: string;
  sales_code: string;
  start_date: string;
  modal: number;
  dp: number;
  omset: number;
  profit: number;
  products: string[];
  is_returned?: boolean;
  returned_at?: string | null;
}

export interface ReturnAdjustment {
  contract_id: string;
  contract_ref: string;
  customer_name: string;
  sales_name: string;
  sales_code: string;
  returned_at: string;
  start_date: string;
  modal: number;
  dp: number;
  omset: number;
}

export interface OmsetBySales {
  sales_id: string | null;
  sales_name: string;
  sales_code: string;
  contract_count: number;
  total_modal: number;
  total_omset: number;
  total_profit: number;
}

export interface OmsetDetailsSummary {
  scope: 'monthly' | 'yearly';
  total_modal: number;
  total_dp: number;
  total_omset: number;
  total_profit: number;
  contracts_count: number;
  by_sales: OmsetBySales[];
  contracts: OmsetContractDetail[];
  // Penyesuaian retur yang dialokasikan ke periode ini (returned_at di periode)
  return_adjustments: ReturnAdjustment[];
  total_return_modal: number;
  total_return_dp: number;
  total_return_omset: number;
}

const fetchOmsetDetails = async (
  scope: 'monthly' | 'yearly',
  periodDate: Date,
): Promise<OmsetDetailsSummary> => {
  const start = scope === 'monthly'
    ? format(startOfMonth(periodDate), 'yyyy-MM-dd')
    : format(startOfYear(periodDate), 'yyyy-MM-dd');
  const end = scope === 'monthly'
    ? format(endOfMonth(periodDate), 'yyyy-MM-dd')
    : format(endOfYear(periodDate), 'yyyy-MM-dd');

  // returned_at adalah timestamptz → pakai range ISO lengkap
  const startISO = `${start}T00:00:00.000Z`;
  const endISO = `${end}T23:59:59.999Z`;

  // Fetch contracts with returned_at; fallback to no returned_at if column missing
  let contracts: any[] | null = null;
  {
    const res = await supabase
      .from('credit_contracts')
      .select('id, contract_ref, start_date, sales_agent_id, omset, dp, total_loan_amount, status, returned_at, customers(name, phone)' as any)
      .gte('start_date', start)
      .lte('start_date', end);
    if (res.error) {
      const msg = String(res.error.message || '');
      if (/returned_at/i.test(msg)) {
        console.warn('[useOmsetDetails] returned_at fallback:', msg);
        const res2 = await supabase
          .from('credit_contracts')
          .select('id, contract_ref, start_date, sales_agent_id, omset, dp, total_loan_amount, status, customers(name, phone)' as any)
          .gte('start_date', start)
          .lte('start_date', end);
        if (res2.error) throw res2.error;
        contracts = res2.data || [];
      } else {
        throw res.error;
      }
    } else {
      contracts = res.data || [];
    }
  }

  const { data: agents, error: aErr } = await supabase.from('sales_agents').select('id, name, agent_code');
  if (aErr) throw aErr;

  // Returned-in-period; skip entirely if column missing
  let returnedThisPeriod: any[] = [];
  {
    const res = await supabase
      .from('credit_contracts')
      .select('id, contract_ref, start_date, sales_agent_id, omset, dp, total_loan_amount, returned_at, customers(name)' as any)
      .eq('status', 'returned')
      .gte('returned_at', startISO)
      .lte('returned_at', endISO);
    if (res.error) {
      const msg = String(res.error.message || '');
      if (/returned_at/i.test(msg)) {
        console.warn('[useOmsetDetails] skip return adjustments (returned_at missing)');
        returnedThisPeriod = [];
      } else {
        throw res.error;
      }
    } else {
      returnedThisPeriod = res.data || [];
    }
  }

  const contractIds = [
    ...(contracts || []).map((c: any) => c.id),
    ...(returnedThisPeriod || []).map((c: any) => c.id),
  ];
  const productsMap = new Map<string, string[]>();
  if (contractIds.length > 0) {
    const { data: prods } = await supabase
      .from('contract_products' as any)
      .select('contract_id, name, position')
      .in('contract_id', contractIds);
    (prods || []).forEach((p: any) => {
      const arr = productsMap.get(p.contract_id) || [];
      arr.push(p.name);
      productsMap.set(p.contract_id, arr);
    });
  }

  const agentLookup = new Map<string, { name: string; code: string }>();
  (agents || []).forEach((a: any) => agentLookup.set(a.id, { name: a.name, code: a.agent_code }));

  const details: OmsetContractDetail[] = [];
  const bySalesMap = new Map<string, OmsetBySales>();
  let total_modal = 0;
  let total_dp = 0;
  let total_omset = 0;

  (contracts || []).forEach((c: any) => {
    const totalProducts = Number(c.omset || 0);
    const dp = Number(c.dp || 0);
    const modal = Math.max(0, totalProducts - dp);
    const omset = Number(c.total_loan_amount || 0);
    const profit = omset - modal;
    total_modal += modal;
    total_dp += dp;
    total_omset += omset;

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
      modal,
      dp,
      omset,
      profit,
      products: productsMap.get(c.id) || [],
      is_returned: c.status === 'returned',
      returned_at: c.returned_at || null,
    });

    const key = c.sales_agent_id || 'none';
    const ex = bySalesMap.get(key) || {
      sales_id: c.sales_agent_id || null, sales_name: salesName, sales_code: salesCode,
      contract_count: 0, total_modal: 0, total_omset: 0, total_profit: 0,
    };
    ex.contract_count += 1;
    ex.total_modal += modal;
    ex.total_omset += omset;
    ex.total_profit += profit;
    bySalesMap.set(key, ex);
  });

  // ===== Penyesuaian Retur =====
  // Untuk setiap kontrak yang di-return DI periode ini, kurangi total omset/modal/dp
  // pada periode ini, terlepas dari kapan start_date-nya.
  const return_adjustments: ReturnAdjustment[] = [];
  let total_return_modal = 0;
  let total_return_dp = 0;
  let total_return_omset = 0;

  (returnedThisPeriod || []).forEach((c: any) => {
    const totalProducts = Number(c.omset || 0);
    const dp = Number(c.dp || 0);
    const modal = Math.max(0, totalProducts - dp);
    const omset = Number(c.total_loan_amount || 0);
    const profit = omset - modal;

    total_modal -= modal;
    total_dp -= dp;
    total_omset -= omset;
    total_return_modal += modal;
    total_return_dp += dp;
    total_return_omset += omset;

    const agentInfo = c.sales_agent_id ? agentLookup.get(c.sales_agent_id) : null;
    const salesName = agentInfo?.name || 'Tanpa Sales';
    const salesCode = agentInfo?.code || '-';

    return_adjustments.push({
      contract_id: c.id,
      contract_ref: c.contract_ref || c.id,
      customer_name: c.customers?.name || '-',
      sales_name: salesName,
      sales_code: salesCode,
      returned_at: c.returned_at,
      start_date: c.start_date,
      modal,
      dp,
      omset,
    });

    // Kurangi by_sales juga
    const key = c.sales_agent_id || 'none';
    const ex = bySalesMap.get(key) || {
      sales_id: c.sales_agent_id || null, sales_name: salesName, sales_code: salesCode,
      contract_count: 0, total_modal: 0, total_omset: 0, total_profit: 0,
    };
    ex.total_modal -= modal;
    ex.total_omset -= omset;
    ex.total_profit -= profit;
    bySalesMap.set(key, ex);
  });

  details.sort((a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime());

  return {
    scope,
    total_modal,
    total_dp,
    total_omset,
    total_profit: total_omset - total_modal,
    contracts_count: details.length,
    by_sales: Array.from(bySalesMap.values()).sort((a, b) => b.total_omset - a.total_omset),
    contracts: details,
    return_adjustments,
    total_return_modal,
    total_return_dp,
    total_return_omset,
  };
};

export const useOmsetDetailsMonthly = (month: Date = new Date()) => {
  const start = format(startOfMonth(month), 'yyyy-MM-dd');
  return useQuery({
    queryKey: ['omset_details_monthly_v2', start],
    queryFn: () => fetchOmsetDetails('monthly', month),
  });
};

export const useOmsetDetailsYearly = (year: Date = new Date()) => {
  return useQuery({
    queryKey: ['omset_details_yearly_v2', year.getFullYear()],
    queryFn: () => fetchOmsetDetails('yearly', year),
  });
};
