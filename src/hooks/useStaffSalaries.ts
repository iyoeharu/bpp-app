import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { toast } from 'sonner';

/**
 * Gaji karyawan berdasarkan POSISI (string bebas, mis. "Admin", "Manajer").
 * Disimpan sebagai operational_expenses:
 *   - category = "Gaji Karyawan"
 *   - notes mengandung tag "[position:NAMA_POSISI]"
 *   - expense_date = tanggal 1 bulan tsb
 * Sehingga otomatis terhitung sebagai biaya operasional di Dashboard.
 */

const CATEGORY = 'Gaji Karyawan';
const POSITION_RE = /\[position:([^\]]+)\]/;
const NAME_RE = /\[name:([^\]]+)\]/;
const tagFor = (position: string) => `[position:${position.trim()}]`;
const nameTagFor = (name: string) => `[name:${name.trim()}]`;
const monthKey = (month: Date) => format(startOfMonth(month), 'yyyy-MM-dd');

export interface StaffSalaryRow {
  id: string;
  position: string;
  name: string;
  amount: number;
  notes: string | null;
}

export const useStaffSalaries = (month: Date = new Date()) => {
  const monthStart = format(startOfMonth(month), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(month), 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['staff_salaries', monthStart, monthEnd],
    queryFn: async (): Promise<StaffSalaryRow[]> => {
      const { data, error } = await supabase
        .from('operational_expenses')
        .select('id, amount, notes, category, expense_date')
        .eq('category', CATEGORY)
        .gte('expense_date', monthStart)
        .lte('expense_date', monthEnd);
      if (error) throw error;

      const rows: StaffSalaryRow[] = [];
      (data || []).forEach((r: any) => {
        const m = (r.notes || '').match(POSITION_RE);
        if (!m) return;
        const nm = (r.notes || '').match(NAME_RE);
        rows.push({
          id: r.id,
          position: m[1],
          name: nm ? nm[1] : '',
          amount: Number(r.amount || 0),
          notes: r.notes,
        });
      });
      return rows.sort((a, b) => a.position.localeCompare(b.position));
    },
  });
};

export const useStaffSalaryTotal = (month: Date = new Date()) => {
  const { data } = useStaffSalaries(month);
  return (data || []).reduce((s, r) => s + r.amount, 0);
};

export const useStaffSalaryTotalYearly = (year: Date = new Date()) => {
  const yearNum = year.getFullYear();
  const yearStart = `${yearNum}-01-01`;
  const yearEnd = `${yearNum}-12-31`;

  const { data } = useQuery({
    queryKey: ['staff_salaries_yearly', yearStart, yearEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('operational_expenses')
        .select('amount, notes')
        .eq('category', CATEGORY)
        .gte('expense_date', yearStart)
        .lte('expense_date', yearEnd);
      if (error) throw error;
      return (data || []).reduce((s: number, r: any) => {
        if (!(r.notes || '').match(POSITION_RE)) return s;
        return s + Number(r.amount || 0);
      }, 0);
    },
  });

  return data ?? 0;
};

export const useSetStaffSalary = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id?: string;          // existing row id (edit)
      position: string;
      name: string;
      amount: number;
      month: Date;
    }) => {
      const monthStart = monthKey(input.month);
      const tag = tagFor(input.position);
      const nameTag = nameTagFor(input.name);
      const description = `Gaji ${input.position} (${input.name}) - ${format(startOfMonth(input.month), 'MMM yyyy')}`;
      const notes = `${tag} ${nameTag} Gaji bulanan karyawan`;

      if (input.id) {
        if (input.amount <= 0) {
          const { error } = await supabase.from('operational_expenses').delete().eq('id', input.id);
          if (error) throw error;
          return { action: 'deleted' };
        }
        const { error } = await supabase
          .from('operational_expenses')
          .update({ amount: input.amount, description, notes, expense_date: monthStart })
          .eq('id', input.id);
        if (error) throw error;
        return { action: 'updated' };
      }

      if (input.amount <= 0) return { action: 'noop' };
      const { error } = await supabase.from('operational_expenses').insert({
        expense_date: monthStart,
        description,
        amount: input.amount,
        category: CATEGORY,
        notes,
      });
      if (error) throw error;
      return { action: 'created' };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff_salaries'] });
      queryClient.invalidateQueries({ queryKey: ['operational_expenses'] });
      toast.success('Gaji karyawan disimpan');
    },
    onError: (err: any) => toast.error('Gagal menyimpan: ' + (err.message || err)),
  });
};

export const useDeleteStaffSalary = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('operational_expenses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff_salaries'] });
      queryClient.invalidateQueries({ queryKey: ['operational_expenses'] });
      toast.success('Gaji dihapus');
    },
    onError: (err: any) => toast.error('Gagal menghapus: ' + (err.message || err)),
  });
};
