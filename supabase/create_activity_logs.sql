-- Idempotent creation of activity_logs table and RLS/policy
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    action character varying NOT NULL,
    entity_type character varying NOT NULL,
    entity_id uuid,
    user_id uuid,
    user_name character varying,
    user_role character varying,
    description text NOT NULL,
    details jsonb,
    ip_address inet,
    user_agent text,
    customer_id uuid,
    contract_id uuid,
    sales_agent_id uuid,
    CONSTRAINT activity_logs_pkey PRIMARY KEY (id)
);

-- Add FK constraints if target tables exist and constraint name not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activity_logs_customer_id_fkey'
  ) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers' AND table_schema = 'public') THEN
    ALTER TABLE public.activity_logs
      ADD CONSTRAINT activity_logs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activity_logs_contract_id_fkey'
  ) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'credit_contracts' AND table_schema = 'public') THEN
    ALTER TABLE public.activity_logs
      ADD CONSTRAINT activity_logs_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.credit_contracts(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'activity_logs_sales_agent_id_fkey'
  ) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_agents' AND table_schema = 'public') THEN
    ALTER TABLE public.activity_logs
      ADD CONSTRAINT activity_logs_sales_agent_id_fkey FOREIGN KEY (sales_agent_id) REFERENCES public.sales_agents(id) ON DELETE SET NULL;
  END IF;
END$$;

-- Enable RLS so frontend policies are enforced
ALTER TABLE IF EXISTS public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Create a permissive policy for authenticated users (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'activity_logs' AND n.nspname = 'public') THEN
    IF EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'auth all activity_logs') THEN
      EXECUTE 'DROP POLICY "auth all activity_logs" ON public.activity_logs';
    END IF;
    EXECUTE 'CREATE POLICY "auth all activity_logs" ON public.activity_logs FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;

-- Optionally, ensure the default search_path has pgcrypto for gen_random_uuid
CREATE EXTENSION IF NOT EXISTS pgcrypto;
