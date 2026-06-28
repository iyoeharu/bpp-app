import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { calculateTieredCommission, CommissionTier } from './useCommissionTiers';
import { startOfMonth, endOfMonth, format, startOfYear, endOfYear } from 'date-fns';

const PAGE_SIZE = 1000;
const IN_CHUNK_SIZE = 200;

async function fetchAll<T>(builder: () => any): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await builder().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data || []) as T[];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

export interface MonthlyPerformanceData {
  agent_id: string;
  agent_name: string;
  agent_code: string;
  commission_percentage: number;
  total_omset: number;       // CONTRACT BASIS — full nilai kontrak yg dibuat di bulan ini
  total_modal: number;       // CONTRACT BASIS — full nilai modal kontrak yg dibuat di bulan ini
  total_contracts: number;
  total_commission: number;
  total_collected: number;
  total_to_collect: number;
  profit: number;
  profit_margin: number;
}

export interface MonthlyPerformanceSummary {
  total_modal: number;
  total_omset: number;
  total_profit: number;
  total_collected: number;
  total_to_collect: number;
  total_commission: number;
  profit_margin: number;
  agents: MonthlyPerformanceData[];
}

export interface YearlyTargetData {
  total_to_collect: number;
  total_collected: number;
  collection_rate: number;
}

/**
 * Performa bulanan — CONTRACT BASIS (akrual penuh).
 *
 * Modal/Omset/Profit/Komisi: untuk kontrak yang start_date-nya di bulan ini.
 *
 * TERTAGIH (total_collected) — BASIS KONTRAK BULAN INI:
 *   SUM(payment_logs.amount_paid) untuk SEMUA kontrak yg start_date-nya
 *   di bulan ini, tanpa memandang kapan payment_date-nya. Jadi pembayaran
 *   yang masuk di bulan-bulan berikutnya tetap tercatat di bulan kontrak dibuat.
 *
 * SISA TAGIHAN (total_to_collect):
 *   max(0, total_omset_bulan_ini − total_collected_bulan_ini)
 */
export const useMonthlyPerformance = (month: Date = new Date()) => {
  const monthStart = format(startOfMonth(month), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(month), 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['monthly_performance_contract_v4', monthStart, monthEnd],
    queryFn: async (): Promise<MonthlyPerformanceSummary> => {
      const [
        { data: agents, error: agentsError },
        contracts,
        { data: tiersData, error: tiersError },
      ] = await Promise.all([
        supabase.from('sales_agents').select('id, name, agent_code').order('name'),
        fetchAll<any>(() => supabase
          .from('credit_contracts')
          .select('id, omset, total_loan_amount, sales_agent_id, start_date, status, tenor_days, daily_installment_amount')
          .neq('status', 'returned')
          .gte('start_date', monthStart)
          .lte('start_date', monthEnd)
          .order('start_date', { ascending: true })
          .order('id', { ascending: true })
        ),
        supabase.from('commission_tiers').select('*').order('min_amount', { ascending: true }),
      ]);

      if (agentsError) throw agentsError;
      if (tiersError) throw tiersError;

      const tiers: CommissionTier[] = (tiersData || []) as CommissionTier[];

      const agentDataMap = new Map<string, {
        total_omset: number;
        total_modal: number;
        contract_ids: Set<string>;
      }>();

      const contractAgentMap = new Map<string, string | null>();
      (contracts || []).forEach((c: any) => {
        contractAgentMap.set(c.id, c.sales_agent_id || null);
        const agentId = c.sales_agent_id;
        if (!agentId) return;
        const existing = agentDataMap.get(agentId) || {
          total_omset: 0,
          total_modal: 0,
          contract_ids: new Set<string>(),
        };
        existing.total_omset += Number(c.total_loan_amount || 0);
        existing.total_modal += Number(c.omset || 0);
        existing.contract_ids.add(c.id);
        agentDataMap.set(agentId, existing);
      });

      // TERTAGIH basis kontrak: semua payment_logs utk kontrak yg start bulan ini
      const contractIdsThisMonth = Array.from(contractAgentMap.keys());
      const collectedByAgent = new Map<string, number>();
      let totalCollectedThisMonth = 0;
      if (contractIdsThisMonth.length > 0) {
        for (let i = 0; i < contractIdsThisMonth.length; i += IN_CHUNK_SIZE) {
          const ids = contractIdsThisMonth.slice(i, i + IN_CHUNK_SIZE);
          const allPayments = await fetchAll<any>(() => supabase
            .from('payment_logs')
            .select('amount_paid, contract_id, id')
            .in('contract_id', ids)
            .order('id', { ascending: true })
          );

          allPayments.forEach((p: any) => {
            const amt = Number(p.amount_paid || 0);
            totalCollectedThisMonth += amt;
            const agentId = contractAgentMap.get(p.contract_id);
            if (agentId) {
              collectedByAgent.set(agentId, (collectedByAgent.get(agentId) || 0) + amt);
            }
          });
        }
      }

      const agentResults: MonthlyPerformanceData[] = (agents || []).map((agent) => {
        const data = agentDataMap.get(agent.id);
        const total_omset = data?.total_omset || 0;
        const total_modal = data?.total_modal || 0;
        const total_collected = collectedByAgent.get(agent.id) || 0;
        const total_contracts = data?.contract_ids.size || 0;

        const commissionPct = total_omset > 0 ? calculateTieredCommission(total_omset, tiers) : 0;
        const totalCommission = (total_omset * commissionPct) / 100;
        const profit = total_omset - total_modal;
        const profitMargin = total_modal > 0 ? (profit / total_modal) * 100 : 0;

        return {
          agent_id: agent.id,
          agent_name: agent.name,
          agent_code: agent.agent_code,
          commission_percentage: commissionPct,
          total_omset,
          total_modal,
          total_contracts,
          total_commission: totalCommission,
          total_to_collect: Math.max(0, total_omset - total_collected),
          total_collected,
          profit,
          profit_margin: profitMargin,
        };
      }).filter(a => a.total_contracts > 0 || a.total_collected > 0);

      const total_modal = agentResults.reduce((s, a) => s + a.total_modal, 0);
      const total_omset = agentResults.reduce((s, a) => s + a.total_omset, 0);
      const total_profit = agentResults.reduce((s, a) => s + a.profit, 0);
      const total_commission = agentResults.reduce((s, a) => s + a.total_commission, 0);

      const total_collected = totalCollectedThisMonth;
      const total_to_collect = Math.max(0, total_omset - total_collected);

      const profit_margin = total_modal > 0 ? (total_profit / total_modal) * 100 : 0;

      return {
        total_modal,
        total_omset,
        total_profit,
        total_commission,
        total_collected,
        total_to_collect,
        profit_margin,
        agents: agentResults.sort((a, b) => b.profit - a.profit),
      };
    },
  });
};

// Target penagihan tahunan (tetap)
export const useYearlyTarget = (year: Date = new Date()) => {
  const yearStart = format(startOfYear(year), 'yyyy-MM-dd');
  const yearEnd = format(endOfYear(year), 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['yearly_target', yearStart, yearEnd],
    queryFn: async (): Promise<YearlyTargetData> => {
      const { data: unpaidCoupons, error: couponsError } = await supabase
        .from('installment_coupons')
        .select('amount, due_date')
        .eq('status', 'unpaid')
        .gte('due_date', yearStart)
        .lte('due_date', yearEnd);
      if (couponsError) throw couponsError;

      const { data: payments, error: paymentsError } = await supabase
        .from('payment_logs')
        .select('amount_paid, payment_date')
        .gte('payment_date', yearStart)
        .lte('payment_date', yearEnd);
      if (paymentsError) throw paymentsError;

      const total_to_collect = (unpaidCoupons || []).reduce((s, c: any) => s + Number(c.amount || 0), 0);
      const total_collected = (payments || []).reduce((s, p: any) => s + Number(p.amount_paid || 0), 0);
      const expectedTotal = total_to_collect + total_collected;
      const collection_rate = expectedTotal > 0 ? (total_collected / expectedTotal) * 100 : 0;

      return { total_to_collect, total_collected, collection_rate };
    },
  });
};
