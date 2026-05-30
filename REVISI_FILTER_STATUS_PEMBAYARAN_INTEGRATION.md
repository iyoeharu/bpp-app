# 🔄 Revisi: Filter Status Pembayaran + Daftar Penagihan Harian

## Executive Summary

Filter Status Pembayaran akan **terintegrasi langsung** dengan Tabel Daftar Penagihan Hari Ini (DailyDueList) di Tab "Input Pembayaran". Filter ini memungkinkan kolektor untuk **memilih batches berdasarkan status pembayaran** tanpa harus menampilkan semua batch sekaligus.

---

## 1. Struktur Sebelum (Before)

### Tab "Input Pembayaran" (Collection.tsx)

```
┌─────────────────────────────────────────────────────┐
│         TAB INPUT PEMBAYARAN (Payment)              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [Select Handover Batch (dropdown)]                 │
│                                                     │
│  ├─ Batch 1 | Contract A001 | 1-10 | (Auto)        │
│  ├─ Batch 2 | Contract A002 | 1-5  | (Auto)        │
│  ├─ Batch 3 | Contract A003 | 6-15 | (Manual)      │
│  ├─ Batch 4 | Contract A004 | 1-20 | (Manual)      │
│  └─ ...                                             │
│                                                     │
│  Kondisi:                                           │
│  ├─ Menampilkan SEMUA batch (tidak ada filter)      │
│  ├─ User harus scroll/cari batch yang diinginkan    │
│  └─ Tidak bisa melihat status pembayaran sekilas    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### DailyDueList Component

```
┌─────────────────────────────────────────────────────┐
│         DAFTAR PENAGIHAN HARI INI                   │
├─────────────────────────────────────────────────────┤
│  Contract | Kolektor | Kupon Diserah | Status      │
├─────────────────────────────────────────────────────┤
│  A001     | Budi     | 1-10         | ✅ Done      │
│  A002     | Budi     | 1-5          | ✅ Done      │
│  A003     | Andi     | 6-15         | ⚠️  Pending  │
│  A004     | Andi     | 1-20         | ⚠️  Pending  │
│  ...                                                │
│                                                     │
│  Kondisi:                                           │
│  ├─ Menampilkan semua handover batches              │
│  ├─ Status ditampilkan tapi tidak bisa difilter     │
│  └─ Harus lihat seluruh list untuk cari status      │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 2. Struktur Sesudah (After) ✅

### Tab "Input Pembayaran" dengan Filter Status

```
┌─────────────────────────────────────────────────────────────────┐
│              TAB INPUT PEMBAYARAN (Payment)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Filter Status Pembayaran:                                      │
│  [Belum Bayar ▼] [Sebagian Bayar ▼] [Lunas ▼] [Semua ▼]      │
│                                                                 │
│  Atau secara individual:                                        │
│  ┌─ ☐ Belum Bayar      ┌─ ☑ Sebagian Bayar                   │
│  └─ ☐ Lunas            └─ ☐ (custom filter)                   │
│                                                                 │
│  Search: [Search Contract / Kolektor]                          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────┐       │
│  │   DAFTAR PENAGIHAN HARI INI (Filtered)            │       │
│  ├─────────────────────────────────────────────────────┤       │
│  │ Contract | Kolektor | Kupon | Status    | Action  │       │
│  ├─────────────────────────────────────────────────────┤       │
│  │ A003     | Andi     | 6-15  | ⚠️ Belum  | [Input] │       │
│  │ A004     | Andi     | 1-20  | ⚠️ Belum  | [Input] │       │
│  │ A005     | Budi     | 5-18  | ⚠️ Belum  | [Input] │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                 │
│  Info: 3 batch yang belum dibayar ditampilkan                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Filter Status Pembayaran - Definisi Lengkap

### A. Status Determination Logic

```typescript
// Berdasarkan coupon_handovers table dan payment_logs

Status "BELUM BAYAR" (No Payment Yet)
├─ Kondisi: current_installment_index < start_index
├─ Arti: Belum ada pembayaran untuk batch ini sama sekali
├─ Action: User harus input pembayaran pertama kali
└─ Contoh:
   ├─ start_index: 5, current_index: 0 → BELUM BAYAR ✅
   └─ start_index: 5, current_index: 4 → BELUM BAYAR ✅

Status "SEBAGIAN BAYAR" (Partial Payment)
├─ Kondisi: start_index ≤ current_installment_index < end_index
├─ Arti: Ada pembayaran tapi belum sampai end_index
├─ Action: User bisa lanjutan (tambah pembayaran) atau langsung lunas
└─ Contoh:
   ├─ start_index: 5, end_index: 15, current_index: 10 → SEBAGIAN ✅
   └─ start_index: 5, end_index: 15, current_index: 7 → SEBAGIAN ✅

Status "LUNAS" (Complete Payment)
├─ Kondisi: current_installment_index ≥ end_index
├─ Arti: Semua kupon dalam batch sudah dibayar
├─ Action: Batch ini SELESAI, tidak perlu input lagi
└─ Contoh:
   ├─ start_index: 5, end_index: 15, current_index: 15 → LUNAS ✅
   └─ start_index: 5, end_index: 15, current_index: 20 → LUNAS ✅
```

### B. Filter Options

```
Filter Dropdown / Checkbox:

1️⃣ "Belum Bayar" (Default)
   ├─ Show ONLY: Batch dengan status "Belum Bayar"
   ├─ Usecase: Kolektor mau lihat batches yang baru diserahkan
   └─ SQL: WHERE current_installment_index < start_index

2️⃣ "Sebagian Bayar"
   ├─ Show ONLY: Batch dengan status "Sebagian Bayar"
   ├─ Usecase: Kolektor mau lanjutan atau selesaiin pembayaran
   └─ SQL: WHERE start_index ≤ current_installment_index < end_index

3️⃣ "Lunas"
   ├─ Show ONLY: Batch dengan status "Lunas"
   ├─ Usecase: QC/verifikasi, atau lihat riwayat hari ini
   └─ SQL: WHERE current_installment_index ≥ end_index

4️⃣ "Semua" (Show All)
   ├─ Show ALL: Semua batch tanpa filter status
   ├─ Usecase: Admin mau lihat overview lengkap
   └─ SQL: No WHERE clause for status

5️⃣ Multiple Select (Optional)
   ├─ Allow: Kombinasi filter (misal: Belum Bayar + Sebagian Bayar)
   ├─ Usecase: User mau lihat batches yang masih action-needed
   └─ SQL: WHERE (condition1) OR (condition2)
```

---

## 4. Implementasi UI - DailyDueList Component

### Component Structure

```tsx
<DailyDueList>
  ├─ Header
  │  ├─ Title: "Daftar Penagihan Hari Ini"
  │  ├─ Filter Controls
  │  │  ├─ Status Filter Dropdown/Checkbox
  │  │  │  ├─ "Belum Bayar" (default)
  │  │  │  ├─ "Sebagian Bayar"
  │  │  │  ├─ "Lunas"
  │  │  │  └─ "Semua"
  │  │  └─ Search Input (contract_ref, kolektor name)
  │  │
  │  └─ Quick Stats
  │     ├─ Total Batches: 10
  │     ├─ Belum Bayar: 3
  │     ├─ Sebagian Bayar: 4
  │     └─ Lunas: 3
  │
  ├─ Table
  │  ├─ Headers: Contract | Kolektor | Range | Paid | Sisa | Status | Action
  │  ├─ Rows: Filtered handover records with calculated status
  │  └─ Pagination: 10 items per page
  │
  └─ Footer
     └─ "Showing X of Y batches" (e.g., "Showing 3 of 10 batches")
```

### Filter Behavior

```
User Interaction Flow:

1. Page Load
   ├─ Default Filter: "Belum Bayar"
   └─ Show: Only unprocessed handovers

2. User Clicks "Sebagian Bayar"
   ├─ Table re-renders
   ├─ Filter Applied: start_index ≤ current_index < end_index
   └─ Show: Only partial payment batches

3. User Clicks "Lunas"
   ├─ Table re-renders
   ├─ Filter Applied: current_index ≥ end_index
   └─ Show: Completed batches (for reference)

4. User Clicks "Semua"
   ├─ Table re-renders
   ├─ No Filter: Show all batches
   └─ Show: All 10 batches

5. User Types in Search
   ├─ COMBINE with Status Filter
   ├─ Example: Filter="Belum Bayar" + Search="A001"
   └─ Show: Only A001 batches with "Belum Bayar" status
```

---

## 5. Data Flow Integration

### Collection.tsx State Management

```typescript
// Collection.tsx additions

export default function Collection() {
  // Existing state
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDate());
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("unpaid");
  
  // NEW: Add status filter state
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<"belum_bayar" | "sebagian_bayar" | "lunas" | "semua">("belum_bayar");
  
  // Fetch handovers for today
  const { data: handovers } = useCouponHandovers(selectedDate);
  
  // Filter logic for DailyDueList
  const filteredHandovers = useMemo(() => {
    if (!handovers) return [];
    
    return handovers.filter((batch) => {
      const { start_index, end_index, current_installment_index } = batch;
      
      if (paymentStatusFilter === "semua") return true;
      
      if (paymentStatusFilter === "belum_bayar") {
        return current_installment_index < start_index;
      }
      
      if (paymentStatusFilter === "sebagian_bayar") {
        return start_index <= current_installment_index && current_installment_index < end_index;
      }
      
      if (paymentStatusFilter === "lunas") {
        return current_installment_index >= end_index;
      }
      
      return true;
    });
  }, [handovers, paymentStatusFilter]);
  
  return (
    <Tabs>
      <TabsContent value="payment">
        {/* Filter Controls */}
        <div className="flex gap-2 mb-4">
          <StatusFilterDropdown 
            value={paymentStatusFilter}
            onChange={setPaymentStatusFilter}
          />
          <SearchInput 
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Cari kontrak / kolektor..."
          />
        </div>
        
        {/* DailyDueList dengan filtered data */}
        <DailyDueList 
          handovers={filteredHandovers}
          onSelectBatch={setPaymentSelectedContract}
        />
      </TabsContent>
    </Tabs>
  );
}
```

### DailyDueList Component dengan Filter

```tsx
interface DailyDueListProps {
  handovers: CouponHandover[];
  onSelectBatch: (contractId: string) => void;
}

export function DailyDueList({ handovers, onSelectBatch }: DailyDueListProps) {
  // Calculate status untuk setiap batch
  const getStatus = (batch: CouponHandover) => {
    const { start_index, end_index, current_installment_index } = batch;
    
    if (current_installment_index < start_index) return "belum_bayar";
    if (current_installment_index >= end_index) return "lunas";
    return "sebagian_bayar";
  };
  
  // Calculate remaining coupons
  const getRemaining = (batch: CouponHandover) => {
    return batch.end_index - Math.max(batch.current_installment_index, batch.start_index - 1);
  };
  
  // Calculate paid coupons
  const getPaid = (batch: CouponHandover) => {
    return Math.max(0, batch.current_installment_index - batch.start_index + 1);
  };
  
  return (
    <div className="space-y-4">
      {/* Stats Header */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total" value={handovers.length} />
        <StatCard 
          label="Belum Bayar" 
          value={handovers.filter(h => getStatus(h) === "belum_bayar").length}
          color="red"
        />
        <StatCard 
          label="Sebagian Bayar" 
          value={handovers.filter(h => getStatus(h) === "sebagian_bayar").length}
          color="yellow"
        />
        <StatCard 
          label="Lunas" 
          value={handovers.filter(h => getStatus(h) === "lunas").length}
          color="green"
        />
      </div>
      
      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Kontrak</TableHead>
            <TableHead>Kolektor</TableHead>
            <TableHead>Kupon Diserah</TableHead>
            <TableHead>Dibayar</TableHead>
            <TableHead>Sisa</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {handovers.map((batch) => {
            const status = getStatus(batch);
            const paid = getPaid(batch);
            const remaining = getRemaining(batch);
            
            return (
              <TableRow key={batch.id}>
                <TableCell>{batch.contract_ref}</TableCell>
                <TableCell>{batch.collector_name}</TableCell>
                <TableCell>{batch.start_index}-{batch.end_index}</TableCell>
                <TableCell>{paid}</TableCell>
                <TableCell>{remaining}</TableCell>
                <TableCell>
                  <StatusBadge 
                    status={status}
                    remaining={remaining}
                  />
                </TableCell>
                <TableCell>
                  {status !== "lunas" && (
                    <Button 
                      size="sm"
                      onClick={() => onSelectBatch(batch.contract_id)}
                    >
                      {status === "belum_bayar" ? "Input" : "Lanjutan"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```

### StatusBadge Component

```tsx
interface StatusBadgeProps {
  status: "belum_bayar" | "sebagian_bayar" | "lunas";
  remaining: number;
}

export function StatusBadge({ status, remaining }: StatusBadgeProps) {
  switch (status) {
    case "belum_bayar":
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700">
          ⚠️ Belum Bayar
        </Badge>
      );
    case "sebagian_bayar":
      return (
        <Badge variant="outline" className="bg-yellow-50 text-yellow-700">
          🔄 Sebagian Bayar ({remaining} sisa)
        </Badge>
      );
    case "lunas":
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700">
          ✅ Lunas
        </Badge>
      );
  }
}
```

---

## 6. Filter Options UI Component

### Option A: Dropdown (Recommended for mobile)

```tsx
<Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
  <SelectTrigger className="w-[200px]">
    <SelectValue placeholder="Filter Status" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="belum_bayar">⚠️ Belum Bayar</SelectItem>
    <SelectItem value="sebagian_bayar">🔄 Sebagian Bayar</SelectItem>
    <SelectItem value="lunas">✅ Lunas</SelectItem>
    <SelectItem value="semua">📋 Semua</SelectItem>
  </SelectContent>
</Select>
```

### Option B: Toggle Buttons (Recommended for desktop)

```tsx
<div className="flex gap-2">
  <Button
    variant={paymentStatusFilter === "belum_bayar" ? "default" : "outline"}
    onClick={() => setPaymentStatusFilter("belum_bayar")}
  >
    ⚠️ Belum Bayar
  </Button>
  <Button
    variant={paymentStatusFilter === "sebagian_bayar" ? "default" : "outline"}
    onClick={() => setPaymentStatusFilter("sebagian_bayar")}
  >
    🔄 Sebagian Bayar
  </Button>
  <Button
    variant={paymentStatusFilter === "lunas" ? "default" : "outline"}
    onClick={() => setPaymentStatusFilter("lunas")}
  >
    ✅ Lunas
  </Button>
  <Button
    variant={paymentStatusFilter === "semua" ? "default" : "outline"}
    onClick={() => setPaymentStatusFilter("semua")}
  >
    📋 Semua
  </Button>
</div>
```

### Option C: Checkbox Group (For advanced filtering)

```tsx
<div className="space-y-2">
  <label className="flex items-center gap-2">
    <Checkbox 
      checked={statusFilters.includes("belum_bayar")}
      onCheckedChange={(checked) => toggleStatusFilter("belum_bayar", checked)}
    />
    <span>⚠️ Belum Bayar</span>
  </label>
  <label className="flex items-center gap-2">
    <Checkbox 
      checked={statusFilters.includes("sebagian_bayar")}
      onCheckedChange={(checked) => toggleStatusFilter("sebagian_bayar", checked)}
    />
    <span>🔄 Sebagian Bayar</span>
  </label>
  <label className="flex items-center gap-2">
    <Checkbox 
      checked={statusFilters.includes("lunas")}
      onCheckedChange={(checked) => toggleStatusFilter("lunas", checked)}
    />
    <span>✅ Lunas</span>
  </label>
</div>
```

---

## 7. Complete User Journey Example

### Scenario: Kolektor Andi pada Hari X

```
PAGI - Serah Terima Kupon (Tab "Belum Bayar")
├─ Supervisor serahkan kupon untuk 5 kontrak:
│  ├─ A001: kupon 1-10
│  ├─ A002: kupon 1-5
│  ├─ A003: kupon 6-15
│  ├─ A004: kupon 1-20
│  └─ A005: kupon 5-18
│
└─ 5 handover records dibuat di DB dengan current_index=0 (untuk A001-A002)
   atau current_index sesuai previous balance (untuk A003-A005)

---

SIANG - Input Pembayaran (Tab "Input Pembayaran")
├─ Andi buka tab "Input Pembayaran"
├─ Default Filter: "Belum Bayar" ✅
├─ Tampil di DailyDueList:
│  ├─ A001: 1-10 | Status: Belum Bayar | [Input]
│  ├─ A002: 1-5  | Status: Belum Bayar | [Input]
│  └─ (3 kontrak lain mungkin tidak tampil jika sudah pernah bayar)
│
├─ Andi input pembayaran A001: Bayar 7 dari 10
│  └─ current_index A001 = 7
│
├─ Andi ganti filter ke "Sebagian Bayar"
│  └─ Tampil di DailyDueList:
│     ├─ A001: 1-10 | Dibayar: 7 | Sisa: 3 | Status: Sebagian Bayar | [Lanjutan]
│     ├─ A003: 6-15 | Dibayar: 5 | Sisa: 5 | Status: Sebagian Bayar | [Lanjutan]
│     └─ (other partial payments)
│
├─ Andi click "Lanjutan" untuk A001
│  └─ Form open dengan pre-filled:
│     ├─ Contract: A001
│     ├─ Range: 1-10
│     ├─ Already paid: 7
│     ├─ Remaining: 3
│     └─ Option: Input 3 untuk Lunas atau kurang untuk Lanjutan
│
├─ Andi input 3 kupon (selesaikan A001)
│  └─ current_index A001 = 10 (LUNAS)
│
├─ Andi ganti filter ke "Lunas"
│  └─ Tampil di DailyDueList:
│     ├─ A001: 1-10 | Dibayar: 10 | Sisa: 0 | Status: ✅ Lunas | (no action)
│     └─ (other completed batches)
│
└─ Andi ganti filter ke "Semua"
   └─ Tampil di DailyDueList:
      ├─ A001: 1-10 | Status: ✅ Lunas | (no action)
      ├─ A002: 1-5  | Status: ⚠️ Belum Bayar | [Input]
      ├─ A003: 6-15 | Status: 🔄 Sebagian Bayar | [Lanjutan]
      ├─ A004: 1-20 | Status: 🔄 Sebagian Bayar | [Lanjutan]
      └─ A005: 5-18 | Status: ⚠️ Belum Bayar | [Input]
```

---

## 8. Implementation Checklist

### Phase 1: UI Components ⏳

- [ ] Create `StatusFilterDropdown` component
  - [ ] Dropdown / Toggle Button UI
  - [ ] Filter state management
  - [ ] Icons/badges for each status

- [ ] Update `DailyDueList` component
  - [ ] Add filter controls
  - [ ] Add status calculation logic
  - [ ] Add stats header (Total/Belum/Sebagian/Lunas)
  - [ ] Integrate with Collection.tsx

- [ ] Create `StatusBadge` component
  - [ ] Visual indicators for each status
  - [ ] Remaining coupon display
  - [ ] Color coding

### Phase 2: Integration 🔗

- [ ] Update `Collection.tsx`
  - [ ] Add `paymentStatusFilter` state
  - [ ] Add `filteredHandovers` calculation
  - [ ] Pass filter state to DailyDueList
  - [ ] Connect filter changes to table re-render

- [ ] Update `useCouponHandovers` hook
  - [ ] Ensure returns required fields (start_index, end_index, current_index)
  - [ ] Add status calculation in hook if needed

- [ ] Add Filter Persistence (Optional)
  - [ ] Save last selected filter to localStorage
  - [ ] Restore on page reload

### Phase 3: Testing 🧪

- [ ] Test all filter options
  - [ ] "Belum Bayar" shows only unprocessed batches
  - [ ] "Sebagian Bayar" shows partial batches
  - [ ] "Lunas" shows completed batches
  - [ ] "Semua" shows all batches

- [ ] Test with Search (combine filters)
  - [ ] Filter="Belum Bayar" + Search="A001" works correctly
  - [ ] Filter="Sebagian Bayar" + Search="Budi" works correctly

- [ ] Test status transitions
  - [ ] Batch moves from "Belum Bayar" → "Sebagian Bayar" after payment
  - [ ] Batch moves from "Sebagian Bayar" → "Lunas" after final payment

---

## 9. Pertanyaan untuk Konfirmasi ❓

Sebelum implementasi, mohon konfirmasi:

1. **Filter UI Preference:**
   - ☐ Dropdown (single select) - lebih simple
   - ☐ Toggle Buttons (multi option) - lebih visual
   - ☐ Checkbox Group (multi select) - lebih fleksibel

2. **Default Filter:**
   - ☐ "Belum Bayar" (show only unprocessed) - fokus ke action items
   - ☐ "Semua" (show all) - overview lengkap
   - ☐ Lain-lain?

3. **Stats Display:**
   - ☐ Tampilkan stats header (Total/Belum/Sebagian/Lunas) - lebih informatif
   - ☐ Tidak perlu stats header - lebih minimalis

4. **Table Actions:**
   - ☐ "Input" button untuk Belum Bayar, "Lanjutan" untuk Sebagian, no button untuk Lunas
   - ☐ Sama untuk semua status (all use same button label)
   - ☐ Lain-lain?

5. **Integrasi dengan Manual Payment Modal:**
   - ☐ Form harus auto-detect dan pre-fill based on selected batch
   - ☐ Form sudah siap untuk integrasi?

6. **Search Kombinasi:**
   - ☐ Search harus kombinasi dengan filter status
   - ☐ Atau search independent dari status filter?

---

## 10. Database Schema (Reference)

### Tables Terlibat

```sql
-- coupon_handovers: Track batches yang diserahkan ke kolektor
CREATE TABLE coupon_handovers (
  id BIGINT PRIMARY KEY,
  contract_id BIGINT,
  collector_id BIGINT,
  start_index INT,                    -- Kupon pertama yang diserahkan
  end_index INT,                      -- Kupon terakhir yang diserahkan
  coupon_count INT,                   -- Total kupon (end - start + 1)
  current_installment_index INT,      -- Terakhir dibayar (untuk status)
  handover_date DATE,
  status VARCHAR(50),
  created_at TIMESTAMP
);

-- Logika Status Filter berdasarkan field ini:
-- BELUM BAYAR:   current_installment_index < start_index
-- SEBAGIAN BAYAR: start_index ≤ current_installment_index < end_index
-- LUNAS:         current_installment_index ≥ end_index
```

---

## Summary

✅ **Filter Status Pembayaran** akan terintegrasi langsung dengan **Daftar Penagihan Hari Ini** di Tab "Input Pembayaran"

✅ Kolektor dapat **memilih view berdasarkan status**: Belum Bayar / Sebagian Bayar / Lunas / Semua

✅ **Status ditentukan otomatis** berdasarkan: current_installment_index vs start_index vs end_index

✅ **Table hanya menampilkan batches yang relevan** sesuai filter yang dipilih

✅ **Action buttons berubah** sesuai status: Input (Belum) / Lanjutan (Sebagian) / None (Lunas)

✅ **Efisiensi meningkat** karena kolektor hanya fokus ke batches yang perlu action
