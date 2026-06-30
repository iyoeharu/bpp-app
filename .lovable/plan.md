## Prinsip Akuntansi

- **Omset_Awal (immutable)**: nilai kontrak (`total_loan_amount`, `omset` modal, `dp`) **tetap diakui di bulan `start_date`** kontrak, bahkan jika nanti di-return. Tidak ada data historis yang diubah.
- **Penyesuaian Retur**: pada **bulan retur diajukan** (`returned_at`), omset/modal kontrak yang di-return **dikurangi** dari running total bulan tersebut. Bisa menghasilkan nilai negatif (mengindikasikan retur lebih besar dari penjualan baru).

Contoh: Kontrak A (omset 10jt) dibuat Mei → Mei omset +10jt. Bulan Juli di-return → Juli omset −10jt (Mei tidak berubah).

## Perubahan

### 1. Schema (file SQL baru, dijalankan manual)
`supabase/add_returned_at_to_contracts.sql`:
- `ALTER TABLE credit_contracts ADD COLUMN returned_at timestamptz;`
- Backfill: `UPDATE ... SET returned_at = updated_at WHERE status='returned' AND returned_at IS NULL;`

### 2. `src/pages/Contracts.tsx`
Saat menandai retur (`executeContractReturn`), tambahkan `returned_at: new Date().toISOString()` pada payload update.

### 3. `src/hooks/useOmsetDetails.ts` (bulanan & tahunan)
- Hapus filter `.neq('status','returned')` pada query utama. Sertakan semua kontrak yang `start_date`-nya di periode.
- Tambah query kedua: kontrak `status='returned'` dengan `returned_at` di periode.
- Hitung summary: `total_omset/modal/dp = SUM(kontrak start di periode) − SUM(kontrak returned di periode)`.
- Tambah field `return_adjustments` (array) + `total_return_adjustment` agar UI bisa menampilkan baris penyesuaian.

### 4. `src/components/dashboard/OmsetDetailDialog.tsx`
- Tampilkan ringkas "Penyesuaian Retur Bulan Ini: −Rp …" di bawah card total bila ada.
- Tag baris kontrak yang di-return di tabel (badge "Retur").

### 5. `src/hooks/useMonthlyPerformance.ts`
Logika serupa: include returned, fetch returns di periode, kurangi `total_omset/total_modal/profit` agen yang sesuai.

### 6. `src/hooks/useYearlyFinancialSummary.ts`
- Per bulan: tambah omset awal di bulan `start_date`, kurangi di bulan `returned_at`.
- Total tahunan otomatis ikut konsisten.

### 7. Tidak diubah (di luar scope omset)
- `useDpTotal`, `useAgentOmset`/`useAgentPerformance` (lifetime), `useReturnedLoss` (laporan kerugian terpisah), nota belanja, penagihan tertagih. Bisa di-revisi terpisah jika diperlukan.

## Catatan Implementasi
- Untuk kontrak yang start dan return di **bulan sama**, net = 0 (omset_awal − adjustment).
- Negative values di card omset diperbolehkan (sesuai permintaan sebelumnya untuk sisa hutang).
- Setelah migrasi SQL dijalankan, jalankan kembali untuk memastikan backfill `returned_at` terisi.
