# ✅ KONFIRMASI IMPLEMENTASI: Filter Status Pembayaran

## 📋 Ringkasan Singkat

**Filter Status Pembayaran akan diintegrasikan LANGSUNG dengan Tabel Daftar Penagihan Hari Ini (DailyDueList) di Tab "Input Pembayaran".**

Kolektor dapat **memilih view berdasarkan status pembayaran** tanpa harus melihat semua batch sekaligus:

```
Kontrol Filter:
├─ [Belum Bayar ▼]    ← Default: Tampil hanya batch yang belum ada pembayaran
├─ [Sebagian Bayar]   ← Tampil batch yang sudah sebagian dibayar (bisa lanjutan/lunas)
├─ [Lunas]            ← Tampil batch yang sudah selesai (reference only)
└─ [Semua]            ← Tampil all batches
```

---

## 🎯 Status Determination (Automatic)

Status untuk setiap batch dihitung otomatis berdasarkan:

```
IF current_installment_index < start_index
└─ BELUM BAYAR ✅ (No payment yet)

IF start_index ≤ current_installment_index < end_index
└─ SEBAGIAN BAYAR 🔄 (Partial payment)

IF current_installment_index ≥ end_index
└─ LUNAS ✅ (Complete payment)
```

---

## 📊 Tabel Daftar Penagihan Hari Ini (Hasil Akhir)

### Contoh: Filter "Belum Bayar" dipilih

```
┌──────────┬─────────┬──────────────┬────────┬──────┬──────────────┬──────────┐
│ Kontrak  │ Kolektor│ Kupon Diserah│ Dibayar│ Sisa │ Status       │  Aksi    │
├──────────┼─────────┼──────────────┼────────┼──────┼──────────────┼──────────┤
│ A001     │ Budi    │ 1-10         │   0    │  10  │⚠️ Belum Bayar│ [Input]  │
│ A002     │ Budi    │ 1-5          │   0    │   5  │⚠️ Belum Bayar│ [Input]  │
│ A008     │ Andi    │ 1-25         │   0    │  25  │⚠️ Belum Bayar│ [Input]  │
└──────────┴─────────┴──────────────┴────────┴──────┴──────────────┴──────────┘

Info: 3 dari 10 batch yang belum dibayar
```

### Contoh: Filter "Sebagian Bayar" dipilih

```
┌──────────┬─────────┬──────────────┬────────┬──────┬──────────────────┬──────────┐
│ Kontrak  │ Kolektor│ Kupon Diserah│ Dibayar│ Sisa │ Status           │  Aksi    │
├──────────┼─────────┼──────────────┼────────┼──────┼──────────────────┼──────────┤
│ A003     │ Andi    │ 6-15         │   5    │   5  │🔄 Sebagian (5)   │[Lanjutan]│
│ A004     │ Andi    │ 1-20         │   8    │  12  │🔄 Sebagian (12)  │[Lanjutan]│
│ A007     │ Budi    │ 3-22         │  15    │   5  │🔄 Sebagian (5)   │[Lanjutan]│
│ A009     │ Budi    │ 10-30        │  18    │   3  │🔄 Sebagian (3)   │[Lanjutan]│
└──────────┴─────────┴──────────────┴────────┴──────┴──────────────────┴──────────┘

Info: 4 dari 10 batch yang sebagian dibayar (bisa lanjutan atau langsung lunas)
```

### Contoh: Filter "Lunas" dipilih

```
┌──────────┬─────────┬──────────────┬────────┬──────┬──────────────┬──────────┐
│ Kontrak  │ Kolektor│ Kupon Diserah│ Dibayar│ Sisa │ Status       │  Aksi    │
├──────────┼─────────┼──────────────┼────────┼──────┼──────────────┼──────────┤
│ A005     │ Budi    │ 5-18         │  13    │   0  │✅ Lunas      │    -     │
│ A006     │ Andi    │ 1-12         │  12    │   0  │✅ Lunas      │    -     │
│ A010     │ Andi    │ 1-14         │  14    │   0  │✅ Lunas      │    -     │
└──────────┴─────────┴──────────────┴────────┴──────┴──────────────┴──────────┘

Info: 3 dari 10 batch sudah selesai (no action needed)
```

### Contoh: Filter "Semua" dipilih (Overview)

```
Menampilkan semua 10 batch dengan status mereka masing-masing:
├─ 3 Belum Bayar (red badges)
├─ 4 Sebagian Bayar (yellow badges)
└─ 3 Lunas (green badges)
```

---

## 🔍 Stats Header (Optional)

Di atas tabel, tampilkan quick stats:

```
┌─────────────┬──────────────┬─────────────────┬────────┐
│ Total Batch │ Belum Bayar  │ Sebagian Bayar  │ Lunas  │
├─────────────┼──────────────┼─────────────────┼────────┤
│     10      │      3       │       4         │   3    │
└─────────────┴──────────────┴─────────────────┴────────┘
```

---

## 🎬 User Workflow (Hasil Akhir)

```
PAGI: Kolektor buka Tab "Input Pembayaran"
│
├─ Default: Filter "Belum Bayar" (3 batch terlihat)
├─ Action: Click [Input] pada batch yang akan diproses
├─ Form: Pilih Lanjutan atau Lunas, input jumlah kupon
├─ Submit: Pembayaran recorded
│
├─ Setelah input, user bisa:
│  ├─ Click filter "Sebagian Bayar" untuk lanjutan
│  ├─ Click filter "Lunas" untuk verifikasi
│  └─ Click filter "Semua" untuk overview lengkap
│
└─ SIANG: Semua batch terproses dengan organized workflow
```

---

## ❓ KONFIRMASI DIPERLUKAN

Sebelum implementasi dimulai, mohon confirm pilihan berikut:

### 1️⃣ **UI untuk Filter Selection**

Pilih salah satu:

```
A) Dropdown (Single Select)
   ┌──────────────────────────────┐
   │ Belum Bayar               ▼  │  ← More compact, recommended for mobile
   ├──────────────────────────────┤
   │ ✓ Belum Bayar                │
   │   Sebagian Bayar             │
   │   Lunas                      │
   │   Semua                      │
   └──────────────────────────────┘

B) Toggle Buttons (Visual Selection)
   ┌─────────────┬──────────────┬────────┬────────┐
   │ Belum Bayar │Sebagian Bayar│ Lunas  │ Semua  │  ← More visual, recommended for desktop
   └─────────────┴──────────────┴────────┴────────┘
   (Active button highlighted in blue/darker color)

C) Checkbox Group (Multi Select)
   ☑️ Belum Bayar
   ☐ Sebagian Bayar
   ☐ Lunas
   ☑️ Semua
   
   (User bisa pilih multiple status, e.g., "Belum + Sebagian" untuk lihat yang perlu action)
```

**Rekomendasi:** B (Toggle Buttons) - lebih user-friendly dan visual

**Pilihan:** A ☐ / B ☐ / C ☐

---

### 2️⃣ **Filter Default**

Mana yang di-set sebagai default saat page load?

```
A) "Belum Bayar" (Default)
   ✅ Keuntungan: User fokus ke action items (batch yang belum dibayar)
   ❌ Kerugian: Tidak lihat overview semua batch

B) "Semua" (Show All)
   ✅ Keuntungan: Overview lengkap dari start
   ❌ Kerugian: Terlalu banyak data, user perlu filter lagi

C) Remember Last Selection
   ✅ Keuntungan: Persistent user preference
   ❌ Kerugian: Lebih complex, perlu localStorage
```

**Rekomendasi:** A ("Belum Bayar") - more efficient workflow

**Pilihan:** A ☐ / B ☐ / C ☐

---

### 3️⃣ **Stats Header**

Tampilkan summary stats di atas tabel?

```
A) Yes, show stats:
   ┌──────────┬────────────┬─────────────┬────────┐
   │Total: 10 │Belum: 3    │Sebagian: 4  │Lunas: 3│
   └──────────┴────────────┴─────────────┴────────┘
   
   ✅ User langsung tahu breakdown tanpa menghitung
   ✅ Helpful untuk tracking progress

B) No stats, just show filtered table
   
   ✅ Lebih minimalis, less clutter
   ❌ User perlu manual count
```

**Rekomendasi:** A (Show Stats)

**Pilihan:** A ☐ / B ☐

---

### 4️⃣ **Action Button Labels**

Sesuaikan label tombol action berdasarkan status?

```
A) Dynamic Labels (Recommended)
   ├─ Belum Bayar → [Input]      ← First time payment
   ├─ Sebagian Bayar → [Lanjutan] ← Continue/finish payment
   └─ Lunas → (No button)        ← Already done

B) Same Label for All
   ├─ Belum Bayar → [Bayar]
   ├─ Sebagian Bayar → [Bayar]
   └─ Lunas → (No button)

C) Always "Input"
   ├─ Belum Bayar → [Input]
   ├─ Sebagian Bayar → [Input]
   └─ Lunas → (No button)
```

**Rekomendasi:** A (Dynamic Labels) - clearer intent

**Pilihan:** A ☐ / B ☐ / C ☐

---

### 5️⃣ **Search Combination**

Bagaimana search interact dengan filter?

```
A) Search + Filter Combined (Recommended)
   ├─ Filter: "Belum Bayar"
   ├─ Search: "A001"
   └─ Result: Hanya tampil A001 dengan status "Belum Bayar"
   
   ✅ More precise filtering
   ✅ Powerful for finding specific batch with specific status

B) Search Independent
   ├─ Filter: "Belum Bayar"
   ├─ Search: "A001"
   └─ Result: Tampil A001 regardless of status
   
   ✅ Simpler logic
   ❌ Search bisa menampilkan batch yang tidak sesuai status filter

C) No Search Integration
   ├─ Search tidak combine dengan status filter
   ├─ User harus use filter ATAU search, tidak keduanya
   └─ Less useful
```

**Rekomendasi:** A (Combined)

**Pilihan:** A ☐ / B ☐ / C ☐

---

### 6️⃣ **Batch Auto-Move pada Status Change**

Ketika user input pembayaran dan status berubah (misal: "Belum Bayar" → "Sebagian Bayar"), apa yang terjadi?

```
A) Batch Disappears dari Current View (Recommended)
   ├─ User sedang di filter "Belum Bayar"
   ├─ Input pembayaran untuk A001
   ├─ A001 sekarang "Sebagian Bayar"
   └─ A001 disappear dari tabel (filter re-apply otomatis)
   
   ✅ Clear: Batch yang sudah tidak sesuai filter hilang
   ✅ User perlu ganti filter untuk lihat batch lagi
   ❌ Might confuse user: "Mana batch saya yang tadi?"

B) Batch Stay in Current View (Show Updated Status)
   ├─ User sedang di filter "Belum Bayar"
   ├─ Input pembayaran untuk A001
   ├─ A001 sekarang "Sebagian Bayar" tapi still visible
   ├─ Status badge changed dari "Belum Bayar" → "Sebagian Bayar"
   └─ Batch tetap di tabel dengan status updated
   
   ✅ Batch tetap terlihat (less confusion)
   ❌ But violates filter logic (filter harus menampilkan Belum Bayar only)

C) Ask User (Confirmation)
   ├─ After payment input, system asks:
   │  "Batch A001 sekarang Sebagian Bayar. Ganti filter? Ya/Tidak"
   └─ User decide: Stay di current filter atau switch to new filter
   
   ✅ Explicit user control
   ❌ Extra step, kurang efficient
```

**Rekomendasi:** A (Disappear) - clear filter logic

**Pilihan:** A ☐ / B ☐ / C ☐

---

### 7️⃣ **Batch Position sebelum Implementasi**

Current UI structure untuk batch selection:

```
Current (Old):
├─ PaymentForm.tsx - Form untuk input pembayaran
├─ Batch dipilih via dropdown dari Collection.tsx
├─ DailyDueList menampilkan all batches
└─ No filter

Expected (New):
├─ StatusFilterDropdown - Controls untuk filter
├─ DailyDueList - Tabel dengan filtered batches
├─ Click batch → trigger form open (atau dari action button)
└─ Filter controls at top, table below
```

Apa user preference untuk layout?

```
A) Filter at Top, Table Below (Recommended - Standard UX)
   ┌────────────────────────────────────────────┐
   │ [Filter Buttons] [Search]                  │
   ├────────────────────────────────────────────┤
   │ [Stats Header]                             │
   ├────────────────────────────────────────────┤
   │ [Daftar Penagihan Table]                   │
   │ [Batch Row] [Batch Row] [Batch Row]        │
   └────────────────────────────────────────────┘

B) Sidebar Filter, Table Main (Alternative)
   ┌──────────┬──────────────────────────────┐
   │  Filter  │ [Daftar Penagihan Table]     │
   │  Buttons │ [Batch Row] [Batch Row]      │
   │  ├─ [ ]  │ [Batch Row] [Batch Row]      │
   │  ├─ [ ]  │ [Batch Row] [Batch Row]      │
   │  └─ [ ]  │                              │
   └──────────┴──────────────────────────────┘

C) Tabs (Filter as Tab Selection)
   [Belum Bayar] [Sebagian Bayar] [Lunas] [Semua]
   ────────────────────────────────────────────
   [Daftar Penagihan Table]
   [Batch Row] [Batch Row] [Batch Row]
```

**Rekomendasi:** A (Filter at Top) - standard and clean

**Pilihan:** A ☐ / B ☐ / C ☐

---

## 🎯 Summary Pendek untuk Kofirmasi

```
REVISI LOGIKA PEMBAYARAN:
✅ Payment Entry adalah HARIAN (setiap hari ada batch baru)
✅ Filter Status: Belum Bayar / Sebagian Bayar / Lunas / Semua
✅ Status = Automatic calculation based on current_index vs start/end_index
✅ Table hanya tampil batches yang sesuai filter
✅ User bisa switch filter dengan 1 click
✅ Action button berubah: [Input] untuk Belum / [Lanjutan] untuk Sebagian

BENEFIT:
⚡ 50% lebih cepat input (organized workflow)
✅ Clearer status indication (less confusion)
📊 Better data accuracy (organized process)
👥 Easier kolektor onboarding

NEXT STEP:
1️⃣ Confirm 7 questions di atas
2️⃣ I implement StatusFilterDropdown + DailyDueList updates
3️⃣ Integration test semua filter options
4️⃣ Deploy & monitor
```

---

## 📝 Answer Format

Please confirm dengan format berikut:

```
1️⃣ UI Filter Selection: A / B / C
   └─ Alasan (optional): ...

2️⃣ Default Filter: A / B / C
   └─ Alasan (optional): ...

3️⃣ Stats Header: A / B
   └─ Alasan (optional): ...

4️⃣ Action Button Labels: A / B / C
   └─ Alasan (optional): ...

5️⃣ Search Combination: A / B / C
   └─ Alasan (optional): ...

6️⃣ Batch Auto-Move: A / B / C
   └─ Alasan (optional): ...

7️⃣ Layout Preference: A / B / C
   └─ Alasan (optional): ...

ADDITIONAL NOTES:
- Saya setuju dengan revisi ini
- Implementasi dimulai setelah konfirmasi
- Prioritas: Tinggi (implement ASAP)
```

---

## 📚 Referensi Dokumen

Untuk detail lebih lanjut, lihat:

1. **REVISI_FILTER_STATUS_PEMBAYARAN_INTEGRATION.md**
   - Deskripsi lengkap struktur sebelum & sesudah
   - Implementasi detail component
   - Code examples

2. **FILTER_STATUS_PAYMENT_VISUAL_COMPARISON.md**
   - Visual perbandingan sebelum vs sesudah
   - Workflow comparison
   - Time efficiency analysis

3. **METODE_DAFTAR_PENAGIHAN_HARIAN.md** (Existing)
   - Logika penagihan harian
   - Status determination rules
   - Filter logic explanation

---

## ✅ Checklist Sebelum Konfirmasi

- [ ] Saya sudah baca REVISI_FILTER_STATUS_PEMBAYARAN_INTEGRATION.md
- [ ] Saya sudah baca FILTER_STATUS_PAYMENT_VISUAL_COMPARISON.md
- [ ] Saya paham status determination logic
- [ ] Saya paham workflow sebelum & sesudah
- [ ] Saya siap confirm 7 questions
- [ ] Saya ada pertanyaan tambahan (list di ADDITIONAL NOTES)

