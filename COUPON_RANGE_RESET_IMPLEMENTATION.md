# Coupon Range Reset Implementation

Fitur ini menambahkan mekanisme reset range kupon yang sudah terproses untuk mitigasi human error (contoh: kelebihan input pembayaran/kupon), dengan rekalkulasi otomatis saldo/status kontrak.

## 1) Database schema adjustments

Migration:
- `supabase/migrations/20260701103000_coupon_range_reset_and_integrity.sql`

Yang ditambahkan:
- Tabel audit `coupon_range_adjustments`:
  - Menyimpan range yang di-reset, jumlah payment yang dihapus, status/index sebelum-sesudah, alasan, user.
- Integrity constraints:
  - `coupon_handovers` harus konsisten: `coupon_count = end_index - start_index + 1`.
  - `payment_logs.installment_index >= 1`.
- RPC function:
  - `reset_coupon_payment_range(...)` untuk rollback range yang sudah diproses.

## 2) Backend logic (RPC)

Alur `reset_coupon_payment_range`:
1. Validasi parameter range.
2. Verifikasi password admin dari `app_settings.key = 'admin_password'`.
3. Lock baris kontrak (`FOR UPDATE`) agar aman dari race condition.
4. Hapus `payment_logs` pada range target.
5. Set `installment_coupons.status = 'unpaid'` untuk range target.
6. Hitung ulang `current_installment_index` dari `MAX(payment_logs.installment_index)`.
7. Hitung ulang status kontrak:
   - Tetap `returned` jika sebelumnya returned.
   - `completed` jika index baru >= tenor.
   - selain itu `active`.
8. Simpan audit trail ke `coupon_range_adjustments`.

## 3) Sample frontend code

Hook yang disediakan:
- `src/hooks/useCouponRangeReset.ts`

Contoh pemakaian:

```ts
import { useResetCouponRange } from "@/hooks/useCouponRangeReset";

const resetRange = useResetCouponRange();

await resetRange.mutateAsync({
  contractId: "<uuid-contract>",
  startIndex: 51,
  endIndex: 60,
  reason: "Koreksi kelebihan input pembayaran batch",
  adminPassword: "<password-admin>",
});
```

Output RPC berisi ringkasan hasil reset:
- `deleted_payment_count`
- `before_current_installment_index`
- `after_current_installment_index`
- `before_status`
- `after_status`

## 4) Catatan integritas data

- Operasi reset bersifat idempoten secara bisnis pada range yang sama (jika sudah tidak ada payment di range, `deleted_payment_count` bisa 0).
- Audit tidak dihapus saat reset berikutnya sehingga histori koreksi tetap lengkap.
- Disarankan membatasi UI reset range hanya untuk role admin dan mewajibkan alasan koreksi.
