-- Make customers.nik optional (nullable). Safe to re-run.
ALTER TABLE IF EXISTS public.customers
  ADD COLUMN IF NOT EXISTS nik text;

-- Drop NOT NULL if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers' AND column_name = 'nik' AND is_nullable = 'NO'
  ) THEN
    EXECUTE 'ALTER TABLE public.customers ALTER COLUMN nik DROP NOT NULL';
  END IF;
END$$;

-- Ensure unique constraint exists only for non-null values (partial unique index)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'customers' AND indexname = 'customers_nik_unique_partial'
  ) THEN
    CREATE UNIQUE INDEX customers_nik_unique_partial ON public.customers(nik) WHERE nik IS NOT NULL;
  END IF;
END$$;
