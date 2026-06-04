# 📊 QUICK REFERENCE - Komisi 12B Card

## 🎯 ONE-LINER
**Komisi 12B** = Total komisi semua sales agents untuk 1 tahun penuh, dihitung menggunakan sistem tier berdasarkan omset masing-masing agen.

---

## 📐 FORMULA SINGKAT

```
Komisi 12B = Σ(Omset_Agen × Komisi%) untuk semua agen dalam tahun terpilih

Komisi% ditentukan oleh:
├─ Jika ada tier config → automatic tier matching
└─ Jika tidak ada tier → gunakan default percentage
```

---

## 📍 LOKASI CARD

- **Page:** Dashboard (tab "KEUNTUNGAN" / Yearly view)
- **File:** `src/pages/Dashboard.tsx` line 762
- **Label:** "Komisi 12B"
- **Subtitle:** "Total komisi 12 bulan (tahun XX)"
- **Icon:** Percent symbol (%) - purple

---

## 💡 CONTOH SEDERHANA

**Jika ada 3 agen:**
```
Budi:    Rp 50M omset × 5% = Rp 2.5M komisi
Rina:   Rp 250M omset × 7% = Rp 17.5M komisi
Hendra: Rp 800M omset × 10% = Rp 80M komisi
─────────────────────────────────────────────
Total Komisi 12B = Rp 100M
```

---

## 🔧 KONFIGURASI TIER

**Table: `commission_tiers`**
```
Tier 1: 0 - 100M        → 5%
Tier 2: 100M - 500M     → 7%
Tier 3: 500M+           → 10%
```

**Tier matching:** Otomatis berdasarkan total omset agen dalam tahun terpilih

---

## 🔗 DATA DEPENDENCIES

```
commission_tiers (DB)  ─┐
                        ├─→ calculateTieredCommission()
yearlyFinancial.agents ┘
          ↓
calculateTieredCommission()
          ↓
yearlyCommissionTotal (useMemo)
          ↓
Dashboard Card "Komisi 12B"
```

---

## ✅ VERIFIKASI

**Cek apakah perhitungan benar:**
1. Dashboard → card "Komisi 12B" → catat nilai = X
2. Buka SalesAgents → tab Tahunan → tahun sama
3. Sum manual kolom "Komisi" → seharusnya = X
4. Jika match ✓ → calculation akurat

---

## ⚡ KEY POINTS

| Aspek | Keterangan |
|-------|-----------|
| **Apa** | Total komisi sales agents tahun ini |
| **Dari mana** | Aggregasi per-agen omset × tier % |
| **Tier** | Auto-selected berdasarkan omset size |
| **Update** | Real-time saat tier/agen data berubah |
| **Includes** | Komisi saja, BUKAN bonus tahunan 0.8% |

---

## 📌 RELATED CARDS

**Keuntungan Bersih Tahunan** (besar card di bawah):
```
= Keuntungan Kotor 
  − Komisi 12B ← [Card ini]
  − Biaya Operasional
  − Gaji Kolektor
```

---

## 🐛 JIKA NILAI TIDAK SESUAI

**Debug checklist:**
- [ ] Tahun selected benar?
- [ ] Commission tiers ada di DB? (`SELECT * FROM commission_tiers`)
- [ ] Agent omset data lengkap?
- [ ] Buka console → cek warning/error?
- [ ] Bandingkan SalesAgents tab Tahunan (manual verify)

---

## 📚 DOKUMENTASI LENGKAP

- `ANALISA_KOMISI_12B_CARD.md` - Formula & contoh lengkap
- `TECHNICAL_KOMISI_12B.md` - Implementation details & debugging

---

**Status:** ✅ Akurat & Terdokumentasi  
**Last Check:** 2026-06-05
