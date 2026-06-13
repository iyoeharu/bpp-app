-- Tabel pembayaran nota belanja (pembayaran hutang/invoice ke toko)
-- Jalankan via: node tools/run_sql_file.mjs supabase/create_nota_payments.sql <connectionString>
CREATE TABLE IF NOT EXISTS public.nota_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nota_payments_store ON public.nota_payments(store);
CREATE INDEX IF NOT EXISTS idx_nota_payments_date ON public.nota_payments(payment_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nota_payments TO authenticated;
GRANT ALL ON public.nota_payments TO service_role;

ALTER TABLE public.nota_payments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='nota_payments' AND policyname='nota_payments_all_authenticated') THEN
    CREATE POLICY nota_payments_all_authenticated ON public.nota_payments
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END$$;
