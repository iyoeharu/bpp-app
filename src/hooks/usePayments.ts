import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLogActivity } from './useActivityLog';

export interface PaymentLog {
  id: string;
  contract_id: string;
  payment_date: string;
  installment_index: number;
  amount_paid: number;
  collector_id: string | null;
  notes: string | null;
  created_at: string;
}

export interface PaymentWithRelations extends PaymentLog {
  credit_contracts: {
    contract_ref: string;
    customer_id: string;
    customers: { name: string } | null;
  } | null;
  collectors: { name: string; collector_code: string } | null;
}

export const usePayments = (dateFrom?: string, dateTo?: string, collectorId?: string) => {
  return useQuery({
    queryKey: ['payment_logs', dateFrom, dateTo, collectorId],
    queryFn: async () => {
      // Paginate to bypass Supabase's default 1000-row limit
      const PAGE_SIZE = 1000;
      const all: PaymentWithRelations[] = [];
      let from = 0;
      while (true) {
        let query = supabase
          .from('payment_logs')
          .select('*, credit_contracts(contract_ref, customer_id, customers(name)), collectors(name, collector_code)')
          .order('payment_date', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (dateFrom) query = query.gte('payment_date', dateFrom);
        if (dateTo) query = query.lte('payment_date', dateTo);
        if (collectorId) query = query.eq('collector_id', collectorId);

        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as PaymentWithRelations[]));
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return all;
    },
  });
};

export const usePaymentsByContract = (contractId: string) => {
  return useQuery({
    queryKey: ['payment_logs', 'contract', contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_logs')
        .select('*, collectors(name, collector_code)')
        .eq('contract_id', contractId)
        .order('installment_index');
      if (error) throw error;
      return data;
    },
    enabled: !!contractId,
  });
};

export const useCreatePayment = () => {
  const queryClient = useQueryClient();
  const logActivity = useLogActivity();
  
  return useMutation({
    mutationFn: async (payment: Omit<PaymentLog, 'id' | 'created_at'>) => {
      // Insert payment
      const { data: paymentData, error: paymentError } = await supabase
        .from('payment_logs')
        .insert(payment)
        .select()
        .single();
      if (paymentError) throw paymentError;

      // Update coupon status to paid
      const { error: couponError } = await supabase
        .from('installment_coupons')
        .update({ status: 'paid' })
        .eq('contract_id', payment.contract_id)
        .eq('installment_index', payment.installment_index);
      if (couponError) throw couponError;

      // Update contract's current_installment_index
      const { data: ctRow, error: ctErr } = await supabase
        .from('credit_contracts')
        .select('tenor_days')
        .eq('id', payment.contract_id)
        .single();
      if (ctErr) throw ctErr;
      const isCompleted = payment.installment_index >= (ctRow?.tenor_days ?? 0);
      const { error: updateError } = await supabase
        .from('credit_contracts')
        .update({
          current_installment_index: payment.installment_index,
          ...(isCompleted ? { status: 'completed' } : {}),
        })
        .eq('id', payment.contract_id);
      if (updateError) throw updateError;

      // Get contract info for logging
      const { data: contractData } = await supabase
        .from('credit_contracts')
        .select('contract_ref, customers(name)')
        .eq('id', payment.contract_id)
        .single();

      return { ...paymentData, contract_ref: contractData?.contract_ref, customer_name: (contractData?.customers as { name: string } | null)?.name };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['payment_logs'] });
      queryClient.invalidateQueries({ queryKey: ['monthly_performance_contract_v5'] });
      queryClient.invalidateQueries({ queryKey: ['yearly_financial_summary_contract_v5'] });
      queryClient.invalidateQueries({ queryKey: ['credit_contracts'] });
      queryClient.invalidateQueries({ queryKey: ['invoice_details'] });
      queryClient.invalidateQueries({ queryKey: ['collection_trend'] });
      queryClient.invalidateQueries({ queryKey: ['aggregated_payments'] });
      queryClient.invalidateQueries({ queryKey: ['outstanding_coupons'] });
      queryClient.invalidateQueries({ queryKey: ['installment_coupons'] });
      queryClient.invalidateQueries({ queryKey: ['coupon_handovers'] });
      
      logActivity.mutate({
        action: 'PAYMENT',
        entity_type: 'payment',
        entity_id: data.id,
        description: `Payment received for coupon ${data.installment_index} on contract ${data.contract_ref || data.contract_id} (${data.customer_name || 'Unknown'}) - Rp ${data.amount_paid.toLocaleString()}`,
        contract_id: data.contract_id,
      });
    },
  });
};

export interface BulkPaymentInput {
  contract_id: string;
  payment_date: string;
  start_index: number;
  coupon_count: number;
  amount_per_coupon: number;
  collector_id: string | null;
  notes: string;
}

export const useCreateBulkPayment = () => {
  const queryClient = useQueryClient();
  const logActivity = useLogActivity();
  
  return useMutation({
    mutationFn: async (input: BulkPaymentInput) => {
      const { contract_id, payment_date, start_index, coupon_count, amount_per_coupon, collector_id, notes } = input;
      const endIndex = start_index + coupon_count - 1;
      
      // Build array of payments
      const payments: Omit<PaymentLog, 'id' | 'created_at'>[] = [];
      for (let i = start_index; i <= endIndex; i++) {
        payments.push({
          contract_id,
          payment_date,
          installment_index: i,
          amount_paid: amount_per_coupon,
          collector_id,
          notes: notes || `Kupon yang dibayar adalah ${start_index} - ${endIndex}`,
        });
      }
      
      // Insert all payments
      const { data: paymentData, error: paymentError } = await supabase
        .from('payment_logs')
        .insert(payments)
        .select();
      if (paymentError) throw paymentError;

      // Update all coupons to paid
      const { error: couponError } = await supabase
        .from('installment_coupons')
        .update({ status: 'paid' })
        .eq('contract_id', contract_id)
        .gte('installment_index', start_index)
        .lte('installment_index', endIndex);
      if (couponError) throw couponError;

      // Update contract's current_installment_index to end index (auto-complete jika lunas)
      const { data: ctRow2, error: ctErr2 } = await supabase
        .from('credit_contracts')
        .select('tenor_days')
        .eq('id', contract_id)
        .single();
      if (ctErr2) throw ctErr2;
      const isCompleted2 = endIndex >= (ctRow2?.tenor_days ?? 0);
      const { error: updateError } = await supabase
        .from('credit_contracts')
        .update({
          current_installment_index: endIndex,
          ...(isCompleted2 ? { status: 'completed' } : {}),
        })
        .eq('id', contract_id);
      if (updateError) throw updateError;

      // Get contract info for logging
      const { data: contractData } = await supabase
        .from('credit_contracts')
        .select('contract_ref, customers(name)')
        .eq('id', contract_id)
        .single();

      return { 
        payments: paymentData, 
        contract_ref: contractData?.contract_ref, 
        customer_name: (contractData?.customers as { name: string } | null)?.name,
        start_index,
        end_index: endIndex,
        total_amount: amount_per_coupon * coupon_count,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['payment_logs'] });
      queryClient.invalidateQueries({ queryKey: ['monthly_performance_contract_v5'] });
      queryClient.invalidateQueries({ queryKey: ['yearly_financial_summary_contract_v5'] });
      queryClient.invalidateQueries({ queryKey: ['credit_contracts'] });
      queryClient.invalidateQueries({ queryKey: ['invoice_details'] });
      queryClient.invalidateQueries({ queryKey: ['collection_trend'] });
      queryClient.invalidateQueries({ queryKey: ['aggregated_payments'] });
      queryClient.invalidateQueries({ queryKey: ['installment_coupons'] });
      queryClient.invalidateQueries({ queryKey: ['outstanding_coupons'] });
      queryClient.invalidateQueries({ queryKey: ['coupon_handovers'] });
      
      logActivity.mutate({
        action: 'BULK_PAYMENT',
        entity_type: 'payment',
        entity_id: data.payments?.[0]?.id || null,
        description: `Bulk payment received for coupons ${data.start_index}-${data.end_index} on contract ${data.contract_ref} (${data.customer_name || 'Unknown'}) - Total Rp ${data.total_amount.toLocaleString()}`,
        contract_id: data.payments?.[0]?.contract_id,
      });
    },
  });
};

export const useTodayCollections = () => {
  const today = new Date().toISOString().split('T')[0];
  return useQuery({
    queryKey: ['payment_logs', 'today', today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payment_logs')
        .select('amount_paid')
        .eq('payment_date', today);
      if (error) throw error;
      return data.reduce((sum, p) => sum + Number(p.amount_paid), 0);
    },
  });
};
