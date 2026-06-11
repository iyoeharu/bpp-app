## Tujuan
Selaraskan logika status & angka finansial di seluruh dashboard & detail dialog, dengan acuan tunggal: halaman **Riwayat Pelanggan** (`useContractStatusMap`).

---

## 1. Aturan Status Kontrak (single source of truth)

Update `src/lib/statusCalculation.ts` → `determineContractStatus`:

| Status        | Aturan baru                                                    |
|---------------|----------------------------------------------------------------|
| completed     | `status === 'completed'` atau semua kupon paid                 |
| sangat_lancar | `lateDays === 0` (tidak ada kupon overdue)                     |
| lancar        | `lateDays` 1-3                                                 |
| kurang_lancar | `lateDays` 4-20                                                |
| macet         | `lateDays > 20` **atau** `daysSinceLastPayment > 20`           |

`lateDays` = jumlah kupon **unpaid** yg `due_date < hari ini` (sudah dipakai di `useContractStatusMap`).
`daysSinceLastPayment` = hari sejak `due_date` kupon paid terakhir.

Konsekuensi: hapus rumus lama yang hanya mengandalkan `gap`. Semua page (Dashboard, Riwayat Pelanggan, Kontrak, Macet card) otomatis ikut karena memanggil fungsi ini.

---

## 2. Tertagih & Sisa Tagihan = basis kontrak (bulan start_date)

Ubah `src/hooks/useMonthlyPerformance.ts`:
- `total_collected` (Tertagih bulan X) = **SUM(payment_logs.amount_paid)** untuk seluruh kontrak yang `start_date`-nya di bulan X — **tanpa filter payment_date**. Jadi pembayaran kapan pun (bulan berikutnya dst.) tetap masuk ke bulan asal kontrak.
- `total_to_collect` (Sisa Tagihan bulan X) = `max(0, total_omset_bulan_X − total_collected_bulan_X)`.
- Per-agen `total_collected` juga pakai basis yg sama (sum payment kontrak agen yg start di bulan ini).

Ubah `src/hooks/useYearlyFinancialSummary.ts`:
- Tertagih bulanan di breakdown pakai basis kontrak (sama dgn monthly card).
- `total_collected` tahunan = SUM Tertagih bulanan (= SUM payment_logs untuk semua kontrak yang start_date-nya di tahun ini).
- `total_to_collect` tahunan = SUM Sisa Tagihan bulanan (sudah benar).

Ubah `src/hooks/useOutstandingDetails.ts` (detail dialog Sisa Tagihan):
- `total_paid` per kontrak/agen = SUM **semua** payment_logs untuk kontrak yg start di periode (hapus filter `payment_date`).
- `total_outstanding` = `max(0, total_loan_amount − total_paid)`.
- Hasil sekarang konsisten dengan card.

---

## 3. Komisi Tahunan = SUM komisi bulanan

Ubah `src/hooks/useYearlyFinancialSummary.ts`:
- Hapus rumus "0.8% × omset tahunan".
- Untuk setiap bulan: hitung komisi pakai tier (sama persis dgn `useMonthlyPerformance`) → omset per agen per bulan × tier yg cocok di bulan itu.
- `total_commission` tahunan = SUM komisi bulanan.
- `monthly_breakdown[*].commission` = komisi tier bulan tsb (bukan distribusi proporsional).
- `agents[*].total_commission` = SUM komisi bulanan per agen.

Ubah `src/pages/Dashboard.tsx`:
- `yearlyCommissionTotal` dipakai langsung dari `yearlyFinancial.total_commission` (hapus override 0.8%).
- `yearlyNetProfit` ikut otomatis.

---

## 4. Macet card = sudah pakai global dari Riwayat Pelanggan ✔
Tidak ada perubahan logika; cukup pastikan rule baru di `determineContractStatus` ikut terpakai (otomatis via `useMacetSummary`).

---

## File yang Disentuh
1. `src/lib/statusCalculation.ts` — rule SL/L/KL/Macet baru.
2. `src/hooks/useMonthlyPerformance.ts` — Tertagih basis kontrak.
3. `src/hooks/useYearlyFinancialSummary.ts` — Tertagih & Komisi sum dari bulanan.
4. `src/hooks/useOutstandingDetails.ts` — Detail konsisten dgn card.
5. `src/pages/Dashboard.tsx` — pakai `yearlyFinancial.total_commission` apa adanya.

Tidak ada perubahan schema DB.

---

## Catatan
- Aturan "macet kalau gap > 20 hari" tetap dipertahankan sebagai tambahan (kontrak tanpa pembayaran lama tetap macet meskipun belum punya kupon overdue dihitung dari due_date).
- Aturan lama "6 hari belum bayar → macet" tetap dihapus (sesuai keputusan sebelumnya).
- Halaman Kontrak & Customer History sudah memakai `useContractStatusMap`/`determineContractStatus`, jadi otomatis sinkron.
