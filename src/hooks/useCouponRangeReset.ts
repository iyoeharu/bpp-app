import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const formatSupabaseError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const message = record.message;
    const details = record.details;
    const hint = record.hint;
    const code = record.code;
    const parts = [message, details, hint].filter(
      (part): part is string => typeof part === 'string' && part.trim().length > 0,
    );
    if (parts.length > 0) {
      return parts.join(' ');
    }
    if (typeof code === 'string' && code.trim().length > 0) {
      return `Supabase error ${code}`;
    }
  }
  return 'Terjadi kesalahan';
};

export interface CouponRangeAdjustment {
  id: string;
  contract_id: string;
  reset_start_index: number;
  reset_end_index: number;
  deleted_payment_count: number;
  before_current_installment_index: number;
  after_current_installment_index: number;
  before_status: string;
  after_status: string;
  reason: string | null;
  requested_by: string | null;
  created_at: string;
}

export const useCouponRangeAdjustments = (contractId?: string) => {
  return useQuery({
    queryKey: ['coupon_range_adjustments', contractId],
    queryFn: async () => {
      let query = (supabase as any)
        .from('coupon_range_adjustments')
        .select('*')
        .order('created_at', { ascending: false });

      if (contractId) {
        query = query.eq('contract_id', contractId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as CouponRangeAdjustment[];
    },
  });
};

export interface ResetCouponRangePayload {
  contractId: string;
  startIndex: number;
  endIndex: number;
  handoverIds?: string[];
  reason?: string;
  adminPassword: string;
}

export interface ResetCouponRangeResult {
  adjustment_id: string;
  affected_contract_id: string;
  deleted_payment_count: number;
  before_current_installment_index: number;
  after_current_installment_index: number;
  before_status: string;
  after_status: string;
}

export const useResetCouponRange = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: ResetCouponRangePayload) => {
      const { data, error } = await (supabase as any).rpc('reset_coupon_payment_range', {
        p_contract_id: payload.contractId,
        p_start_index: payload.startIndex,
        p_end_index: payload.endIndex,
        p_handover_ids: payload.handoverIds ?? null,
        p_reason: payload.reason ?? null,
        p_admin_password: payload.adminPassword,
      });

      if (error) throw new Error(formatSupabaseError(error));
      if (!data || !Array.isArray(data) || !data[0]) {
        throw new Error('RPC reset range tidak mengembalikan hasil');
      }
      return (data?.[0] || null) as ResetCouponRangeResult | null;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupon_handovers'] });
      queryClient.invalidateQueries({ queryKey: ['outstanding_coupons'] });
      queryClient.invalidateQueries({ queryKey: ['credit_contracts'] });
      queryClient.invalidateQueries({ queryKey: ['installment_coupons'] });
      queryClient.invalidateQueries({ queryKey: ['payment_logs'] });
      queryClient.invalidateQueries({ queryKey: ['coupon_range_adjustments'] });
      queryClient.invalidateQueries({ queryKey: ['monthly_performance_contract_v3'] });
      queryClient.invalidateQueries({ queryKey: ['yearly_financial_summary_contract_v3'] });
      queryClient.invalidateQueries({ queryKey: ['aggregated_payments'] });
      queryClient.invalidateQueries({ queryKey: ['collection_trend'] });
    },
  });
};
