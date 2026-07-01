import ExcelJS from 'exceljs';

interface EnrichedHandover {
  id: string;
  collector_id: string;
  contract_id: string;
  coupon_count: number;
  start_index: number;
  end_index: number;
  handover_date: string;
  notes: string | null;
  created_at: string;
  collectors?: { name: string; collector_code: string } | null;
  credit_contracts?: {
    contract_ref: string;
    daily_installment_amount: number;
    current_installment_index: number;
    tenor_days: number;
    status: string;
    customers: { name: string } | null;
    sales_agents: { agent_code: string } | null;
  } | null;
}

interface CollectorDailySummary {
  collector_id: string;
  collector_name: string;
  collector_code: string;
  handovers: EnrichedHandover[];
  total_sisa_kupon: number;
  total_sisa_nominal: number;
}

const HEADERS = [
  'No', 'Konsumen', 'Kode', 'No Kupon', 'Kupon Bawa', 'Angsuran', 'Total (Rp)'
];

// Reduced widths to encourage text wrapping for multi-word headers
const COL_WIDTHS = [5, 14, 9, 12, 10, 15, 16];

export const exportHandoverPerCollectorDaily = async (handovers: EnrichedHandover[], selectedDate: string) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Management System Kredit';
  workbook.created = new Date();

  // Group and MERGE handovers by collector and contract so multiple handovers
  // for the same contract (and same collector) become a single detail row.
  const byCollector = new Map<string, CollectorDailySummary>();

  // temp map: collectorId -> { collector info, detailsMap: contractId -> merged entry }
  const temp = new Map<string, { collector_id: string; collector_name: string; collector_code: string; detailsMap: Map<string, any> }>();

  handovers
    .filter((h) => !selectedDate || h.handover_date === selectedDate)
    .forEach((h) => {
      const collectorId = h.collector_id;
      const collectorName = h.collectors?.name || 'Unknown';
      const collectorCode = h.collectors?.collector_code || '-';
      if (!temp.has(collectorId)) {
        temp.set(collectorId, { collector_id: collectorId, collector_name: collectorName, collector_code: collectorCode, detailsMap: new Map() });
      }
      const t = temp.get(collectorId)!;

      const contractId = h.contract_id;
      const contractRef = h.credit_contracts?.contract_ref || '-';
      const customerName = h.credit_contracts?.customers?.name || '-';
      const dailyAmount = h.credit_contracts?.daily_installment_amount || 0;

      if (!t.detailsMap.has(contractId)) {
        // initial merged entry
        t.detailsMap.set(contractId, {
          contract_id: contractId,
          credit_contracts: {
            contract_ref: contractRef,
            daily_installment_amount: dailyAmount,
            customers: { name: customerName },
          },
          start_index: h.start_index,
          end_index: h.end_index,
          coupon_count: h.coupon_count,
        });
      } else {
        // merge into existing
        const ex = t.detailsMap.get(contractId)!;
        ex.start_index = Math.min(ex.start_index, h.start_index);
        ex.end_index = Math.max(ex.end_index, h.end_index);
        ex.coupon_count = (ex.coupon_count || 0) + (h.coupon_count || 0);
        // ensure dailyAmount and contract_ref are present (assume consistent)
        if (!ex.credit_contracts.daily_installment_amount) ex.credit_contracts.daily_installment_amount = dailyAmount;
        if (!ex.credit_contracts.contract_ref) ex.credit_contracts.contract_ref = contractRef;
      }
    });

  // convert temp into byCollector with merged handovers array and totals
  temp.forEach((v, collectorId) => {
    const handoverArr: EnrichedHandover[] = [];
    let totalKupon = 0;
    let totalNominal = 0;
    v.detailsMap.forEach((md) => {
      const daily = md.credit_contracts?.daily_installment_amount || 0;
      // Sinkronkan kupon bawa dengan range No Kupon (end - start + 1)
      const derivedCount = Math.max(0, (md.end_index || 0) - (md.start_index || 0) + 1);
      md.coupon_count = derivedCount;
      const merged: EnrichedHandover = {
        id: md.contract_id || md.contract_id || '',
        collector_id: collectorId,
        contract_id: md.contract_id,
        coupon_count: derivedCount,
        start_index: md.start_index,
        end_index: md.end_index,
        handover_date: selectedDate,
        notes: null,
        created_at: new Date().toISOString(),
        collectors: { name: v.collector_name, collector_code: v.collector_code },
        credit_contracts: {
          contract_ref: md.credit_contracts.contract_ref,
          daily_installment_amount: daily,
          current_installment_index: 0,
          tenor_days: 0,
          status: '',
          customers: { name: md.credit_contracts.customers?.name || '-' },
          sales_agents: null,
        },
      } as EnrichedHandover;
      handoverArr.push(merged);
      totalKupon += derivedCount;
      totalNominal += derivedCount * daily;
    });


    byCollector.set(collectorId, {
      collector_id: collectorId,
      collector_name: v.collector_name,
      collector_code: v.collector_code,
      handovers: handoverArr,
      total_sisa_kupon: totalKupon,
      total_sisa_nominal: totalNominal,
    });
  });

  // Create summary sheet (all collectors)
  const summarySheet = workbook.addWorksheet('Ringkasan');
  
  // Title
  summarySheet.mergeCells('A1:G1');
  const summaryTitleCell = summarySheet.getCell('A1');
  summaryTitleCell.value = 'LAPORAN SERAH TERIMA KUPON - RINGKASAN PER KOLEKTOR';
  summaryTitleCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  summaryTitleCell.alignment = { horizontal: 'center' };
  summaryTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

  // Date info
  summarySheet.mergeCells('A2:H2');
  const summaryDateCell = summarySheet.getCell('A2');
  summaryDateCell.value = `Tanggal: ${new Date(selectedDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`;
  summaryDateCell.font = { italic: true, size: 12 };
  summaryDateCell.alignment = { horizontal: 'center' };

  summarySheet.addRow([]);

  // Headers
  const summaryHeaders = ['No', 'Kolektor', 'Kode', 'Konsumen', 'Sisa Kupon', 'Total Sisa (Rp)'];
  const summaryHRow = summarySheet.addRow(summaryHeaders);
  summaryHRow.height = 28; // Increase height for wrapped text
  summaryHRow.eachCell((cell) => {
    cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70AD47' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  const summaryStartRow = summaryHRow.number + 1;

  // Summary rows
  let summaryRowNum = summaryStartRow;
  Array.from(byCollector.values()).forEach((summary, i) => {
    // compute distinct consumers for the collector: acuan adalah nomor HP (phone_number)
    const customerSet = new Set<string>();
    summary.handovers.forEach((h) => {
      const phoneNumber = (h.credit_contracts?.customers as any)?.phone_number || 
                         (h.credit_contracts?.customers?.name ? h.credit_contracts.customers.name : (h.contract_id || ''));
      const normalizedValue = String(phoneNumber).trim().toLowerCase();
      customerSet.add(normalizedValue);
    });
    const konsumenCount = customerSet.size;

    const summaryRowValues = [
      i + 1,
      summary.collector_name,
      summary.collector_code,
      konsumenCount,
      summary.total_sisa_kupon,
      summary.total_sisa_nominal,
    ];

    const summaryRow = summarySheet.addRow(summaryRowValues);
    summaryRow.eachCell((cell, colNum) => {
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      cell.font = { size: 12 };
      if ([4].includes(colNum)) {
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal: 'center' };
      } else if ([5].includes(colNum)) {
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal: 'right' };
      } else if ([6].includes(colNum)) {
        cell.numFmt = '"Rp "#,##0';
        cell.alignment = { horizontal: 'right' };
      } else if (colNum === 1) {
        cell.alignment = { horizontal: 'center' };
      }
    });
    summaryRowNum += 1;
  });

  summarySheet.columns = [5, 10, 12, 14, 14, 18].map((width) => ({ width }));

  // Create detail sheet per collector
  const usedNames = new Set<string>();
  byCollector.forEach(({ collector_id, collector_name, collector_code, handovers: collectorHandovers }) => {
    const baseName = collector_name.substring(0, 28).replace(/[\\/*?[\]:]/g, '');
    let safeName = baseName;
    let suffix = 1;
    while (usedNames.has(safeName) || workbook.getWorksheet(safeName)) {
      safeName = `${baseName}-${suffix}`;
      suffix += 1;
    }
    usedNames.add(safeName);

    // Create sheet for this collector
    const sheet = workbook.addWorksheet(safeName);

  // Title
  sheet.mergeCells('A1:H1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `LAPORAN SERAH TERIMA KUPON - ${collector_name.toUpperCase()}`;
  titleCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { horizontal: 'center' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

    // Date & Collector info
  sheet.mergeCells('A2:H2');
    const dateCell = sheet.getCell('A2');
    // compute distinct consumers for this collector: acuan adalah nomor HP (phone_number)
    const customerSetForCollector = new Set<string>();
    collectorHandovers.forEach((h) => {
      const phoneNumber = (h.credit_contracts?.customers as any)?.phone_number || 
                         (h.credit_contracts?.customers?.name ? h.credit_contracts.customers.name : (h.contract_id || ''));
      const normalizedValue = String(phoneNumber).trim().toLowerCase();
      customerSetForCollector.add(normalizedValue);
    });
    const konsumenCountForCollector = customerSetForCollector.size;

    dateCell.value = `Tanggal: ${new Date(selectedDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} | Kolektor: ${collector_name} (${collector_code}) | Jumlah Konsumen: ${konsumenCountForCollector}`;
  dateCell.font = { italic: true, size: 12 };
    dateCell.alignment = { horizontal: 'left' };

    sheet.addRow([]);

    // Headers
    const hRow = sheet.addRow(HEADERS);
    hRow.height = 30; // Increase height for wrapped text
    hRow.eachCell((cell) => {
      cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70AD47' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });

    const startRow = hRow.number + 1;

    // Data rows
    collectorHandovers.forEach((h, idx) => {
      const rowNum = startRow + idx;
      const dailyAmount = h.credit_contracts?.daily_installment_amount || 0;
      const rowValues = [
        idx + 1,
        h.credit_contracts?.customers?.name || '-',
        h.credit_contracts?.contract_ref || '-',
        `${h.start_index}-${h.end_index}`,
        h.coupon_count,
        dailyAmount,
        { formula: `E${rowNum}*F${rowNum}` }, // Total Sisa = Kupon * Angsuran
      ];

      const row = sheet.addRow(rowValues);
      row.eachCell((cell, colNum) => {
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        cell.font = { size: 12 };

        if ([5].includes(colNum)) {
          cell.numFmt = '#,##0';
          cell.alignment = { horizontal: 'center' };
        } else if ([6, 7].includes(colNum)) {
          cell.numFmt = '"Rp "#,##0';
          cell.alignment = { horizontal: 'right' };
        } else if (colNum === 1) {
          cell.alignment = { horizontal: 'center' };
        }
      });
    });

    // Subtotal row
    const subtotalRowNum = startRow + collectorHandovers.length;
    const subtotalRowValues = [
      '', '', 'TOTAL:', '', 
      { formula: `SUM(E${startRow}:E${subtotalRowNum - 1})` },
      '',
      { formula: `SUM(G${startRow}:G${subtotalRowNum - 1})` },
    ];

    const subtotalRow = sheet.addRow(subtotalRowValues);
    subtotalRow.eachCell((cell, colNum) => {
      cell.font = { bold: true, size: 12 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };

      if ([5].includes(colNum)) {
        cell.numFmt = '#,##0';
        cell.alignment = { horizontal: 'right' };
      } else if ([6, 7].includes(colNum)) {
        cell.numFmt = '"Rp "#,##0';
        cell.alignment = { horizontal: 'right' };
      } else if (colNum === 3) {
        cell.alignment = { horizontal: 'right' };
      }
    });

    sheet.columns = COL_WIDTHS.map((width) => ({ width }));
  });

  // Download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Serah_Terima_Kupon_${selectedDate}_Per_Kolektor.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
};
