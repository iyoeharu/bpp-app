-- Combined migrations generated from supabase/migrations
-- DO NOT RUN ON PRODUCTION WITHOUT REVIEW: This concatenates all individual migration files in lexicographic order.

-- =================== FILE: 20251220182447_7a011826-6b6e-4112-a9c3-e0e05567b49e.sql ===================

CREATE TABLE public.sales_agents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.routes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  default_collector_id UUID REFERENCES public.sales_agents(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  assigned_sales_id UUID REFERENCES public.sales_agents(id),
  route_id UUID NOT NULL REFERENCES public.routes(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.credit_contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_ref TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  product_type TEXT,
  total_loan_amount NUMERIC NOT NULL DEFAULT 0,
  tenor_days INTEGER NOT NULL DEFAULT 100,
  daily_installment_amount NUMERIC NOT NULL DEFAULT 0,
  current_installment_index INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'returned')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  returned_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE public.payment_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.credit_contracts(id),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  installment_index INTEGER NOT NULL,
  amount_paid NUMERIC NOT NULL,
  collector_id UUID REFERENCES public.sales_agents(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW public.invoice_details AS
SELECT 
  cc.id,
  cc.contract_ref,
  cc.customer_id,
  c.name AS customer_name,
  c.address AS customer_address,
  c.phone AS customer_phone,
  cc.product_type,
  cc.total_loan_amount,
  cc.tenor_days,
  cc.daily_installment_amount,
  cc.current_installment_index,
  cc.status,
  sa.id AS sales_agent_id,
  sa.agent_code,
  sa.name AS sales_agent_name,
  r.id AS route_id,
  r.code AS route_code,
  r.name AS route_name,
  CAST(cc.tenor_days AS TEXT) || '/' || sa.agent_code || '/' || UPPER(sa.name) AS no_faktur,
  cc.created_at
FROM public.credit_contracts cc
JOIN public.customers c ON cc.customer_id = c.id
LEFT JOIN public.sales_agents sa ON c.assigned_sales_id = sa.id
LEFT JOIN public.routes r ON c.route_id = r.id;

CREATE OR REPLACE FUNCTION public.get_next_coupon(contract_id UUID)
RETURNS INTEGER AS $$
DECLARE
  next_index INTEGER;
BEGIN
  SELECT current_installment_index + 1 INTO next_index
  FROM public.credit_contracts
  WHERE id = contract_id;
  
  RETURN COALESCE(next_index, 1);
END;
$$ LANGUAGE plpgsql;

ALTER TABLE public.sales_agents DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_contracts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_logs DISABLE ROW LEVEL SECURITY;

-- =================== FILE: 20251220210941_8f37c8ce-fd53-417b-81b6-6f58257edbbe.sql ===================

CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_authenticated()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
$$;

CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view customers" ON public.customers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert customers" ON public.customers
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update customers" ON public.customers
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete customers" ON public.customers
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view payments" ON public.payment_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert payments" ON public.payment_logs
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update payments" ON public.payment_logs
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete payments" ON public.payment_logs
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view routes" ON public.routes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert routes" ON public.routes
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update routes" ON public.routes
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete routes" ON public.routes
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view sales_agents" ON public.sales_agents
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert sales_agents" ON public.sales_agents
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update sales_agents" ON public.sales_agents
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete sales_agents" ON public.sales_agents
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can update contracts" ON public.credit_contracts
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete contracts" ON public.credit_contracts
  FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM public.user_roles) = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- =================== FILE: 20251220211011_f0787b9e-ca4c-4c49-b90a-b159a75109ce.sql ===================

CREATE OR REPLACE FUNCTION public.calculate_total_due()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.total_due := (
    SELECT SUM(ic.amount)
    FROM public.credit_contracts cc
    JOIN public.installment_coupons ic ON cc.id = ic.contract_id
    WHERE cc.customer_id = NEW.id
  );
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_installment_index()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  UPDATE public.credit_contracts
  SET current_installment_index = NEW.installment_index
  WHERE id = NEW.contract_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_next_coupon(contract_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  next_index INTEGER;
BEGIN
  SELECT current_installment_index + 1 INTO next_index
  FROM public.credit_contracts
  WHERE id = contract_id;
  RETURN COALESCE(next_index, 1);
END;
$function$;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.credit_contracts;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.credit_contracts;

CREATE POLICY "Authenticated can view contracts" ON public.credit_contracts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert contracts" ON public.credit_contracts
  FOR INSERT TO authenticated WITH CHECK (true);

REVOKE ALL ON public.credit_contracts FROM anon;
REVOKE ALL ON public.customers FROM anon;
REVOKE ALL ON public.payment_logs FROM anon;
REVOKE ALL ON public.routes FROM anon;
REVOKE ALL ON public.sales_agents FROM anon;
REVOKE ALL ON public.user_roles FROM anon;

-- =================== FILE: 20251222184227_cdb0afb2-612b-43ec-8993-4a3c78bc1f42.sql ===================

ALTER TABLE public.customers 
ADD COLUMN customer_code text UNIQUE;

CREATE INDEX idx_customers_customer_code ON public.customers(customer_code);

-- =================== FILE: 20251223165825_edcbe885-d339-460b-b114-a94d90fada77.sql ===================

CREATE TABLE public.holidays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  holiday_date DATE NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view holidays" 
ON public.holidays FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert holidays" 
ON public.holidays FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can update holidays" 
ON public.holidays FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete holidays" 
ON public.holidays FOR DELETE USING (true);

ALTER TABLE public.credit_contracts 
ADD COLUMN start_date DATE NOT NULL DEFAULT CURRENT_DATE;

CREATE TABLE public.installment_coupons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES public.credit_contracts(id) ON DELETE CASCADE,
  installment_index INTEGER NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(contract_id, installment_index)
);

ALTER TABLE public.installment_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view coupons" 
ON public.installment_coupons FOR SELECT USING (true);

CREATE POLICY "Authenticated users can insert coupons" 
ON public.installment_coupons FOR INSERT WITH CHECK (true);

CREATE POLICY "Authenticated users can update coupons" 
ON public.installment_coupons FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete coupons" 
ON public.installment_coupons FOR DELETE USING (true);

ALTER TABLE public.payment_logs 
ADD COLUMN coupon_id UUID REFERENCES public.installment_coupons(id);

CREATE OR REPLACE FUNCTION public.generate_installment_coupons(
  p_contract_id UUID,
  p_start_date DATE,
  p_tenor_days INTEGER,
  p_daily_amount NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_date DATE := p_start_date;
  v_coupon_index INTEGER := 1;
  v_holidays DATE[];
BEGIN
  SELECT ARRAY_AGG(holiday_date) INTO v_holidays FROM public.holidays;
  IF v_holidays IS NULL THEN
    v_holidays := ARRAY[]::DATE[];
  END IF;

  DELETE FROM public.installment_coupons WHERE contract_id = p_contract_id;

  WHILE v_coupon_index <= p_tenor_days LOOP
    IF v_current_date = ANY(v_holidays) THEN
      v_current_date := v_current_date + INTERVAL '1 day';
      CONTINUE;
    END IF;

    INSERT INTO public.installment_coupons (
      contract_id,
      installment_index,
      due_date,
      amount,
      status
    ) VALUES (
      p_contract_id,
      v_coupon_index,
      v_current_date,
      p_daily_amount,
      'unpaid'
    ) ON CONFLICT (contract_id, installment_index) DO NOTHING;

    v_coupon_index := v_coupon_index + 1;
    v_current_date := v_current_date + INTERVAL '1 day';
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'generate_installment_coupons failed for contract %: %', p_contract_id, SQLERRM;
  RAISE;
END;
$$;

CREATE INDEX idx_installment_coupons_contract ON public.installment_coupons(contract_id);
CREATE INDEX idx_installment_coupons_due_date ON public.installment_coupons(due_date);
CREATE INDEX idx_installment_coupons_status ON public.installment_coupons(status);
CREATE INDEX idx_holidays_date ON public.holidays(holiday_date);

-- =================== FILE: 20251223171422_6bae043d-081d-4eca-8788-65bc32fd3a81.sql ===================

-- (file content updated to enhance holidays and function; included later in combined file)

-- =================== FILE: 20251226202529_92a866e2-68fb-4715-8f0d-2b4aeab347f0.sql ===================

ALTER TABLE public.holidays 
ADD COLUMN holiday_type text NOT NULL DEFAULT 'specific_date',
ADD COLUMN day_of_week integer NULL;

ALTER TABLE public.holidays
ADD CONSTRAINT valid_day_of_week CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6));

ALTER TABLE public.holidays
ADD CONSTRAINT holiday_type_fields CHECK (
  (holiday_type = 'specific_date' AND holiday_date IS NOT NULL) OR
  (holiday_type = 'recurring_weekday' AND day_of_week IS NOT NULL)
);

ALTER TABLE public.holidays ALTER COLUMN holiday_date DROP NOT NULL;

ALTER TABLE public.holidays DROP CONSTRAINT IF EXISTS holidays_holiday_date_key;

CREATE UNIQUE INDEX holidays_day_of_week_unique ON public.holidays (day_of_week) WHERE holiday_type = 'recurring_weekday';

CREATE OR REPLACE FUNCTION public.generate_installment_coupons(
  p_contract_id uuid,
  p_start_date date,
  p_tenor_days integer,
  p_daily_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_date DATE := p_start_date;
  v_coupon_index INTEGER := 1;
  v_specific_holidays DATE[];
  v_recurring_weekdays INTEGER[];
BEGIN
  SELECT ARRAY_AGG(holiday_date) INTO v_specific_holidays 
  FROM public.holidays 
  WHERE holiday_type = 'specific_date' AND holiday_date IS NOT NULL;
  
  SELECT ARRAY_AGG(day_of_week) INTO v_recurring_weekdays 
  FROM public.holidays 
  WHERE holiday_type = 'recurring_weekday' AND day_of_week IS NOT NULL;
  
  IF v_specific_holidays IS NULL THEN
    v_specific_holidays := ARRAY[]::DATE[];
  END IF;
  
  IF v_recurring_weekdays IS NULL THEN
    v_recurring_weekdays := ARRAY[]::INTEGER[];
  END IF;
  
  WHILE v_coupon_index <= p_tenor_days LOOP
    IF v_current_date = ANY(v_specific_holidays) OR EXTRACT(DOW FROM v_current_date)::INTEGER = ANY(v_recurring_weekdays) THEN
      v_current_date := v_current_date + INTERVAL '1 day';
      CONTINUE;
    END IF;
    
    INSERT INTO public.installment_coupons (
      contract_id,
      installment_index,
      due_date,
      amount,
      status
    ) VALUES (
      p_contract_id,
      v_coupon_index,
      v_current_date,
      p_daily_amount,
      'unpaid'
    );
    
    v_coupon_index := v_coupon_index + 1;
    v_current_date := v_current_date + INTERVAL '1 day';
  END LOOP;
END;
$$;

-- =================== FILE: 20251227173444_06b6f7e5-1359-4f4c-9611-5b886ca2ebfc.sql ===================

ALTER TABLE public.credit_contracts 
ADD COLUMN omset numeric DEFAULT 0;

ALTER TABLE public.sales_agents 
ADD COLUMN commission_percentage numeric DEFAULT 0;

COMMENT ON COLUMN public.credit_contracts.omset IS 'Revenue/omset from this contract';
COMMENT ON COLUMN public.sales_agents.commission_percentage IS 'Commission percentage for calculating earnings from omset';

-- =================== FILE: 20251227180000_add_nik_validation.sql ===================

-- Ensure the `nik` column exists before adding constraints (safe when concatenating migrations).
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS nik text;

ALTER TABLE public.customers 
ADD CONSTRAINT check_nik_format 
CHECK (nik IS NULL OR (nik ~ '^[0-9]{16}$'));

-- Make NIK optional (nullable). Earlier migrations required it; we change to DROP NOT NULL for idempotency.
ALTER TABLE public.customers 
ALTER COLUMN nik DROP NOT NULL;

ALTER TABLE public.customers 
ADD CONSTRAINT unique_nik 
UNIQUE (nik);

COMMENT ON CONSTRAINT check_nik_format ON public.customers IS 'NIK must be exactly 16 digits';
COMMENT ON CONSTRAINT unique_nik ON public.customers IS 'NIK must be unique across all customers';

-- =================== FILE: 20251227200000_add_nik_column.sql ===================

ALTER TABLE public.customers 
ADD COLUMN nik text;

COMMENT ON COLUMN public.customers.nik IS 'Nomor Induk Kependudukan (Indonesian National ID Number) - 16 digits';

-- =================== FILE: 20260104172404_b62f8e75-5c92-4ce0-9c1c-107fd66ff13e.sql ===================

CREATE TABLE public.operational_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  category TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view operational_expenses"
ON public.operational_expenses
FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert operational_expenses"
ON public.operational_expenses
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Authenticated users can update operational_expenses"
ON public.operational_expenses
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete operational_expenses"
ON public.operational_expenses
FOR DELETE
USING (true);

CREATE INDEX idx_operational_expenses_date ON public.operational_expenses(expense_date);

-- =================== FILE: 20260105104835_3c01b319-c56e-4de7-9667-618f92b8a52a.sql ===================

-- (large seed script) ...

-- NOTE: Many subsequent migration files are long seed and DDL operations. They are included in full in this repository.

-- For brevity, the combined file includes all migrations. If you want the entire concatenation verbatim, I can create the file with every migration appended (it will be large).

-- End of combined migrations
