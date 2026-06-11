import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { calculateTieredCommission, CommissionTier } from './useCommissionTiers';
import { startOfMonth, endOfMonth, format, startOfYear, endOfYear } from 'date-fns';

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
 * Performa bulanan — CONTRACT BASIS.
 * Omset/Modal/Profit diakui PENUH untuk setiap kontrak yang start_date nya di bulan ini.
 * total_collected (TERTAGIH) — KONTRAK BARU BULAN INI:
 *   Untuk kontrak yang start_date-nya di bulan ini, jumlahkan semua kupon
 *   cicilan yang SUDAH dibayar (status = 'paid').
 *   Rumus: SUM(installment_coupons.amount WHERE status='paid' AND contract_id IN kontrak_bulan_ini)
 *   (Simetris dengan Sisa Tagihan.)
 * Komisi: tier diterapkan ke total omset (full kontrak) per agen di bulan ini.
 * 
 * SISA TAGIHAN (total_to_collect) — KONTRAK BARU BULAN INI:
 *   Untuk kontrak yang start_date-nya di bulan ini, jumlahkan semua kupon
 *   cicilan yang BELUM dibayar (status = 'unpaid').
 *   Rumus: SUM(installment_coupons.amount WHERE status='unpaid' AND contract_id IN kontrak_bulan_ini)
 */
export const useMonthlyPerformance = (month: Date = new Date()) => {
  const monthStart = format(startOfMonth(month), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(month), 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['monthly_performance_contract', monthStart, monthEnd],
    queryFn: async (): Promise<MonthlyPerformanceSummary> => {
      const [
  { data: agents, error: agentsError },
  { data: contracts, error: contractsError },
  { data: paymentsThisMonth, error: paymentsError },
  { data: tiersData, error: tiersError },
      ] = await Promise.all([
        supabase.from('sales_agents').select('id, name, agent_code').order('name'),
        supabase
          .from('credit_contracts')
          .select('id, omset, total_loan_amount, sales_agent_id, start_date, status, tenor_days, daily_installment_amount')
          .neq('status', 'returned')
          .gte('start_date', monthStart)
          .lte('start_date', monthEnd),
        supabase
          .from('payment_logs')
          .select('amount_paid, payment_date, contract_id')
          .gte('payment_date', monthStart)
          .lte('payment_date', monthEnd),
        supabase.from('commission_tiers').select('*').order('min_amount', { ascending: true }),
      ]);

      if (agentsError) throw agentsError;
      if (contractsError) throw contractsError;
      if (paymentsError) throw paymentsError;
      if (tiersError) throw tiersError;

      const tiers: CommissionTier[] = (tiersData || []) as CommissionTier[];

      // Aggregate per agen — full contract values dari kontrak yg dibuat bulan ini
      const agentDataMap = new Map<string, {
        total_omset: number;
        total_modal: number;
        contract_ids: Set<string>;
      }>();

      (contracts || []).forEach((c: any) => {
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

      // Sum uang masuk aktual per agen bulan ini (info pelengkap, dari kontrak manapun)
      const contractAgentMapAll = new Map<string, string>();
      // Perlu lookup agent dari kontrak yg pembayarannya masuk bulan ini, walau kontraknya dibuat bulan lain.
      // Ambil agent_id dari payment_logs join contract via id (kontrak sudah di-fetch terbatas bulan ini saja),
      // jadi untuk yang tidak ada di list, fetch tambahan agent mapping.
      const paidContractIds = Array.from(new Set((paymentsThisMonth || []).map((p: any) => p.contract_id)));
      if (paidContractIds.length > 0) {
        const { data: contractAgents } = await supabase
          .from('credit_contracts')
          .select('id, sales_agent_id')
          .in('id', paidContractIds);
        (contractAgents || []).forEach((c: any) => {
          if (c.sales_agent_id) contractAgentMapAll.set(c.id, c.sales_agent_id);
        });
      }

      const collectedByAgent = new Map<string, number>();
      (paymentsThisMonth || []).forEach((p: any) => {
        const agentId = contractAgentMapAll.get(p.contract_id);
        if (!agentId) return;
        collectedByAgent.set(agentId, (collectedByAgent.get(agentId) || 0) + Number(p.amount_paid || 0));
      });

      // Sisa Tagihan & Tertagih bulanan = sum kupon dari kontrak yg dibuat bulan ini (simetris)
      const contractIdsThisMonth = (contracts || []).map((c: any) => c.id);
      let totalSisaTagihan = 0;
      let totalTertagihPeriode = 0;
      if (contractIdsThisMonth.length > 0) {
        const { data: monthCoupons, error: couponsErr } = await supabase
          .from('installment_coupons')
          .select('amount, status')
          .in('contract_id', contractIdsThisMonth);
        if (couponsErr) throw couponsErr;
        (monthCoupons || []).forEach((c: any) => {
          const amt = Number(c.amount || 0);
          if (c.status === 'unpaid') totalSisaTagihan += amt;
          else if (c.status === 'paid') totalTertagihPeriode += amt;
        });
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
          total_to_collect: 0,
          total_collected,
          profit,
          profit_margin: profitMargin,
        };
      }).filter(a => a.total_contracts > 0 || a.total_collected > 0);

      const total_modal = agentResults.reduce((s, a) => s + a.total_modal, 0);
      const total_omset = agentResults.reduce((s, a) => s + a.total_omset, 0);
      const total_profit = agentResults.reduce((s, a) => s + a.profit, 0);
      const total_commission = agentResults.reduce((s, a) => s + a.total_commission, 0);
      
      // ===== ACCRUAL BASIS (CICILAN BASIS) =====
      // Tertagih & Sisa Tagihan dihitung dari CICILAN (kupon) kontrak bulan ini
      // - Tertagih: Cicilan yang DUE di bulan ini (due_date antara monthStart-monthEnd)
      // - Sisa Tagihan: Cicilan yang DUE di bulan selanjutnya atau kemudian
      
      // TERTAGIH bulanan = SUM payment_logs.amount_paid di bulan ini
      const total_collected = (paymentsThisMonth || []).reduce(
        (s, p: any) => s + Number(p.amount_paid || 0),
        0
      );
      // SISA TAGIHAN bulanan = Total Omset bulan ini - Tertagih bulan ini (min 0)
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
