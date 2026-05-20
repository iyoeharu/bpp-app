-- Ensure activity_logs foreign keys use ON DELETE SET NULL
DO $$
DECLARE
  _exists boolean;
BEGIN
  -- customer_id fk
  SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_logs_customer_id_fkey') INTO _exists;
  IF _exists THEN
    -- Drop and recreate with ON DELETE SET NULL
    ALTER TABLE public.activity_logs DROP CONSTRAINT IF EXISTS activity_logs_customer_id_fkey;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='customers') THEN
      ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
    END IF;
  END IF;

  -- contract_id fk
  SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_logs_contract_id_fkey') INTO _exists;
  IF _exists THEN
    ALTER TABLE public.activity_logs DROP CONSTRAINT IF EXISTS activity_logs_contract_id_fkey;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='credit_contracts') THEN
      ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.credit_contracts(id) ON DELETE SET NULL;
    END IF;
  END IF;

  -- sales_agent_id fk
  SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_logs_sales_agent_id_fkey') INTO _exists;
  IF _exists THEN
    ALTER TABLE public.activity_logs DROP CONSTRAINT IF EXISTS activity_logs_sales_agent_id_fkey;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sales_agents') THEN
      ALTER TABLE public.activity_logs ADD CONSTRAINT activity_logs_sales_agent_id_fkey FOREIGN KEY (sales_agent_id) REFERENCES public.sales_agents(id) ON DELETE SET NULL;
    END IF;
  END IF;
END$$;
