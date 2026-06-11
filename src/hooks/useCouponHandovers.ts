import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CouponHandover {
  id: string;
  collector_id: string;
  contract_id: string;
  coupon_count: number;
  start_index: number;
  end_index: number;
  handover_date: string;
  notes: string | null;
  created_at: string;
  collectors?: { name: string; collector_code: string } | null;
  credit_contracts?: {
    contract_ref: string;
    daily_installment_amount: number;
    current_installment_index: number;
    tenor_days: number;
    status: string;
    customers: { name: string } | null;
    sales_agents: { agent_code: string } | null;
  } | null;
}

export const useCouponHandovers = (date?: string) => {
  return useQuery({
    queryKey: ['coupon_handovers', date],
    queryFn: async () => {
      let query = supabase
        .from('coupon_handovers')
        .select('*, collectors(name, collector_code), credit_contracts(contract_ref, daily_installment_amount, current_installment_index, tenor_days, status, customers(name), sales_agents(agent_code))');
      
      if (date) {
        // Filter by handover_date matching the provided date (YYYY-MM-DD)
        query = query.eq('handover_date', date);
      }
      
      query = query.order('created_at', { ascending: false });
      
      const { data, error } = await query;
      if (error) throw error;
      return data as CouponHandover[];
    },
  });
};

export const useHandoversByContract = (contractId: string | null) => {
  return useQuery({
    queryKey: ['coupon_handovers', 'contract', contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coupon_handovers')
        .select('*, collectors(name, collector_code)')
        .eq('contract_id', contractId!)
        .order('handover_date', { ascending: false })
        .order('start_index', { ascending: false });
      if (error) throw error;
      return data as CouponHandover[];
    },
    enabled: !!contractId,
  });
};

export const useCreateCouponHandover = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      collector_id: string;
      contract_id: string;
      coupon_count: number;
      start_index: number;
      end_index: number;
      handover_date: string;
      notes?: string;
    }) => {
      const { data: result, error } = await supabase
        .from('coupon_handovers')
        .insert(data)
        .select()
        .single();
      if (error) throw error;

      // AUTO-PAY: Saat serah terima dibuat, semua kupon dalam batch otomatis
      // tercatat LUNAS di payment_logs. User hanya perlu menandai "Belum Bayar"
      // jika ada kupon yang tidak terbayar (akan dihapus dari payment_logs lewat modal).
      try {
        const { data: contract, error: cErr } = await supabase
          .from('credit_contracts')
          .select('daily_installment_amount, current_installment_index, tenor_days')
          .eq('id', data.contract_id)
          .single();
        if (cErr) throw cErr;

        const indices: number[] = [];
        for (let i = data.start_index; i <= data.end_index; i++) indices.push(i);

        const payments = indices.map((idx) => ({
          contract_id: data.contract_id,
          payment_date: data.handover_date,
          installment_index: idx,
          amount_paid: contract.daily_installment_amount,
          collector_id: data.collector_id,
          notes: `Auto-lunas kupon ${idx} (batch ${data.start_index}-${data.end_index})`,
        }));

        const { error: payErr } = await supabase.from('payment_logs').insert(payments);
        if (payErr) throw payErr;

        const { error: couponErr } = await supabase
          .from('installment_coupons')
          .update({ status: 'paid' })
          .eq('contract_id', data.contract_id)
          .in('installment_index', indices);
        if (couponErr) console.warn('update installment_coupons:', couponErr.message);

        const { error: updErr } = await supabase
          .from('credit_contracts')
          .update({
            current_installment_index: data.end_index,
            ...(data.end_index >= (contract.tenor_days ?? 0) ? { status: 'completed' } : {}),
          })
          .eq('id', data.contract_id)
          .lt('current_installment_index', data.end_index);
        if (updErr) throw updErr;
      } catch (e) {
        console.error('Auto-pay handover gagal:', e);
        throw e;
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupon_handovers'] });
      queryClient.invalidateQueries({ queryKey: ['outstanding_coupons'] });
      queryClient.invalidateQueries({ queryKey: ['credit_contracts'] });
      queryClient.invalidateQueries({ queryKey: ['installment_coupons'] });
      queryClient.invalidateQueries({ queryKey: ['payment_logs'] });
      queryClient.invalidateQueries({ queryKey: ['aggregated_payments'] });
      queryClient.invalidateQueries({ queryKey: ['collection_trend'] });
    },
  });
};

export const useDeleteCouponHandover = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('coupon_handovers')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupon_handovers'] });
      queryClient.invalidateQueries({ queryKey: ['outstanding_coupons'] });
      queryClient.invalidateQueries({ queryKey: ['credit_contracts'] });
    },
  });
};
