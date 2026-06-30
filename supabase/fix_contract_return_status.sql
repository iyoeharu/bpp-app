-- Fix Return Kontrak agar aman pada database yang constraint status-nya berbeda nama.
-- Jalankan sekali di SQL Editor.

DO $$
DECLARE
  r record;
BEGIN
  -- Drop semua CHECK constraint pada credit_contracts yang mengandung kolom status.
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.credit_contracts'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.credit_contracts DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.credit_contracts
  ADD CONSTRAINT credit_contracts_status_check
  CHECK (status IN ('active', 'completed', 'returned'));

ALTER TABLE public.credit_contracts
  ADD COLUMN IF NOT EXISTS returned_at timestamptz;

UPDATE public.credit_contracts
SET returned_at = COALESCE(returned_at, created_at)
WHERE status = 'returned'
  AND returned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_credit_contracts_returned_at
  ON public.credit_contracts(returned_at)
  WHERE status = 'returned';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_contracts TO authenticated;
GRANT ALL ON public.credit_contracts TO service_role;

-- Paksa PostgREST refresh schema cache agar kolom returned_at langsung dikenali oleh API.
NOTIFY pgrst, 'reload schema';