import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLogActivity } from './useActivityLog';
import type { Json } from '@/integrations/supabase/types';
import { saveToCache, loadFromCache } from '@/lib/queryCache';

export interface CreditContract {
  id: string;
  contract_ref: string;
  customer_id: string;
  sales_agent_id: string | null;
  collector_id: string | null;
  product_type: string | null;
  total_loan_amount: number;
  omset: number | null;
  dp: number | null;
  tenor_days: number;
  daily_installment_amount: number;
  current_installment_index: number;
  status: string;
  start_date: string;
  created_at: string;
  returned_at?: string | null;
}

export interface ContractWithCustomer extends CreditContract {
  customers: {
    name: string;
    address: string | null;
    business_address: string | null;
    phone: string | null;
    nik: string | null;
  } | null;
  sales_agents?: { name: string; agent_code: string } | null;
  collectors?: { name: string; collector_code: string } | null;
}

export const useContracts = (status?: string) => {
  const queryKey = ['credit_contracts', status];
  return useQuery({
    queryKey,
    queryFn: async () => {
      let query = supabase
        .from('credit_contracts')
        .select('*, customers(name, address, business_address, phone, nik), sales_agents(name, agent_code), collectors(name, collector_code)')
        .order('created_at', { ascending: false });
      
      if (status) {
        query = query.eq('status', status);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      const result = data as ContractWithCustomer[];
      saveToCache(queryKey, result);
      return result;
    },
    initialData: () => loadFromCache<ContractWithCustomer[]>(queryKey),
    initialDataUpdatedAt: 0, // always refetch when online
  });
};

export const useCreateContract = () => {
  const queryClient = useQueryClient();
  const logActivity = useLogActivity();
  
  return useMutation({
    mutationFn: async (contract: Omit<CreditContract, 'id' | 'created_at' | 'current_installment_index'>) => {
      const { data, error } = await supabase
        .from('credit_contracts')
        .insert({ ...contract, current_installment_index: 0 })
        .select('*, customers(name, phone), sales_agents(name, agent_code), collectors(name, collector_code)')
        .single();
      if (error) throw error;
      return { data };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['credit_contracts'] });
      queryClient.invalidateQueries({ queryKey: ['invoice_details'] });
      queryClient.invalidateQueries({ queryKey: ['monthly_performance_contract_v5'] });
      queryClient.invalidateQueries({ queryKey: ['yearly_financial_summary_contract_v5'] });

      const d = result.data as Record<string, unknown> & {
        customers?: { name?: string; phone?: string } | null;
        sales_agents?: { name?: string; agent_code?: string } | null;
        collectors?: { name?: string; collector_code?: string } | null;
      };
      logActivity.mutate({
        action: 'CREATE',
        entity_type: 'contract',
        entity_id: result.data.id,
        description: `Created contract ${result.data.contract_ref} with loan amount ${result.data.total_loan_amount}`,
        contract_id: result.data.id,
        details: ({
          contract_ref: d.contract_ref as string,
          customer_name: d.customers?.name ?? null,
          customer_phone: d.customers?.phone ?? null,
          sales_agent: d.sales_agents ? `${d.sales_agents.name} (${d.sales_agents.agent_code})` : null,
          collector: d.collectors ? `${d.collectors.name} (${d.collectors.collector_code})` : null,
          product_type: d.product_type ?? null,
          total_loan_amount: d.total_loan_amount as number,
          omset: d.omset ?? null,
          tenor_days: d.tenor_days as number,
          daily_installment_amount: d.daily_installment_amount as number,
          start_date: d.start_date as string,
          status: d.status as string,
        }) as unknown as Json,
      });
    },
  });
};

export const useUpdateContract = () => {
  const queryClient = useQueryClient();
  const logActivity = useLogActivity();

  return useMutation({
    mutationFn: async ({ id, _note, ...contract }: Partial<CreditContract> & { id: string; _note?: string }) => {
      const { data: before } = await supabase
        .from('credit_contracts')
        .select('*')
        .eq('id', id)
        .single();

      const { data, error } = await supabase
        .from('credit_contracts')
        .update(contract)
        .eq('id', id)
        .select('*, customers(name, phone), sales_agents(name, agent_code), collectors(name, collector_code)')
        .single();
      if (error) throw error;
      return { data, before, _note };
    },
    onSuccess: ({ data, before, _note }) => {
      queryClient.invalidateQueries({ queryKey: ['credit_contracts'] });
      queryClient.invalidateQueries({ queryKey: ['invoice_details'] });
      queryClient.invalidateQueries({ queryKey: ['monthly_performance_contract_v5'] });
      queryClient.invalidateQueries({ queryKey: ['yearly_financial_summary_contract_v5'] });

      const d = data as Record<string, unknown> & {
        customers?: { name?: string; phone?: string } | null;
        sales_agents?: { name?: string; agent_code?: string } | null;
        collectors?: { name?: string; collector_code?: string } | null;
      };
      const trackedFields = [
        'product_type', 'total_loan_amount', 'omset', 'tenor_days',
        'daily_installment_amount', 'start_date', 'status', 'returned_at',
        'sales_agent_id', 'collector_id', 'customer_id',
      ] as const;
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (before) {
        for (const f of trackedFields) {
          const b = (before as Record<string, unknown>)[f];
          const a = (d as Record<string, unknown>)[f];
          if (a !== undefined && b !== a) changes[f] = { from: b, to: a };
        }
      }
      logActivity.mutate({
        action: 'UPDATE',
        entity_type: 'contract',
        entity_id: data.id,
        description: `Updated contract ${data.contract_ref}`,
        contract_id: data.id,
        details: ({
          contract_ref: d.contract_ref as string,
          customer_name: d.customers?.name ?? null,
          sales_agent: d.sales_agents ? `${d.sales_agents.name} (${d.sales_agents.agent_code})` : null,
          collector: d.collectors ? `${d.collectors.name} (${d.collectors.collector_code})` : null,
          changes: Object.keys(changes).length ? changes : null,
          ...(_note ? { note: _note } : {}),
        }) as unknown as Json,
      });
    },
  });
};

export const useDeleteContract = () => {
  const queryClient = useQueryClient();
  const logActivity = useLogActivity();

  return useMutation({
    mutationFn: async ({ id, _note }: { id: string; _note?: string }) => {
      const { data: contractData } = await supabase
        .from('credit_contracts')
        .select('*, customers(name, phone), sales_agents(name, agent_code), collectors(name, collector_code)')
        .eq('id', id)
        .single();

      const { error: phErr } = await supabase
        .from('payment_logs')
        .delete()
        .eq('contract_id', id);
      if (phErr) throw new Error(`Gagal hapus riwayat pembayaran: ${phErr.message}`);

      const { error: chErr } = await supabase
        .from('coupon_handovers')
        .delete()
        .eq('contract_id', id);
      if (chErr) throw new Error(`Gagal hapus riwayat serah terima kupon: ${chErr.message}`);

      const { error: icErr } = await supabase
        .from('installment_coupons')
        .delete()
        .eq('contract_id', id);
      if (icErr) throw new Error(`Gagal hapus kupon: ${icErr.message}`);

      const { error } = await supabase
        .from('credit_contracts')
        .delete()
        .eq('id', id);
      if (error) throw new Error(`Gagal hapus kontrak: ${error.message}`);
      return { id, contractData, _note };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['credit_contracts'] });
      queryClient.invalidateQueries({ queryKey: ['invoice_details'] });
      queryClient.invalidateQueries({ queryKey: ['installment_coupons'] });
      queryClient.invalidateQueries({ queryKey: ['payment_logs'] });
      queryClient.invalidateQueries({ queryKey: ['monthly_performance_contract_v5'] });
      queryClient.invalidateQueries({ queryKey: ['yearly_financial_summary_contract_v5'] });
      queryClient.invalidateQueries({ queryKey: ['coupon_handovers'] });
      queryClient.invalidateQueries({ queryKey: ['outstanding_coupons'] });

      const c = data.contractData as (Record<string, unknown> & {
        customers?: { name?: string; phone?: string } | null;
        sales_agents?: { name?: string; agent_code?: string } | null;
        collectors?: { name?: string; collector_code?: string } | null;
      }) | null;
      logActivity.mutate({
        action: 'DELETE',
        entity_type: 'contract',
        entity_id: data.id,
        description: `Deleted contract ${(c?.contract_ref as string) || data.id}`,
        details: ({
          contract_ref: (c?.contract_ref as string) ?? null,
          customer_name: c?.customers?.name ?? null,
          customer_phone: c?.customers?.phone ?? null,
          sales_agent: c?.sales_agents ? `${c.sales_agents.name} (${c.sales_agents.agent_code})` : null,
          collector: c?.collectors ? `${c.collectors.name} (${c.collectors.collector_code})` : null,
          product_type: c?.product_type ?? null,
          total_loan_amount: (c?.total_loan_amount as number) ?? null,
          omset: c?.omset ?? null,
          tenor_days: (c?.tenor_days as number) ?? null,
          daily_installment_amount: (c?.daily_installment_amount as number) ?? null,
          start_date: (c?.start_date as string) ?? null,
          status: (c?.status as string) ?? null,
          ...(data._note ? { note: data._note } : {}),
        }) as unknown as Json,
      });
    },
  });
};

export const useInvoiceDetails = () => {
  return useQuery({
    queryKey: ['invoice_details'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoice_details')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};
