import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { startOfYear, endOfYear } from 'date-fns';
import { useOperationalExpenses } from './useOperationalExpenses';
import { useCollectorSalaryTotal, useCollectorSalaryTotalYearly } from './useCollectorSalaries';
import { useStaffSalaryTotal, useStaffSalaryTotalYearly } from './useStaffSalaries';

export const useOperationalExpenseTotals = (month: Date = new Date()) => {
  const { data: expenses } = useOperationalExpenses(month);
  const collectorSalaryTotal = useCollectorSalaryTotal(month);
  const staffSalaryTotal = useStaffSalaryTotal(month);

  const total = (expenses || []).reduce((s, e) => s + Number(e.amount || 0), 0);
  const operationalExclSalaries = Math.max(
    0,
    total - (collectorSalaryTotal || 0) - (staffSalaryTotal || 0),
  );

  return {
    total,
    collectorSalaryTotal: collectorSalaryTotal || 0,
    staffSalaryTotal: staffSalaryTotal || 0,
    operationalExclSalaries,
    items: expenses || [],
  };
};

export const useOperationalExpenseTotalsYearly = (year: Date = new Date()) => {
  const yearStart = format(startOfYear(year), 'yyyy-MM-dd');
  const yearEnd = format(endOfYear(year), 'yyyy-MM-dd');

  const { data, error } = useQuery({
    queryKey: ['operational_expenses_yearly', yearStart, yearEnd],
    queryFn: async () => {
      const { data: rows, error: qErr } = await supabase
        .from('operational_expenses')
        .select('*')
        .gte('expense_date', yearStart)
        .lte('expense_date', yearEnd)
        .order('expense_date', { ascending: false });
      if (qErr) throw qErr;
      return rows || [];
    },
  });

  const total = (data || []).reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
  const collectorSalaryTotal = useCollectorSalaryTotalYearly(year) || 0;
  const staffSalaryTotal = useStaffSalaryTotalYearly(year) || 0;
  const operationalExclSalaries = Math.max(
    0,
    total - collectorSalaryTotal - staffSalaryTotal,
  );

  return {
    total,
    collectorSalaryTotal,
    staffSalaryTotal,
    operationalExclSalaries,
    items: data || [],
    error,
  };
};
