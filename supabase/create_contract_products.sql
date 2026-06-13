-- Tabel barang/produk untuk tiap kontrak kredit
-- Jalankan via: node tools/run_sql_file.mjs supabase/create_contract_products.sql
CREATE TABLE IF NOT EXISTS public.contract_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.credit_contracts(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 1,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'cash' CHECK (status IN ('hutang','cash')),
  store text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_products_contract_id ON public.contract_products(contract_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_products TO authenticated;
GRANT ALL ON public.contract_products TO service_role;

ALTER TABLE public.contract_products ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contract_products' AND policyname='contract_products_all_authenticated') THEN
    CREATE POLICY contract_products_all_authenticated ON public.contract_products
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END$$;
