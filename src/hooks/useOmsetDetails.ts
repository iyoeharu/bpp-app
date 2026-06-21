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

  const [{ data: contracts, error: cErr }, { data: agents, error: aErr }] = await Promise.all([
    supabase
      .from('credit_contracts')
      .select('id, contract_ref, start_date, sales_agent_id, omset, dp, total_loan_amount, customers(name, phone)' as any)
      .neq('status', 'returned')
      .gte('start_date', start)
      .lte('start_date', end),
    supabase.from('sales_agents').select('id, name, agent_code'),
  ]);
  if (cErr) throw cErr;
  if (aErr) throw aErr;

  const contractIds = (contracts || []).map((c: any) => c.id);
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
  // Sinkron dengan Contracts.tsx: Modal Awal = harga produk (omset tersimpan) + DP
  const totalProducts = Number(c.omset || 0);
  const dp = Number(c.dp || 0);
  const modal = totalProducts + dp;
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

  // Sort contracts by start_date (newest first) instead of by omset
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
  };
};

export const useOmsetDetailsMonthly = (month: Date = new Date()) => {
  const start = format(startOfMonth(month), 'yyyy-MM-dd');
  return useQuery({
    queryKey: ['omset_details_monthly', start],
    queryFn: () => fetchOmsetDetails('monthly', month),
  });
};

export const useOmsetDetailsYearly = (year: Date = new Date()) => {
  return useQuery({
    queryKey: ['omset_details_yearly', year.getFullYear()],
    queryFn: () => fetchOmsetDetails('yearly', year),
  });
};