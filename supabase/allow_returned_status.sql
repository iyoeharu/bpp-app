-- Allow 'returned' (macet permanen) status on credit_contracts
-- Jalankan SQL ini di Supabase SQL editor agar fungsi Return Kontrak berhasil.
ALTER TABLE public.credit_contracts
  DROP CONSTRAINT IF EXISTS credit_contracts_status_check;

ALTER TABLE public.credit_contracts
  ADD CONSTRAINT credit_contracts_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'returned'::text]));
