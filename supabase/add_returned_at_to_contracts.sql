-- Tambah kolom returned_at untuk akuntansi retur basis bulan pengajuan.
-- Omset_Awal (nilai kontrak) tetap immutable di bulan start_date.
-- Penyesuaian retur dialokasikan ke bulan `returned_at`.

ALTER TABLE public.credit_contracts
  ADD COLUMN IF NOT EXISTS returned_at timestamptz;

-- Backfill: untuk kontrak yang sudah ter-return sebelum kolom dibuat,
-- isi returned_at dari created_at (best-effort dan kompatibel untuk DB lama).
UPDATE public.credit_contracts
SET returned_at = COALESCE(returned_at, created_at)
WHERE status = 'returned' AND returned_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_credit_contracts_returned_at
  ON public.credit_contracts(returned_at)
  WHERE status = 'returned';

NOTIFY pgrst, 'reload schema';
