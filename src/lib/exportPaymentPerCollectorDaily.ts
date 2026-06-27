import ExcelJS from 'exceljs';
import type { PaymentWithRelations } from '@/hooks/usePayments';
import type { CouponHandover } from '@/hooks/useCouponHandovers';
import { getStatusLabel, type ContractStatus } from '@/lib/statusCalculation';
import type { ContractStatusInfo } from '@/hooks/useContractStatusMap';

interface PaymentDetail {
  contractId: string;
  customerName: string;
  contractRef: string;
  startIndex: number;        // pembayaran ke (start dari handover)
  endIndex: number;          // pembayaran ke (end dari handover)
  paidStartIndex: number;    // pembayaran ke (start yang sudah terbayar)
  paidEndIndex: number;      // pembayaran ke (end yang sudah terbayar)
  couponCount: number;       // jumlah kupon (handover)
  paidCount: number;         // kupon dibayar
  dailyAmount: number;
  totalAmount: number;       // tertagih (paidCount * dailyAmount)
  status: 'sangat_lancar' | 'lancar' | 'kurang_lancar' | 'macet' | 'lunas' | 'returned';
  statusLabel: string;
}

interface CollectorGroup {
  collectorId: string;
  collectorName: string;
  collectorCode: string;
  details: PaymentDetail[];
}

const HEADERS = [
  'No', 'Konsumen', 'Kode Kontrak', 'No Kupon', 'Kupon Dibayar', 'Kupon Sisa', 'Angsuran', 'Total Tertagih', 'Status'
];
// Increased widths for better readability, reduced Kode Kontrak with wrap text
const COL_WIDTHS = [6, 14, 12, 12, 11, 11, 12, 16, 15];

// Color tokens for payment status (based on paid vs total)
const PAYMENT_STATUS_FILLS: Record<string, { bg: string; fg: string }> = {
  not_paid:    { bg: 'FFFFC7CE', fg: 'FF9C0006' }, // red
  partial:     { bg: 'FFFFEB9C', fg: 'FF9C5700' }, // yellow
};

// Color tokens for status cells
const STATUS_FILLS: Record<PaymentDetail['status'], { bg: string; fg: string }> = {
  sangat_lancar:  { bg: 'FFEBF8E6', fg: 'FF0A7A2A' }, // light green (very punctual)
  lancar:        { bg: 'FFC6EFCE', fg: 'FF006100' }, // green
  kurang_lancar: { bg: 'FFFFEB9C', fg: 'FF9C5700' }, // yellow
  macet:         { bg: 'FFFFC7CE', fg: 'FF9C0006' }, // red
  returned:      { bg: 'FFFFC7CE', fg: 'FF9C0006' }, // red
  lunas:         { bg: 'FFBDD7EE', fg: 'FF1F4E78' }, // blue
};

function computeStatus(contract: any): { status: PaymentDetail['status']; label: string } {
  if (!contract) return { status: 'lancar', label: 'Lancar' };
  if (contract.status === 'returned') return { status: 'returned', label: 'Macet (Return)' };
  if (contract.status === 'completed' || contract.current_installment_index >= contract.tenor_days) {
    return { status: 'lunas', label: 'Lunas' };
  }
  if (contract.status !== 'active') return { status: 'lunas', label: 'Selesai' };

  const createdAt = contract.created_at ? new Date(contract.created_at) : new Date();
  const today = new Date();
  const daysElapsed = Math.max(1, Math.floor((today.getTime() - createdAt.getTime()) / 86400000));
  const cur = contract.current_installment_index || 0;
  const ratio = cur > 0 ? daysElapsed / cur : 999;
  // sangat_lancar: pembayaran sesuai ekspektasi atau lebih cepat (tidak pernah terlambat)
  if (ratio <= 1.0) return { status: 'sangat_lancar', label: 'Sangat Lancar' };
  if (ratio <= 1.2) return { status: 'lancar', label: 'Lancar' };
  if (ratio <= 2.0) return { status: 'kurang_lancar', label: 'Kurang Lancar' };
  return { status: 'macet', label: 'Macet' };
}

export const exportPaymentPerCollectorDaily = async (
  payments: PaymentWithRelations[],
  contracts: any[],
  selectedDate: string,
  handovers?: CouponHandover[],
  contractStatusMap?: Map<string, ContractStatusInfo>
) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Management System Kredit';
  workbook.created = new Date();

  // Build per-collector groups primarily from handovers (so unpaid/lunas tetap masuk).
  // Fallback to payments-grouping if no handovers passed in.
  const collectorMap = new Map<string, CollectorGroup>();

  const ensureCollector = (id: string, name: string, code: string) => {
    if (!collectorMap.has(id)) {
      collectorMap.set(id, { collectorId: id, collectorName: name, collectorCode: code, details: [] });
    }
    return collectorMap.get(id)!;
  };

  if (handovers && handovers.length > 0) {
    // Merge handovers per collector+contract so multiple handovers for the
    // same contract are combined into a single detail row in the Excel.
    // We'll build a temporary map: collectorId -> (contractId -> merged detail)
    const tempCollectorMap = new Map<string, { collectorId: string; collectorName: string; collectorCode: string; detailsMap: Map<string, PaymentDetail> }>();

    const ensureTempCollector = (id: string, name: string, code: string) => {
      if (!tempCollectorMap.has(id)) {
        tempCollectorMap.set(id, { collectorId: id, collectorName: name, collectorCode: code, detailsMap: new Map() });
      }
      return tempCollectorMap.get(id)!;
    };

    handovers
      .filter((h) => !selectedDate || h.handover_date === selectedDate)
      .forEach((h) => {
        const contract = contracts.find((c) => c.id === h.contract_id);
        const customerName = h.credit_contracts?.customers?.name || '-';
        const contractRef = h.credit_contracts?.contract_ref || '-';
        const dailyAmount = h.credit_contracts?.daily_installment_amount || contract?.daily_installment_amount || 0;
        const collectorId = h.collector_id || 'unassigned';
        const collectorName = h.collectors?.name || 'Tidak Ditugaskan';
        const collectorCode = h.collectors?.collector_code || '-';

        const currentIndex = h.credit_contracts?.current_installment_index ?? contract?.current_installment_index ?? 0;
        const paidEndIndex = Math.min(currentIndex, h.end_index);
        const paidStartIndex = h.start_index;
        const paidCount = Math.max(0, paidEndIndex - paidStartIndex + 1);
        const totalAmount = paidCount * dailyAmount;

        const mergedContract = {
          ...contract,
          current_installment_index: currentIndex,
          tenor_days: h.credit_contracts?.tenor_days ?? contract?.tenor_days,
          status: h.credit_contracts?.status ?? contract?.status,
        };
        // Prefer authoritative status from contractStatusMap (riwayat pelanggan)
        let status: PaymentDetail['status'];
        let label: string;
        const cs = contractStatusMap?.get(h.contract_id);
        if (cs) {
          const mapStatus = (s: ContractStatus): PaymentDetail['status'] => {
            if (s === 'completed') return 'lunas';
            if (s === 'sangat_lancar' || s === 'lancar') return 'lancar';
            if (s === 'kurang_lancar') return 'kurang_lancar';
            return 'macet';
          };
          status = mapStatus(cs.status);
          label = getStatusLabel(cs.status);
        } else {
          const computed = computeStatus(mergedContract);
          status = computed.status;
          label = computed.label;
        }

        const tempCollector = ensureTempCollector(collectorId, collectorName, collectorCode);
        const dm = tempCollector.detailsMap;
        const key = h.contract_id;
        if (!dm.has(key)) {
          dm.set(key, {
            contractId: h.contract_id,
            customerName,
            contractRef,
            startIndex: h.start_index,
            endIndex: h.end_index,
            paidStartIndex,
            paidEndIndex,
            couponCount: h.coupon_count,
            paidCount,
            dailyAmount,
            totalAmount,
            status,
            statusLabel: label,
          });
        } else {
          // merge into existing entry
          const ex = dm.get(key)!;
          ex.startIndex = Math.min(ex.startIndex, h.start_index);
          ex.endIndex = Math.max(ex.endIndex, h.end_index);
          ex.paidStartIndex = ex.paidStartIndex ? Math.min(ex.paidStartIndex, paidStartIndex) : paidStartIndex;
          ex.paidEndIndex = Math.max(ex.paidEndIndex, paidEndIndex);
          ex.couponCount = (ex.couponCount || 0) + (h.coupon_count || 0);
          ex.paidCount = (ex.paidCount || 0) + paidCount;
          ex.totalAmount = (ex.totalAmount || 0) + totalAmount;
          // keep dailyAmount as-is (assume consistent per contract)
          // recompute status label by using mergedContract (latest info)
          if (contractStatusMap?.has(h.contract_id)) {
            const cs2 = contractStatusMap!.get(h.contract_id)!;
            const mapStatus = (s: ContractStatus): PaymentDetail['status'] => {
              if (s === 'completed') return 'lunas';
              if (s === 'sangat_lancar' || s === 'lancar') return 'lancar';
              if (s === 'kurang_lancar') return 'kurang_lancar';
              return 'macet';
            };
            ex.status = mapStatus(cs2.status);
            ex.statusLabel = getStatusLabel(cs2.status);
          } else {
            const s = computeStatus(mergedContract);
            ex.status = s.status;
            ex.statusLabel = s.label;
          }
        }
      });

    // Convert tempCollectorMap into collectorMap groups
    tempCollectorMap.forEach((val) => {
      const group = ensureCollector(val.collectorId, val.collectorName, val.collectorCode);
      val.detailsMap.forEach((pd) => group.details.push(pd));
    });
  } else {
    // Fallback: build from payments
    const map = new Map<string, PaymentDetail & { _collectorId: string; _collectorName: string; _collectorCode: string; _indices: number[] }>();
    payments.forEach((p) => {
      const contract = contracts.find((c) => c.id === p.contract_id);
      const dailyAmount = contract?.daily_installment_amount || 0;
      const customerName = p.credit_contracts?.customers?.name || '-';
      const contractRef = p.credit_contracts?.contract_ref || '-';
      const collectorId = p.collector_id || 'unassigned';
      const collectorName = p.collectors?.name || 'Tidak Ditugaskan';
      const collectorCode = p.collectors?.collector_code || '-';
      const key = `${p.contract_id}-${collectorId}`;
      const { status, label } = computeStatus(contract);
      if (!map.has(key)) {
        map.set(key, {
          contractId: p.contract_id,
          customerName, contractRef,
          startIndex: p.installment_index, endIndex: p.installment_index,
          paidStartIndex: p.installment_index, paidEndIndex: p.installment_index,
          couponCount: 0, paidCount: 0,
          dailyAmount, totalAmount: 0,
          status, statusLabel: label,
          _collectorId: collectorId, _collectorName: collectorName, _collectorCode: collectorCode,
          _indices: [],
        });
      }
      const e = map.get(key)!;
      e._indices.push(p.installment_index);
      e.paidCount += 1;
      e.couponCount += 1;
      e.totalAmount += dailyAmount;
    });
    map.forEach((e) => {
      e._indices.sort((a, b) => a - b);
      e.startIndex = e._indices[0];
      e.endIndex = e._indices[e._indices.length - 1];
      e.paidStartIndex = e._indices[0];
      e.paidEndIndex = e._indices[e._indices.length - 1];
      const group = ensureCollector(e._collectorId, e._collectorName, e._collectorCode);
      group.details.push({
        contractId: e.contractId, customerName: e.customerName, contractRef: e.contractRef,
        startIndex: e.startIndex, endIndex: e.endIndex,
        paidStartIndex: e.paidStartIndex, paidEndIndex: e.paidEndIndex,
        couponCount: e.couponCount, paidCount: e.paidCount,
        dailyAmount: e.dailyAmount, totalAmount: e.totalAmount,
        status: e.status, statusLabel: e.statusLabel,
      });
    });
  }

  // Sort collectors and details
  const collectorList = Array.from(collectorMap.values()).sort((a, b) => a.collectorName.localeCompare(b.collectorName));
  collectorList.forEach((c) => c.details.sort((a, b) => a.contractRef.localeCompare(b.contractRef)));

  // (No global consumer precompute needed) we'll compute percentages based on target vs collected

  // ========= Summary sheet =========
  const summarySheet = workbook.addWorksheet('Ringkasan');
  summarySheet.mergeCells('A1:G1');
  const t = summarySheet.getCell('A1');
  t.value = 'LAPORAN INPUT PEMBAYARAN - RINGKASAN PER KOLEKTOR';
  t.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  t.alignment = { horizontal: 'center' };
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

  summarySheet.mergeCells('A2:G2');
  const d = summarySheet.getCell('A2');
  d.value = `Tanggal: ${new Date(selectedDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  d.font = { italic: true, size: 12 };
  d.alignment = { horizontal: 'center' };
  summarySheet.addRow([]);
  const summaryHeaders = ['No', 'Kolektor', 'Kode', 'Target Tertagih', 'Tertagih (%)', 'Total Dibayar', 'Total Tertagih'];
  const sh = summarySheet.addRow(summaryHeaders);
  sh.height = 28; // Increase height for wrapped text
  sh.eachCell((cell) => {
    cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70AD47' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  collectorList.forEach((c, i) => {
    const totalCoupons = c.details.reduce((s, x) => s + x.couponCount, 0);
    const totalPaidCount = c.details.reduce((s, x) => s + x.paidCount, 0);
    const totalCollectedAmount = c.details.reduce((s, x) => s + x.totalAmount, 0);
    // compute total target tertagih: sum(couponCount * dailyAmount)
    const totalTargetAmount = c.details.reduce((s, x) => s + ((x.couponCount || 0) * (x.dailyAmount || 0)), 0);
    const percent = totalTargetAmount > 0 ? Math.round((totalCollectedAmount / totalTargetAmount) * 100) : 0;

    const r = summarySheet.addRow([i + 1, c.collectorName, c.collectorCode, totalTargetAmount, `${percent}%`, totalPaidCount, totalCollectedAmount]);
    r.eachCell((cell, col) => {
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      cell.font = { size: 12 };
      if (col === 1) cell.alignment = { horizontal: 'center' };
      // Target (col 4) - currency
      else if (col === 4) { cell.numFmt = '"Rp "#,##0'; cell.alignment = { horizontal: 'right' }; }
      // Total Dibayar (col 6) - count
      else if (col === 6) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'center' }; }
      // Total Tertagih (col 7) - currency
      else if (col === 7) { cell.numFmt = '"Rp "#,##0'; cell.alignment = { horizontal: 'right' }; }
    });
  });
  summarySheet.columns = [5, 20, 12, 18, 12, 12, 20].map((w) => ({ width: w }));

  // ========= Per-collector detail sheets =========
  const usedNames = new Set<string>();
  collectorList.forEach((c) => {
    const baseName = c.collectorName.substring(0, 28).replace(/[\\/*?[\]:]/g, '');
    let safeName = baseName;
    let suffix = 1;
    while (usedNames.has(safeName) || workbook.getWorksheet(safeName)) {
      safeName = `${baseName}-${suffix++}`;
    }
    usedNames.add(safeName);

    const sheet = workbook.addWorksheet(safeName);
  sheet.mergeCells('A1:I1');
  const tt = sheet.getCell('A1');
  tt.value = `LAPORAN INPUT PEMBAYARAN - ${c.collectorName.toUpperCase()}`;
  tt.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    tt.alignment = { horizontal: 'center' };
    tt.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

  sheet.mergeCells('A2:I2');
  const dd = sheet.getCell('A2');
    // compute distinct consumers for this collector: acuan adalah nomor HP (phone_number)
    const customerSetForCollector = new Set<string>();
    c.details.forEach((d) => {
      const contractObj = contracts.find((ct) => ct.id === d.contractId);
      const phoneNumber = contractObj?.customers?.phone_number || (d.customerName || '-').trim();
      const normalizedValue = String(phoneNumber).trim().toLowerCase();
      customerSetForCollector.add(normalizedValue);
    });
    const konsumenCountForCollector = customerSetForCollector.size;

    // Persentase per kolektor: berdasarkan total target tertagih vs yang sudah tertagih
    const totalCollectedForCollector = c.details.reduce((s, x) => s + (x.totalAmount || 0), 0);
    const totalTargetForCollector = c.details.reduce((s, x) => s + ((x.couponCount || 0) * (x.dailyAmount || 0)), 0);
    const percent = totalTargetForCollector > 0 ? Math.round((totalCollectedForCollector / totalTargetForCollector) * 100) : 0;
    dd.value = `Tanggal: ${new Date(selectedDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} | Kolektor: ${c.collectorName} (${c.collectorCode}) | Jumlah Konsumen: ${konsumenCountForCollector} | Persentase: ${percent}%`;
    dd.font = { italic: true, size: 12 };
    dd.alignment = { horizontal: 'left' };
    sheet.addRow([]);
    const hRow = sheet.addRow(HEADERS);
    hRow.height = 30; // Increase height for wrapped text
    hRow.eachCell((cell) => {
      cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70AD47' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    const startRow = hRow.number + 1;

    c.details.forEach((d, idx) => {
      // No Kupon: show the range of handover indexes THAT ARE ALREADY PAID (paidStartIndex-paidEndIndex).
      // If nothing has been paid yet, show '0'. This aligns the export with the user's request.
      const hasPaid = (d.paidCount || 0) > 0 && typeof d.paidStartIndex === 'number' && typeof d.paidEndIndex === 'number';
      const range = !hasPaid
        ? '0'
        : d.paidStartIndex === d.paidEndIndex
          ? `${d.paidStartIndex}`
          : `${d.paidStartIndex}-${d.paidEndIndex}`;
      // kupon sisa (belum dibayar) = total kupon handover - paidCount
      const kuponSisa = Math.max(0, (d.couponCount || 0) - (d.paidCount || 0));
      const row = sheet.addRow([
        idx + 1, d.customerName, d.contractRef, range,
        d.paidCount, kuponSisa, d.dailyAmount, d.totalAmount, d.statusLabel,
      ]);
      row.eachCell((cell, col) => {
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        cell.font = { size: 12 };
        // Wrap text untuk Kode Kontrak
        if (col === 3) cell.alignment = { horizontal: 'center', wrapText: true };
        // Center alignment untuk: No, No Kupon, Jumlah Kupon, Kupon Dibayar
        if (col === 1 || col === 4 || col === 5 || col === 6 || col === 7) cell.alignment = { horizontal: 'center' };
        // Number format untuk Kupon Dibayar dan Kupon Pulang
        if (col === 5 || col === 6) cell.numFmt = '#,##0';
        // Kupon Dibayar cell: colored background based on payment status
        if (col === 5) {
          // Determine payment status: not_paid, partial, or paid_full
          if (d.paidCount === 0) {
            // Tidak bayar: Merah
            const fill = PAYMENT_STATUS_FILLS['not_paid'];
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill.bg } };
            cell.font = { bold: true, size: 12, color: { argb: fill.fg } };
          } else if (d.paidCount === d.couponCount && d.couponCount > 0) {
            // Lunas/Bayar Penuh: Tanpa warna (normal)
            cell.font = { size: 12 };
          } else if (d.paidCount > 0 && d.paidCount < d.couponCount) {
            // Bayar Sebagian: Kuning
            const fill = PAYMENT_STATUS_FILLS['partial'];
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill.bg } };
            cell.font = { bold: true, size: 12, color: { argb: fill.fg } };
          }
        }
        // Currency format dan right alignment untuk Angsuran dan Total Tertagih
        if (col === 7 || col === 8) { cell.numFmt = '"Rp "#,##0'; cell.alignment = { horizontal: 'right' }; }
        // Status cell: colored background
        if (col === 9) {
          const fill = STATUS_FILLS[d.status];
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill.bg } };
          cell.font = { bold: true, size: 12, color: { argb: fill.fg } };
          cell.alignment = { horizontal: 'center' };
        }
      });
    });

    if (c.details.length > 0) {
      const endRow = startRow + c.details.length - 1;
      const sub = sheet.addRow([
        '', '', 'TOTAL:', '',
        { formula: `SUM(E${startRow}:E${endRow})` },
        { formula: `SUM(F${startRow}:F${endRow})` },
        '',
        { formula: `SUM(H${startRow}:H${endRow})` },
        '',
      ]);
      sub.eachCell((cell, col) => {
        cell.font = { bold: true, size: 12 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        if (col === 5 || col === 6) { cell.numFmt = '#,##0'; cell.alignment = { horizontal: 'center' }; }
        if (col === 8) { cell.numFmt = '"Rp "#,##0'; cell.alignment = { horizontal: 'right' }; }
        if (col === 3) cell.alignment = { horizontal: 'right' };
      });
    }

    // Auto-filter on header so user can filter by Status (Lunas, Macet, dst)
    sheet.autoFilter = { from: { row: hRow.number, column: 1 }, to: { row: hRow.number, column: HEADERS.length } };
    sheet.columns = COL_WIDTHS.map((w) => ({ width: w }));
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Pembayaran_${selectedDate}_Per_Kolektor.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};
