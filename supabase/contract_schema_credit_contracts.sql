-- Idempotent CREATE for public.credit_contracts (remix-of-koleksi-lancar-ver-2)
-- Source: consolidated from this project's supabase/migrations
-- Safe to re-run. FK constraints are added only when missing to avoid duplicate errors.

-- Ensure pgcrypto for gen_random_uuid
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.credit_contracts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  contract_ref text NOT NULL,
  customer_id uuid NOT NULL,
  product_type text,
  total_loan_amount numeric NOT NULL DEFAULT 0,
  tenor_days integer NOT NULL DEFAULT 100,
  daily_installment_amount numeric NOT NULL DEFAULT 0,
  current_installment_index integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status = ANY (ARRAY['active','completed'])),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  omset numeric DEFAULT 0,
  sales_agent_id uuid,
  collector_id uuid,
  dp numeric NOT NULL DEFAULT 0,
  branch_origin text NOT NULL DEFAULT 'A',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT credit_contracts_pkey PRIMARY KEY (id),
  CONSTRAINT credit_contracts_contract_ref_key UNIQUE (contract_ref)
);

-- Indexes used in other migrations and queries
CREATE INDEX IF NOT EXISTS idx_credit_contracts_customer_id ON public.credit_contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_contracts_sales_agent_id ON public.credit_contracts(sales_agent_id);
CREATE INDEX IF NOT EXISTS idx_credit_contracts_collector_id ON public.credit_contracts(collector_id);
CREATE INDEX IF NOT EXISTS idx_credit_contracts_status ON public.credit_contracts(status);

-- Safely add foreign key constraints by checking pg_constraint to avoid duplicate-name errors
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_contracts_customer_id_fkey') THEN
    ALTER TABLE public.credit_contracts
      ADD CONSTRAINT credit_contracts_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_contracts_sales_agent_id_fkey') THEN
    ALTER TABLE public.credit_contracts
      ADD CONSTRAINT credit_contracts_sales_agent_id_fkey FOREIGN KEY (sales_agent_id) REFERENCES public.sales_agents(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_contracts_collector_id_fkey') THEN
    ALTER TABLE public.credit_contracts
      ADD CONSTRAINT credit_contracts_collector_id_fkey FOREIGN KEY (collector_id) REFERENCES public.collectors(id);
  END IF;
END$$;

-- Optional view similar to migrations
CREATE OR REPLACE VIEW public.contract_summary AS
SELECT
  cc.id,
  cc.contract_ref,
  cc.customer_id,
  c.name as customer_name,
  cc.product_type,
  cc.total_loan_amount,
  cc.tenor_days,
  cc.daily_installment_amount,
  cc.current_installment_index,
  cc.status,
  cc.start_date,
  cc.omset,
  cc.sales_agent_id,
  cc.collector_id,
  cc.created_at
FROM public.credit_contracts cc
LEFT JOIN public.customers c ON cc.customer_id = c.id;

-- Quick test insert (run as service_role or superuser). Replace <customer_uuid> with a real customer id.
-- INSERT INTO public.credit_contracts (contract_ref, customer_id, total_loan_amount, tenor_days, daily_installment_amount)
-- VALUES ('TEST-0001', '<customer_uuid>', 1000000, 100, 10000);

-- Notes:
-- If contract insertion still fails, check these:
-- 1) RLS policies on public.credit_contracts may block inserts. Temporarily disable for testing:
--    ALTER TABLE public.credit_contracts DISABLE ROW LEVEL SECURITY;
-- 2) Ensure the customer id exists in public.customers.
-- 3) Ensure contract_ref is unique.

-- End of schema file
