import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfYear, endOfYear, format, eachMonthOfInterval, differenceInDays } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import { CommissionTier, calculateTieredCommission } from './useCommissionTiers';
import { determineContractStatus, calculateLateDays, calculateDaysSinceLastPayment, ContractStatus } from '@/lib/statusCalculation';


export type ContractStatusFilter = 'all' | 'sangat_lancar' | 'lancar' | 'kurang_lancar' | 'macet' | 'completed';

export interface MonthlyBreakdown {
  month: string;
  monthLabel: string;
  total_modal: number;
  total_omset: number;
  profit: number;
  commission: number;
  collected: number;
  operational: number;
  contracts_count: number;
}

export interface AgentYearlyPerformance {
  agent_id: string;
  agent_name: string;
  agent_code: string;
  commission_percentage: number;
  total_modal: number;
  total_omset: number;
  profit: number;
  total_commission: number;
  contracts_count: number;
}

export interface MonthlyContractDetail {
  agent_code: string;
  customer_name: string;
  product_type: string;
  modal: number;
  omset: number;
  commission: number;
  net_profit: number;
  start_date?: string;
  contract_ref?: string;
}

export interface MonthlyDetailData {
  monthKey: string;
  monthLabel: string;
  contracts: MonthlyContractDetail[];
  operational_expenses: { description: string; amount: number; category: string | null }[];
  total_operational: number;
  total_omset?: number;
}

export interface YearlyFinancialSummary {
  total_modal: number;
  total_omset: number;
  total_profit: number;
  total_commission: number;
  total_collected: number;
  total_to_collect: number;
  total_expenses: number;
  net_profit: number;
  net_profit_pct: number;
  contracts_count: number;
  completed_count: number;
  active_count: number;
  sangat_lancar_count: number;
  lancar_count: number;
  kurang_lancar_count: number;
  macet_count: number;
  profit_margin: number;
  collection_rate: number;
  monthly_breakdown: MonthlyBreakdown[];
  agents: AgentYearlyPerformance[];
  monthly_details: MonthlyDetailData[];
}

/**
 * Ringkasan keuangan tahunan — CONTRACT BASIS (accrual).
 * Modal/Omset/Profit bulanan & tahunan dihitung dari NILAI PENUH kontrak,
 * dialokasikan ke bulan berdasarkan start_date kontrak.
 * Komisi: tier per total omset agen sepanjang tahun (full nilai kontrak).
 * 
 * SISA TAGIHAN (total_to_collect) — KONTRAK BARU TAHUN INI:
 * - Untuk kontrak yang start_date-nya di tahun ini, jumlahkan semua kupon
 *   cicilan yang BELUM dibayar (status = 'unpaid').
 * - Konsisten dengan Sisa Tagihan bulanan (yaitu sum dari semua bulan dlm tahun ini).
 * 
 * TERTAGIH (total_collected) — CONTRACT BASIS (CONSISTENT DENGAN MONTHLY):
 * - Setiap bulan dihitung dari SUM(payment_logs.amount_paid) untuk kontrak yang
 *   start_date-nya di bulan tersebut (bukan berdasarkan payment_date).
 * - Contoh: Kontrak dibuat Jan, bayar Feb → Tercatat di Jan (konsisten monthly).
 * - Total tahunan = gabungan (sum) dari Tertagih setiap bulan dalam tahun ini.
 * - Dengan demikian yearly `total_collected` identik dengan jumlah 12 card bulanan.
 * 
 * Status Kontrak (NEW):
 * - sangat_lancar: Tidak ada keterlambatan sama sekali (0 hari terlambat)
 * - lancar: Terlambat 1-3 hari
 * - kurang_lancar: Terlambat 4-19 hari
 * - macet: Terlambat 20+ hari ATAU 6+ hari tanpa pembayaran
 */
export const useYearlyFinancialSummary = (year: Date = new Date(), statusFilter: ContractStatusFilter = 'all') => {
  const yearStart = format(startOfYear(year), 'yyyy-MM-dd');
  const yearEnd = format(endOfYear(year), 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['yearly_financial_summary_contract_v3', yearStart, yearEnd, statusFilter],
    queryFn: async (): Promise<YearlyFinancialSummary> => {
      const [
        { data: agents, error: agentsError },
        { data: contracts, error: contractsError },
        { data: expenses, error: expensesError },
        { data: tiersData, error: tiersError },
        { data: allCoupons, error: allCouponsError },
      ] = await Promise.all([
        supabase.from('sales_agents').select('id, name, agent_code'),
        supabase.from('credit_contracts').select('id, contract_ref, omset, total_loan_amount, sales_agent_id, start_date, status, current_installment_index, tenor_days, created_at, product_type, customer_id, daily_installment_amount, customers(name, phone)').neq('status', 'returned').gte('start_date', yearStart).lte('start_date', yearEnd),
        supabase.from('operational_expenses').select('amount, expense_date, description, category').gte('expense_date', yearStart).lte('expense_date', yearEnd),
        supabase.from('commission_tiers').select('*').order('min_amount', { ascending: true }),
        supabase.from('installment_coupons').select('contract_id, due_date, status, installment_index, amount'),
      ]);

      if (agentsError) throw agentsError;
      if (contractsError) throw contractsError;
      if (expensesError) throw expensesError;
      if (tiersError) throw tiersError;
      if (allCouponsError) throw allCouponsError;

      // TERTAGIH yearly: ambil payment_logs HANYA untuk kontrak tahun ini,
      // dipaginate supaya tidak kena default limit 1000 baris Supabase
      // (penyebab card Tertagih tahunan sebelumnya lebih kecil dari sum bulanan).
      const yearContractIds = (contracts || []).map((c: any) => c.id);
      const allPayments: { amount_paid: number; contract_id: string }[] = [];
      const allPaymentLogs: { contract_id: string; payment_date: string }[] = [];
      if (yearContractIds.length > 0) {
        const CHUNK = 200;
        const PAGE = 1000;
        for (let i = 0; i < yearContractIds.length; i += CHUNK) {
          const ids = yearContractIds.slice(i, i + CHUNK);
          let from = 0;
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { data, error } = await supabase
              .from('payment_logs')
              .select('amount_paid, contract_id, payment_date')
              .in('contract_id', ids)
              .order('payment_date', { ascending: false })
              .range(from, from + PAGE - 1);
            if (error) throw error;
            const rows = data || [];
            rows.forEach((r: any) => {
              allPayments.push({ amount_paid: Number(r.amount_paid || 0), contract_id: r.contract_id });
              allPaymentLogs.push({ contract_id: r.contract_id, payment_date: r.payment_date });
            });
            if (rows.length < PAGE) break;
            from += PAGE;
          }
        }
      }

      const tiers = (tiersData || []) as CommissionTier[];
      const selectedYear = year.getFullYear();

      // Lookups
      const agentLookup = new Map<string, { code: string; name: string }>();
      (agents || []).forEach((a: any) => agentLookup.set(a.id, { code: a.agent_code, name: a.name }));

      // Build lookup maps untuk coupon dan payment data
      // Map kontrak ke last payment date
      const lastPaymentByContract = new Map<string, string>();
      (allPaymentLogs || []).forEach((log: any) => {
        if (!lastPaymentByContract.has(log.contract_id)) {
          lastPaymentByContract.set(log.contract_id, log.payment_date);
        }
      });

      // Map kontrak ke next unpaid coupon (due date)
      const nextUnpaidCouponByContract = new Map<string, string>();
      (allCoupons || []).forEach((coupon: any) => {
        if (coupon.status === 'unpaid' && coupon.contract_id) {
          if (!nextUnpaidCouponByContract.has(coupon.contract_id)) {
            nextUnpaidCouponByContract.set(coupon.contract_id, coupon.due_date);
          }
        }
      });

      // Helper function: Hitung contract status dengan data real-time
      const getContractStatusWithData = (contract: any): ContractStatus => {
        if (contract.status === 'completed') return 'completed';
        
        const nextDueDate = nextUnpaidCouponByContract.get(contract.id);
        const lastPaymentDate = lastPaymentByContract.get(contract.id);
        
        const lateDays = calculateLateDays(nextDueDate);
        const daysSinceLastPayment = calculateDaysSinceLastPayment(lastPaymentDate);
        
        return determineContractStatus({
          status: contract.status,
          lateDays,
          daysSinceLastPayment,
          createdAt: contract.created_at,
        });
      };

      // Months scaffold
      const months = eachMonthOfInterval({ start: startOfYear(year), end: endOfYear(year) });
      const monthlyData: Map<string, MonthlyBreakdown> = new Map();
      const monthlyContractDetails: Map<string, Map<string, MonthlyContractDetail>> = new Map();
      const monthlyExpenseDetails: Map<string, { description: string; amount: number; category: string | null }[]> = new Map();
      const monthlyAgentOmset: Map<string, Map<string, number>> = new Map(); // monthKey -> agentId -> omset full
      const contractStartMonthById = new Map<string, string>();

      months.forEach(monthDate => {
        const monthKey = format(monthDate, 'yyyy-MM');
        monthlyData.set(monthKey, {
          month: monthKey,
          monthLabel: format(monthDate, 'MMM yyyy', { locale: idLocale }),
          total_modal: 0, total_omset: 0, profit: 0, commission: 0,
          collected: 0, operational: 0, contracts_count: 0,
        });
        monthlyContractDetails.set(monthKey, new Map());
        monthlyExpenseDetails.set(monthKey, []);
        monthlyAgentOmset.set(monthKey, new Map());
      });

      // Totals (CONTRACT BASIS untuk modal/omset/profit, dan juga CONTRACT BASIS untuk collected)
      let totalModal = 0;
      let totalOmset = 0;
      let totalExpenses = 0;

      const agentYearlyOmset = new Map<string, number>();
      const agentYearlyModal = new Map<string, number>();
      const agentYearlyContracts = new Map<string, Set<string>>();
      
      // Process kontrak: alokasikan FULL ke bulan start_date
      // Note: Kontrak sudah di-filter di database berdasarkan start_date dan status
      (contracts || []).forEach((contract: any) => {
        if (!contract.start_date) return;

        const startDate = new Date(contract.start_date);
        const dynamicStatus = getContractStatusWithData(contract);
        if (statusFilter !== 'all' && dynamicStatus !== statusFilter) return;

        const monthKey = format(startDate, 'yyyy-MM');
        const md = monthlyData.get(monthKey);
        if (!md) return;
        contractStartMonthById.set(contract.id, monthKey);

        const omsetFull = Number(contract.total_loan_amount || 0);
        const modalFull = Number(contract.omset || 0);
        const profitFull = omsetFull - modalFull;

        totalModal += modalFull;
        totalOmset += omsetFull;

        md.total_modal += modalFull;
        md.total_omset += omsetFull;
        md.profit += profitFull;

        const agentId = contract.sales_agent_id;
        if (agentId) {
          const agentMonth = monthlyAgentOmset.get(monthKey)!;
          agentMonth.set(agentId, (agentMonth.get(agentId) || 0) + omsetFull);

          agentYearlyOmset.set(agentId, (agentYearlyOmset.get(agentId) || 0) + omsetFull);
          agentYearlyModal.set(agentId, (agentYearlyModal.get(agentId) || 0) + modalFull);
          const set = agentYearlyContracts.get(agentId) || new Set<string>();
          set.add(contract.id);
          agentYearlyContracts.set(agentId, set);
        }

        const detailMap = monthlyContractDetails.get(monthKey)!;
        const agentInfo = agentId ? agentLookup.get(agentId) : null;
        detailMap.set(contract.id, {
          agent_code: agentInfo?.code || '-',
          customer_name: contract.customers?.name || 'N/A',
          product_type: contract.product_type || '-',
          modal: modalFull,
          omset: omsetFull,
          commission: 0,
          net_profit: profitFull,
          start_date: contract.start_date,
          contract_ref: contract.contract_ref || (contract.id || '').toString(),
        });
      });

      // TERTAGIH bulanan — CONTRACT BASIS (CONSISTENT DENGAN MONTHLY):
      // Setiap pembayaran dialokasikan ke bulan start_date kontrak (bukan payment_date).
      // Hanya pembayaran untuk kontrak tahun ini yang diikutsertakan.
      // Rumus: SUM(payment_logs.amount_paid) untuk kontrak yang start_date-nya bulan itu.
      (allPayments || []).forEach((p: any) => {
        const mk = contractStartMonthById.get(p.contract_id);
        if (!mk) return;
        const md = monthlyData.get(mk);
        if (md) md.collected += Number(p.amount_paid || 0);
      });

      // KOMISI per bulan = tier komisi diterapkan pada total omset agen di bulan itu (sama dgn dashboard bulanan).
      // KOMISI tahunan = SUM komisi bulanan (per agen) = jumlah dari card komisi tiap bulan.
      let totalCommission = 0;
      const agentYearlyCommission = new Map<string, number>();
      const agentCommissionPctSumWeighted = new Map<string, number>(); // utk tampilan % rata-rata tertimbang

      months.forEach((monthDate) => {
        const monthKey = format(monthDate, 'yyyy-MM');
        const md = monthlyData.get(monthKey)!;
        let monthCommission = 0;
        const detailMap = monthlyContractDetails.get(monthKey)!;

        monthlyAgentOmset.get(monthKey)?.forEach((agentMonthOmset, agentId) => {
          if (agentMonthOmset <= 0) return;
          const pct = calculateTieredCommission(agentMonthOmset, tiers);
          const comm = (agentMonthOmset * pct) / 100;
          monthCommission += comm;
          agentYearlyCommission.set(agentId, (agentYearlyCommission.get(agentId) || 0) + comm);
          // weighted by omset → akumulasi pct*omset, nanti dibagi total omset agen
          agentCommissionPctSumWeighted.set(
            agentId,
            (agentCommissionPctSumWeighted.get(agentId) || 0) + pct * agentMonthOmset,
          );
        });

        md.commission = monthCommission;
        totalCommission += monthCommission;

        if (md.total_omset > 0) {
          detailMap.forEach((d) => {
            const sh = d.omset / md.total_omset;
            d.commission = monthCommission * sh;
            d.net_profit = (d.omset - d.modal) - d.commission;
          });
        }
        md.contracts_count = detailMap.size;
      });

      const agentCommissionPct = new Map<string, number>();
      agentYearlyOmset.forEach((omset, agentId) => {
        const w = agentCommissionPctSumWeighted.get(agentId) || 0;
        agentCommissionPct.set(agentId, omset > 0 ? w / omset : 0);
      });


      // Process expenses by month
      (expenses || []).forEach((exp: any) => {
        const monthKey = format(new Date(exp.expense_date), 'yyyy-MM');
        const amount = Number(exp.amount || 0);
        totalExpenses += amount;
        const md = monthlyData.get(monthKey);
        if (md) md.operational += amount;
        const list = monthlyExpenseDetails.get(monthKey);
        if (list) list.push({ description: exp.description, amount, category: exp.category || null });
      });

      // Status counts (note: contracts already filtered by DB, so no year check needed)
      let completedCount = 0, activeCount = 0, sangat_lancarCount = 0, lancarCount = 0, kurangLancarCount = 0, macetCount = 0;
      let totalContractsCount = 0;

      (contracts || []).forEach((contract: any) => {
        if (!contract.start_date) return;
        if (contract.status === 'returned') return;
        totalContractsCount++;

        const dynamicStatus = getContractStatusWithData(contract);
        if (statusFilter !== 'all' && dynamicStatus !== statusFilter) return;

        switch (dynamicStatus) {
          case 'completed': completedCount++; break;
          case 'sangat_lancar': sangat_lancarCount++; activeCount++; break;
          case 'lancar': lancarCount++; activeCount++; break;
          case 'kurang_lancar': kurangLancarCount++; activeCount++; break;
          case 'macet': macetCount++; activeCount++; break;
        }
      });

      // TERTAGIH tahunan = gabungan (sum) dari Tertagih setiap bulan
      // (identik dengan jumlah 12 card Tertagih bulanan di dashboard)
      const totalCollected = Array.from(monthlyData.values()).reduce((s, m) => s + m.collected, 0);

      // SISA TAGIHAN tahunan = SUM dari Sisa Tagihan bulanan
      // Setiap bulan: max(0, total_omset_bulan − tertagih_bulan)  — identik dengan card bulanan.
      const totalToCollect = Array.from(monthlyData.values()).reduce(
        (s, m) => s + Math.max(0, m.total_omset - m.collected),
        0,
      );


      const totalProfit = totalOmset - totalModal;
      const netProfit = totalProfit - totalCommission - totalExpenses;
      const netProfitPct = totalOmset > 0 ? (netProfit / totalOmset) * 100 : 0;
      const profitMargin = totalModal > 0 ? (totalProfit / totalModal) * 100 : 0;
      const expectedTotal = totalToCollect + totalCollected;
      const collectionRate = expectedTotal > 0 ? (totalCollected / expectedTotal) * 100 : 0;

      // Agent results - BEST PRACTICE: Include all agents (even with 0 contracts in year)
      // Sort by total_omset descending
      const agentResults: AgentYearlyPerformance[] = (agents || []).map((agent: any) => {
        const total_omset = agentYearlyOmset.get(agent.id) || 0;
        const total_modal = agentYearlyModal.get(agent.id) || 0;
        const total_commission = agentYearlyCommission.get(agent.id) || 0;
        const profit = total_omset - total_modal;
        const commissionPct = agentCommissionPct.get(agent.id) || 0;

        return {
          agent_id: agent.id,
          agent_name: agent.name,
          agent_code: agent.agent_code,
          commission_percentage: commissionPct,
          total_modal,
          total_omset,
          profit,
          total_commission,
          contracts_count: agentYearlyContracts.get(agent.id)?.size || 0,
        };
      }).sort((a, b) => b.total_omset - a.total_omset);

      // Monthly details
      const monthlyDetails: MonthlyDetailData[] = months.map(monthDate => {
        const monthKey = format(monthDate, 'yyyy-MM');
        const md = monthlyData.get(monthKey)!;
        const detailMap = monthlyContractDetails.get(monthKey)!;
        return {
          monthKey,
          monthLabel: md.monthLabel,
          contracts: Array.from(detailMap.values()),
          operational_expenses: monthlyExpenseDetails.get(monthKey) || [],
          total_operational: md.operational,
          total_omset: md.total_omset,
        };
      });

      return {
        total_modal: totalModal,
        total_omset: totalOmset,
        total_profit: totalProfit,
        total_commission: totalCommission,
        total_collected: totalCollected,
        total_to_collect: totalToCollect,
        total_expenses: totalExpenses,
        net_profit: netProfit,
        net_profit_pct: netProfitPct,
        contracts_count: totalContractsCount,
        completed_count: completedCount,
        active_count: activeCount,
        sangat_lancar_count: sangat_lancarCount,
        lancar_count: lancarCount,
        kurang_lancar_count: kurangLancarCount,
        macet_count: macetCount,
        profit_margin: profitMargin,
        collection_rate: collectionRate,
        monthly_breakdown: Array.from(monthlyData.values()),
        agents: agentResults,
        monthly_details: monthlyDetails,
      };
    },
  });
};
