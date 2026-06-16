import { useState, useEffect, useRef, useMemo } from "react";
import { Plus, Pencil, Trash2, Download, Eye, Settings, ChevronLeft, ChevronRight, Calendar, UserX, Users, FileText } from "lucide-react";
import { format, addMonths, subMonths, startOfMonth, startOfYear, endOfMonth, endOfYear } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import ExcelJS from "exceljs";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAdminNote } from "@/contexts/AdminNoteContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  useSalesAgents,
  useCreateSalesAgent,
  useUpdateSalesAgent,
  useDeleteSalesAgent,
  SalesAgent,
} from "@/hooks/useSalesAgents";
import { useAgentOmset } from "@/hooks/useAgentOmset";
import { useAgentCustomerCounts } from "@/hooks/useAgentCustomerCounts";
import { Badge } from "@/components/ui/badge";
import { useMonthlyPerformance } from '@/hooks/useMonthlyPerformance';
import { useYearlyFinancialSummary } from '@/hooks/useYearlyFinancialSummary';
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/TablePagination";
import { formatRupiah } from "@/lib/format";
import { SearchInput } from "@/components/ui/search-input";
import { CommissionPaymentDialog } from "@/components/salesAgent/CommissionPaymentDialog";
import { CommissionTiersDialog } from "@/components/salesAgent/CommissionTiersDialog";
import { useCommissionTiers, calculateTieredCommission } from "@/hooks/useCommissionTiers";
import { useContracts } from "@/hooks/useContracts";
import { Card, CardContent } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export default function SalesAgents() {
  const { t } = useTranslation();
  const { promptAdminNote } = useAdminNote();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const { data: agents, isLoading } = useSalesAgents();
  const { data: allContracts } = useContracts();
  const { data: agentOmsetData } = useAgentOmset();
  
  // Get URL parameters
  const periodTypeParam = (searchParams.get('periodType') as 'monthly' | 'yearly' | null) || 'monthly';
  const monthParam = searchParams.get('month');
  const yearParam = searchParams.get('year');
  
  // Compute effective values (defaults for missing params)
  const effectiveMonth = monthParam || format(startOfMonth(new Date()), 'yyyy-MM');
  // Default to 2026 explicitly to avoid unexpected year jumps
  const effectiveYear = yearParam || '2026';

  // resolve month for hooks
  const selectedMonthForHook = new Date(effectiveMonth);
  const selectedYearForHook = new Date(parseInt(effectiveYear, 10), 0, 1);

  // Period range (yyyy-MM-dd) untuk filter pelanggan baru/lama agar selaras dengan periode
  const periodRange = (() => {
    if (periodTypeParam === 'yearly') {
      return {
        start: format(startOfYear(selectedYearForHook), 'yyyy-MM-dd'),
        end: format(endOfYear(selectedYearForHook), 'yyyy-MM-dd'),
      };
    }
    return {
      start: format(startOfMonth(selectedMonthForHook), 'yyyy-MM-dd'),
      end: format(endOfMonth(selectedMonthForHook), 'yyyy-MM-dd'),
    };
  })();

  const { data: agentCustomerCounts } = useAgentCustomerCounts(periodRange.start, periodRange.end);
  const { data: monthlyData } = useMonthlyPerformance(selectedMonthForHook);
  const { data: yearlyData } = useYearlyFinancialSummary(selectedYearForHook);
  const { data: commissionTiers } = useCommissionTiers();

  // ===== Statistik kartu (mengikuti periode aktif) =====
  const cardStats = useMemo(() => {
    if (!allContracts) {
      return { totalKontrak: 0, kontrakAktif: 0, kontrakTidakAktif: 0, totalKonsumen: 0, konsumenAktif: 0, konsumenTidakAktif: 0 };
    }
    const start = periodRange.start;
    const end = periodRange.end;

    // Follow the same normalization & lifetime-key logic as useAgentCustomerCounts
    const normalizePhoneLocal = (phone: string | null | undefined) => {
      if (!phone) return '';
      const digits = String(phone).replace(/\D/g, '');
      if (!digits) return '';
      if (digits.startsWith('62')) return '0' + digits.slice(2);
      if (digits.startsWith('0')) return digits;
      return digits;
    };
    const normalizeNameLocal = (name: string | null | undefined) => {
      if (!name) return '';
      return String(name).trim().toLowerCase().replace(/\s+/g, ' ');
    };

    // 1) Build global contractCountByKey and keyByCustomerId (lifetime classification)
    const contractCountByKey = new Map<string, number>();
    const keyByCustomerId = new Map<string, string>();
    (allContracts || []).forEach((row: any) => {
      const phoneKey = normalizePhoneLocal(row.customers?.phone);
      const nameKey = normalizeNameLocal(row.customers?.name);
      const key = phoneKey ? `p:${phoneKey}` : nameKey ? `n:${nameKey}` : null;
      if (!key) return;
      contractCountByKey.set(key, (contractCountByKey.get(key) || 0) + 1);
      if (row.customer_id) keyByCustomerId.set(row.customer_id, key);
    });

    // 2) Filter contracts in the selected period
    const inPeriod = (allContracts || []).filter((c: any) => {
      if (!c.start_date) return false;
      const d = String(c.start_date).slice(0, 10);
      return d >= start && d <= end;
    });

    let kontrakAktif = 0;
    let kontrakTidakAktif = 0;

    // 3) Build unique customer keys present in-period, aligning with hook behavior:
    //    only contracts that can be mapped to a lifetime key (via customer_id -> key) are counted.
    const uniqueCustomerKeys = new Map<string, { active: boolean }>();

    inPeriod.forEach((c: any) => {
      const isActive = c.status !== 'completed' && c.status !== 'returned';
      if (isActive) kontrakAktif += 1; else kontrakTidakAktif += 1;

      // Only consider contracts that can be mapped to a persistent customer key.
      // This mirrors useAgentCustomerCounts which ignores rows without a customer_id/key.
      if (!c.customer_id) return;
      const key = keyByCustomerId.get(c.customer_id);
      if (!key) return;

      const prev = uniqueCustomerKeys.get(key) || { active: false };
      prev.active = prev.active || isActive;
      uniqueCustomerKeys.set(key, prev);
    });

    let konsumenAktif = 0;
    let konsumenTidakAktif = 0;
    uniqueCustomerKeys.forEach((v) => { if (v.active) konsumenAktif += 1; else konsumenTidakAktif += 1; });

    return {
      totalKontrak: inPeriod.length,
      kontrakAktif,
      kontrakTidakAktif,
      totalKonsumen: uniqueCustomerKeys.size,
      konsumenAktif,
      konsumenTidakAktif,
    };
  }, [allContracts, periodRange.start, periodRange.end]);
  const createAgent = useCreateSalesAgent();
  const updateAgent = useUpdateSalesAgent();
  const deleteAgent = useDeleteSalesAgent();
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  
  // Filter agents based on search query
  const filteredAgents = agents?.filter(agent =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agent.agent_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (agent.phone && agent.phone.toLowerCase().includes(searchQuery.toLowerCase()))
  ) || [];
  
  const ITEMS_PER_PAGE = 5;
  const { currentPage, totalPages, paginatedItems, goToPage, totalItems } = usePagination(filteredAgents, ITEMS_PER_PAGE);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [commissionDialogOpen, setCommissionDialogOpen] = useState(false);
  const [tiersDialogOpen, setTiersDialogOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<SalesAgent | null>(null);
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);
  const [formData, setFormData] = useState({ agent_code: "", name: "", phone: "" });

  // Handle highlighting item from global search
  useEffect(() => {
    if (highlightId && agents?.length) {
      const targetAgent = agents.find(a => a.id === highlightId);
      if (targetAgent) {
        setHighlightedRowId(highlightId);
        
        // Find the page where this agent is located
        const agentIndex = agents.findIndex(a => a.id === highlightId);
        const targetPage = Math.floor(agentIndex / 5) + 1;
        
        // Navigate to the correct page
        if (targetPage !== currentPage) {
          goToPage(targetPage);
        }
        
        // Auto scroll and highlight
        setTimeout(() => {
          if (highlightedRowRef.current) {
            highlightedRowRef.current.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center' 
            });
          }
          // Remove highlight after 3 seconds
          setTimeout(() => {
            setHighlightedRowId(null);
            // Remove highlight parameter from URL
            searchParams.delete('highlight');
            setSearchParams(searchParams, { replace: true });
          }, 3000);
        }, 100);
      }
    }
  }, [highlightId, agents, currentPage, goToPage, searchParams, setSearchParams]);

  // Sync URL parameters to ensure month is always consistent
  useEffect(() => {
    const sp = new URLSearchParams(searchParams);
    let needsUpdate = false;

    // Ensure month is set
    if (!sp.get('month')) {
      sp.set('month', format(startOfMonth(new Date()), 'yyyy-MM'));
      needsUpdate = true;
    }
    if (!sp.get('year')) {
      // Default year set to 2026 to match requested default period
      sp.set('year', '2026');
      needsUpdate = true;
    }
    if (!sp.get('periodType')) {
      sp.set('periodType', 'monthly');
      needsUpdate = true;
    }

    if (needsUpdate) {
      setSearchParams(sp, { replace: true });
    }
  }, []);

  const handleOpenCreate = () => {
    // Generate next sales agent code based on the most recent pattern
    const generateNextCode = () => {
      if (!agents || agents.length === 0) return "S001";
      
      // Sort agents by creation date to get the most recent pattern
      const sortedAgents = [...agents].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      // Get the most recent code to determine the pattern
      const recentCode = sortedAgents[0]?.agent_code;
      
      if (!recentCode) return "S001";
      
      // Extract pattern from recent code
      const match = recentCode.match(/^([A-Z]+)(\d+)$/);
      if (!match) {
        // If no pattern found, use default
        return "S001";
      }
      
      const prefix = match[1];
      const numberLength = match[2].length;
      
      // Find all codes with the same prefix
      const existingNumbers = agents
        .map(a => a.agent_code)
        .filter(code => code.startsWith(prefix))
        .map(code => {
          const numMatch = code.match(new RegExp(`^${prefix}(\\d+)$`));
          return numMatch ? parseInt(numMatch[1], 10) : 0;
        })
        .filter(num => !isNaN(num));
      
      const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
      const nextNumber = maxNumber + 1;
      return `${prefix}${nextNumber.toString().padStart(numberLength, '0')}`;
    };

    setSelectedAgent(null);
    setFormData({ 
      agent_code: generateNextCode(), 
      name: "", 
      phone: "" 
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (agent: SalesAgent) => {
    setSelectedAgent(agent);
    setFormData({
      agent_code: agent.agent_code,
      name: agent.name,
      phone: agent.phone || "",
    });
    setDialogOpen(true);
  };

  const getAgentOmset = (agentId: string) => {
    // Mode tahunan: pakai hook tahunan (sumber kebenaran tunggal — query DB langsung
    // dengan filter start_date dan status, sama seperti monthly).
    if (isYearly) {
      const rec: any = yearlyData?.agents?.find((a: any) => a.agent_id === agentId);
      const total_omset = rec?.total_omset ?? 0;
      const total_modal = rec?.total_modal ?? 0;
      const total_commission = rec?.total_commission ?? 0;
      return {
        agent_id: agentId,
        commission_percentage: rec?.commission_percentage ?? 0,
        total_omset,
        total_modal,
        total_contracts: rec?.contracts_count ?? 0,
        total_commission,
        profit: rec?.profit ?? (total_omset - total_modal),
      } as any;
    }

    // Period-specific record dari hook yang sudah filter sesuai periode terpilih.
    // monthly: monthlyData.agents (kontrak start_date di bulan terpilih)
    let periodRecord: any = undefined;
    if (monthlyData?.agents) {
      periodRecord = monthlyData.agents.find((a: any) => a.agent_id === agentId || a.agent_code === getAgentCode(agentId));
    }

    const lifetime = agentOmsetData?.find((d) => d.agent_id === agentId);

    // Untuk periode bulanan, SELALU gunakan periodRecord (akan 0 jika tidak ada kontrak di periode itu).
    // Tidak fallback ke lifetime/monthly_omset rolling agar selaras dengan periode yang dipilih user.
    const total_omset = periodRecord?.total_omset ?? 0;
    const total_commission = periodRecord?.total_commission ?? 0;

    const normalized: any = {
      agent_id: agentId,
      agent_name: undefined,
      agent_code: undefined,
      commission_percentage: periodRecord?.commission_percentage ?? lifetime?.commission_percentage ?? 0,
      total_omset,
      total_modal: periodRecord?.total_modal ?? 0,
      total_contracts: periodRecord?.total_contracts ?? periodRecord?.contracts_count ?? 0,
      total_commission,
      booked_total_omset: lifetime?.booked_total_omset,
      booked_total_modal: lifetime?.booked_total_modal,
      booked_contracts_count: lifetime?.booked_contracts_count,
      profit: periodRecord?.profit ?? 0,
    };

    return normalized;
  };

  // helper to map agent id -> agent_code (sales agent objects provide code)
  const getAgentCode = (agentId: string) => {
    const ag = agents?.find(a => a.id === agentId);
    return ag?.agent_code;
  }

  const handleSubmit = async () => {
    try {
      if (selectedAgent) {
        const note = await promptAdminNote({
          title: "Catatan Pembaruan Sales",
          description: `Tuliskan alasan perubahan data sales ${selectedAgent.name}.`,
          requirePassword: true,
        });
        if (!note) return;
        await updateAgent.mutateAsync({ id: selectedAgent.id, ...formData, _note: note } as any);
        toast.success(t("success.updated"));
      } else {
        await createAgent.mutateAsync(formData);
        toast.success(t("success.created"));
      }
      setDialogOpen(false);
    } catch (error) {
      toast.error(t("errors.saveFailed"));
    }
  };

  const handleDelete = async () => {
    if (!selectedAgent) return;
    try {
      const note = await promptAdminNote({
        title: "Catatan Hapus Sales",
        description: `Tuliskan alasan menghapus sales ${selectedAgent.name}.`,
        confirmLabel: "Hapus",
        variant: "destructive",
        requirePassword: true,
      });
      if (!note) return;
      await deleteAgent.mutateAsync({ id: selectedAgent.id, _note: note });
      toast.success(t("success.deleted"));
      setDeleteDialogOpen(false);
    } catch (error) {
      toast.error(t("errors.deleteFailed"));
    }
  };

  const handleExportExcel = async () => {
    if (!agents || agents.length === 0) {
      toast.error(t("common.noData"));
      return;
    }

    if (!commissionTiers || commissionTiers.length === 0) {
      toast.error("Ketentuan komisi belum diatur. Silakan atur terlebih dahulu.");
      return;
    }

    // Tentukan label periode untuk export (bulanan atau tahunan)
    const exportPeriodLabel = isYearly
      ? `Tahun ${effectiveYear}`
      : format(selectedMonthForHook, 'MMMM yyyy', { locale: idLocale });
    const exportStartDate = periodRange.start;
    const exportEndDate = periodRange.end;

    // Fetch kontrak SESUAI PERIODE + payments untuk cash-basis realisation
    const [
      { data: allContracts, error: contractsError },
      { data: allPayments, error: paymentsError },
    ] = await Promise.all([
      supabase
        .from('credit_contracts')
        .select('id, contract_ref, product_type, omset, total_loan_amount, start_date, sales_agent_id, status, customers(name, phone)')
        .neq('status', 'returned')
        .gte('start_date', exportStartDate)
        .lte('start_date', exportEndDate)
        .order('start_date', { ascending: false }),
      supabase.from('payment_logs').select('amount_paid, contract_id'),
    ]);

    if (contractsError || paymentsError) {
      toast.error("Gagal mengambil data kontrak");
      return;
    }

    // Sum pembayaran per kontrak (cash basis)
    const paidByContract = new Map<string, number>();
    (allPayments || []).forEach((p: any) => {
      paidByContract.set(p.contract_id, (paidByContract.get(p.contract_id) || 0) + Number(p.amount_paid || 0));
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Management System Kredit';
    workbook.created = new Date();

    const THIN_BORDER: Partial<ExcelJS.Borders> = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };

    // ===== SHEET 1: Semua Sales (PERIODE AKTIF) =====
    const HEADERS_1 = ['No', 'Nama', 'Telepon', 'Komisi % (Tier)', 'Total Omset', 'Total Komisi', 'Jumlah Kontrak'];
    const COL_WIDTHS_1 = [5, 22, 18, 20, 22, 22, 16];

    const ws1 = workbook.addWorksheet('Semua Sales');

    // Title row
    ws1.mergeCells('A1:G1');
    const titleCell = ws1.getCell('A1');
    titleCell.value = `LAPORAN PERFORMA SALES AGENT - ${exportPeriodLabel.toUpperCase()}`;
    titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { horizontal: 'center' };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

    // Date row
    ws1.mergeCells('A2:G2');
    const dateCell = ws1.getCell('A2');
    dateCell.value = `Dicetak: ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} | Periode: ${exportPeriodLabel}`;
    dateCell.font = { italic: true, size: 12 };
    dateCell.alignment = { horizontal: 'center' };

    ws1.addRow([]); // spacer

    // Header row
    const hRow1 = ws1.addRow(HEADERS_1);
    hRow1.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70AD47' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = THIN_BORDER;
    });

    const startRow1 = hRow1.number + 1;

    agents.forEach((agent, i) => {
      const omsetData = getAgentOmset(agent.id);
      // SELALU pakai data periode aktif (bukan lifetime) — konsisten dengan tabel UI
      const displayOmset = omsetData?.total_omset || 0;
      const dynamicPct = displayOmset > 0
        ? calculateTieredCommission(displayOmset, commissionTiers) / 100
        : 0;
      const commissionAmount = (omsetData?.total_commission && omsetData.total_commission > 0)
        ? omsetData.total_commission
        : displayOmset * dynamicPct;

      const dataRow = ws1.addRow([
        i + 1,
        agent.name,
        agent.phone || '-',
        dynamicPct,
        displayOmset,
        commissionAmount,
        omsetData?.total_contracts || 0,
      ]);

      dataRow.eachCell((cell, colNumber) => {
        cell.border = THIN_BORDER;
        if (colNumber === 4) {
          cell.numFmt = '0.00%';
          cell.alignment = { horizontal: 'center' };
        } else if ([5, 6].includes(colNumber)) {
          cell.numFmt = '"Rp "#,##0';
          cell.alignment = { horizontal: 'right' };
        } else if ([1, 7].includes(colNumber)) {
          cell.alignment = { horizontal: 'center' };
        }
      });
    });

    // Total row - hanya untuk omset dan kontrak, tidak ada SUM untuk komisi
    if (agents.length > 0) {
      const endRow1 = startRow1 + agents.length - 1;
      const totalRow1 = ws1.addRow([
        '', '', 'TOTAL', '',
        { formula: `SUM(E${startRow1}:E${endRow1})` },
        '', // Komisi tidak di-SUM (hanya 0.8% per baris, tidak dijumlahkan)
        { formula: `SUM(G${startRow1}:G${endRow1})` },
      ]);
      totalRow1.eachCell((cell, colNumber) => {
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
        cell.border = { top: { style: 'double' }, bottom: { style: 'double' }, left: { style: 'thin' }, right: { style: 'thin' } };
        if ([5, 6].includes(colNumber)) {
          cell.numFmt = '"Rp "#,##0';
          cell.alignment = { horizontal: 'right' };
        } else if (colNumber === 7) {
          cell.numFmt = '#,##0';
          cell.alignment = { horizontal: 'center' };
        }
      });
    }

    ws1.columns = COL_WIDTHS_1.map((width) => ({ width }));

    // ===== SHEET 2+: Per Sales Agent (Cash Basis) =====
    // Kolom Tanggal dihapus per request user
    // Omset = total sudah dibayar (cash basis), bukan total_loan_amount mentah
    const HEADERS_2 = ['No', 'Kode Kontrak', 'Produk', 'Nama Konsumen', 'Telepon Konsumen', 'Omset by Kontrak'];
    const COL_WIDTHS_2 = [5, 18, 25, 25, 20, 22];

    agents.forEach((agent) => {
      const agentContracts = (allContracts || []).filter(
        (c: any) => c.sales_agent_id === agent.id
      );

      const safeName = `${agent.agent_code} - ${agent.name}`.substring(0, 31).replace(/[\\/*?[\]:]/g, '');
      const sheet = workbook.addWorksheet(safeName);

      // Title
      sheet.mergeCells('A1:F1');
      const t1 = sheet.getCell('A1');
      t1.value = `LAPORAN DETAIL - ${agent.name.toUpperCase()} (${agent.agent_code}) - ${exportPeriodLabel.toUpperCase()}`;
      t1.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
      t1.alignment = { horizontal: 'center' };
      t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };

      sheet.mergeCells('A2:F2');
      const d1 = sheet.getCell('A2');
      d1.value = `Dicetak: ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })} | Periode: ${exportPeriodLabel}`;
      d1.font = { italic: true, size: 12 };
      d1.alignment = { horizontal: 'center' };

      sheet.addRow([]);

      const hRow = sheet.addRow(HEADERS_2);
      hRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70AD47' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = THIN_BORDER;
      });

      const startRow = hRow.number + 1;

      agentContracts.forEach((contract: any, idx: number) => {
        // Omset by kontrak = nilai penuh kontrak (bukan cash basis)
        const omsetByContract = Number(contract.total_loan_amount || 0);
        const dataRow = sheet.addRow([
          idx + 1,
          contract.contract_ref,
          contract.product_type || '-',
          contract.customers?.name || '-',
          contract.customers?.phone || '-',
          omsetByContract,
        ]);

        dataRow.eachCell((cell, colNumber) => {
          cell.border = THIN_BORDER;
          if (colNumber === 6) {
            cell.numFmt = '"Rp "#,##0';
            cell.alignment = { horizontal: 'right' };
          } else if (colNumber === 1) {
            cell.alignment = { horizontal: 'center' };
          }
        });
      });

      // Total row
      if (agentContracts.length > 0) {
        const endRow = startRow + agentContracts.length - 1;
        const totalRow = sheet.addRow([
          '', '', '', '', 'TOTAL',
          { formula: `SUM(F${startRow}:F${endRow})` },
        ]);
        totalRow.eachCell((cell, colNumber) => {
          cell.font = { bold: true };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
          cell.border = { top: { style: 'double' }, bottom: { style: 'double' }, left: { style: 'thin' }, right: { style: 'thin' } };
          if (colNumber === 6) {
            cell.numFmt = '"Rp "#,##0';
            cell.alignment = { horizontal: 'right' };
          }
        });
      }

      sheet.columns = COL_WIDTHS_2.map((width) => ({ width }));
    });

    // Download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
  const periodSlug = isYearly ? effectiveYear : effectiveMonth;
    a.download = `Laporan_Sales_Agent_${periodSlug}_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Excel berhasil di-export untuk periode ${exportPeriodLabel}!`);
  };

  // Period control helpers
  const shiftMonth = (delta: number | null = null) => {
    const sp = new URLSearchParams(searchParams);
    let targetDate: Date;
    
    if (delta === null) {
      // Navigate to current month (today)
      targetDate = startOfMonth(new Date());
    } else {
      // Navigate by delta months
      const base = new Date(effectiveMonth);
      targetDate = delta < 0 ? subMonths(base, Math.abs(delta)) : addMonths(base, delta);
    }
    
    sp.set('month', format(targetDate, 'yyyy-MM'));
    setSearchParams(sp, { replace: true });
  };

  const shiftYear = (delta: number | null = null) => {
    const sp = new URLSearchParams(searchParams);
    let target: number;
    if (delta === null) target = 2026;
    else target = parseInt(effectiveYear, 10) + delta;
    sp.set('year', String(target));
    setSearchParams(sp, { replace: true });
  };

  const setPeriodType = (val: 'monthly' | 'yearly') => {
    const sp = new URLSearchParams(searchParams);
    sp.set('periodType', val);
    // If switching to yearly, ensure the `year` param is set and follows the currently selected month
    // (so toggling between monthly/yearly doesn't yield an unexpected year like 2027).
    if (val === 'yearly') {
      // Prefer explicit year param, else derive from month param, else fallback to current year
  const derivedYear = yearParam || (monthParam ? monthParam.split('-')[0] : null) || '2026';
      sp.set('year', derivedYear);
    } else {
      // Ensure month param exists when switching back to monthly
      if (!sp.get('month')) {
        sp.set('month', format(startOfMonth(new Date()), 'yyyy-MM'));
      }
    }
    setSearchParams(sp, { replace: true });
  };

  const isYearly = periodTypeParam === 'yearly';
  const periodLabel = isYearly
    ? `Tahun ${effectiveYear}`
    : `${format(selectedMonthForHook, 'MMMM yyyy', { locale: idLocale })} (reset tgl 1)`;
  const omsetColLabel = isYearly
    ? `Omset ${effectiveYear}`
    : `Omset ${format(selectedMonthForHook, 'MMM yyyy', { locale: idLocale })}`;
  const commissionColLabel = isYearly
    ? `Komisi ${effectiveYear}`
    : `Komisi ${format(selectedMonthForHook, 'MMM yyyy', { locale: idLocale })}`;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">{t("salesAgents.title")}</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTiersDialogOpen(true)}>
            <Settings className="mr-2 h-4 w-4" /> Ketentuan Komisi
          </Button>
          <Button variant="outline" onClick={handleExportExcel}>
            <Download className="mr-2 h-4 w-4" /> Export Excel
          </Button>
          <Button onClick={handleOpenCreate}>
            <Plus className="mr-2 h-4 w-4" /> {t("salesAgents.newAgent")}
          </Button>
        </div>
      </div>

      {/* Filter and Period Selector */}
      <div className="space-y-4">
        {/* Period selector card */}
        <div className="border rounded-lg bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Periode {isYearly ? 'Tahunan' : 'Bulanan'}</span>
              </div>
              <ToggleGroup
                type="single"
                value={periodTypeParam}
                onValueChange={(v) => v && setPeriodType(v as 'monthly' | 'yearly')}
                className="gap-1"
              >
                <ToggleGroupItem value="monthly" size="sm" className="text-xs px-3">Bulanan</ToggleGroupItem>
                <ToggleGroupItem value="yearly" size="sm" className="text-xs px-3">Tahunan</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => isYearly ? shiftYear(-1) : shiftMonth(-1)}
                  title={isYearly ? "Tahun sebelumnya" : "Bulan sebelumnya"}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="font-semibold min-w-[220px] text-center text-sm capitalize px-4 py-2 bg-muted/50 rounded">
                  {periodLabel}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => isYearly ? shiftYear(1) : shiftMonth(1)}
                  title={isYearly ? "Tahun berikutnya" : "Bulan berikutnya"}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="ml-2"
                  onClick={() => isYearly ? shiftYear(null) : shiftMonth(null)}
                >
                  {isYearly ? 'Tahun Ini' : 'Bulan Ini'}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground text-right hidden md:block">
                <p>Omset, komisi & pelanggan</p>
                <p>mengikuti {isYearly ? 'tahun' : 'bulan'} terpilih</p>
              </div>
            </div>
          </div>
        </div>

        {/* Stat cards (mengikuti periode aktif) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-muted-foreground">Total Konsumen</span>
              </div>
              <p className="text-xl font-bold">{cardStats.totalKonsumen}</p>
              <p className="text-xs text-muted-foreground mt-1">{periodLabel}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-indigo-500" />
                <span className="text-xs text-muted-foreground">Total Kontrak</span>
              </div>
              <p className="text-xl font-bold">{cardStats.totalKontrak}</p>
              <p className="text-xs text-muted-foreground mt-1">{periodLabel}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-emerald-500" />
                <span className="text-xs text-muted-foreground">Konsumen Aktif / Tidak</span>
              </div>
              <p className="text-xl font-bold">
                <span className="text-emerald-600">{cardStats.konsumenAktif}</span>
                <span className="text-muted-foreground"> / </span>
                <span className="text-rose-600">{cardStats.konsumenTidakAktif}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">Aktif vs lunas/return</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-emerald-500" />
                <span className="text-xs text-muted-foreground">Kontrak Aktif / Tidak</span>
              </div>
              <p className="text-xl font-bold">
                <span className="text-emerald-600">{cardStats.kontrakAktif}</span>
                <span className="text-muted-foreground"> / </span>
                <span className="text-rose-600">{cardStats.kontrakTidakAktif}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1">Aktif vs lunas/return</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and stats */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            onClear={() => setSearchQuery("")}
            placeholder="Cari berdasarkan nama, kode, atau telepon..."
            className="flex-1 md:max-w-md"
          />
          <div className="text-sm text-muted-foreground">
            {searchQuery
              ? `Ditemukan ${totalItems} dari ${agents?.length || 0} sales agent`
              : `Total ${agents?.length || 0} sales agent`
            }
          </div>
        </div>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("salesAgents.agentCode")}</TableHead>
              <TableHead>{t("salesAgents.name")}</TableHead>
              <TableHead>{t("salesAgents.phone")}</TableHead>
              <TableHead>{omsetColLabel}</TableHead>
              <TableHead>{commissionColLabel}</TableHead>
              <TableHead className="text-center" title="Pelanggan Baru (hanya 1 kontrak)">B</TableHead>
              <TableHead className="text-center" title="Pelanggan Lama (≥2 kontrak)">L</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center">{t("common.loading")}</TableCell>
              </TableRow>
            ) : filteredAgents?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  {searchQuery ? `Tidak ada sales agent yang ditemukan dengan kata kunci "${searchQuery}"` : t("common.noData")}
                </TableCell>
              </TableRow>
            ) : (
              paginatedItems.map((agent) => {
                const omsetData = getAgentOmset(agent.id);
                // Monthly omset (reset tiap tgl 1)
                const displayOmset = omsetData?.total_omset || 0;
                // Komisi: gunakan hasil dari hook (sudah tier-based & konsisten dengan agregat).
                // Jika tidak tersedia (mis. agent tanpa kontrak di periode), hitung lokal.
                const displayCommission = (() => {
                  if (omsetData?.total_commission && omsetData.total_commission > 0) {
                    return omsetData.total_commission;
                  }
                  if (displayOmset <= 0) return 0;
                  const pct = commissionTiers && commissionTiers.length > 0
                    ? calculateTieredCommission(displayOmset, commissionTiers)
                    : 0;
                  return (displayOmset * pct) / 100;
                })();
                return (
                  <TableRow 
                    key={agent.id}
                    ref={highlightedRowId === agent.id ? highlightedRowRef : null}
                    className={cn(
                      highlightedRowId === agent.id && "bg-accent border-primary/30 animate-pulse"
                    )}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {agent.agent_code}
                        {agent.is_active === false && (
                          <Badge variant="outline" className="text-xs gap-1 border-destructive/40 text-destructive">
                            <UserX className="h-3 w-3" /> Nonaktif
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{agent.name}</TableCell>
                    <TableCell>{agent.phone || "-"}</TableCell>
                    <TableCell className="font-medium">{formatRupiah(displayOmset)}</TableCell>
                    <TableCell className="font-medium text-primary">
                      {formatRupiah(displayCommission)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className="bg-green-600 hover:bg-green-600/90 text-white" title="Pelanggan Baru">
                        {agentCustomerCounts?.get(agent.id)?.baru ?? 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" title="Pelanggan Lama">
                        {agentCustomerCounts?.get(agent.id)?.lama ?? 0}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        title="Lihat Detail Komisi"
                        onClick={() => {
                          setSelectedAgent(agent);
                          setCommissionDialogOpen(true);
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={agent.is_active === false ? "Aktifkan kembali" : "Tandai tidak bekerja"}
                        onClick={async () => {
                          const willDeactivate = agent.is_active !== false;
                          const note = await promptAdminNote({
                            title: willDeactivate ? "Catatan Nonaktifkan Sales" : "Catatan Aktifkan Sales",
                            description: `Tuliskan alasan ${willDeactivate ? "menonaktifkan" : "mengaktifkan kembali"} sales ${agent.name}.`,
                          });
                          if (!note) return;
                          updateAgent.mutate({ id: agent.id, is_active: !willDeactivate, _note: note } as any);
                        }}
                      >
                        <UserX className={cn("h-4 w-4", agent.is_active === false ? "text-muted-foreground" : "text-destructive")} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(agent)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedAgent(agent);
                          setDeleteDialogOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={goToPage}
          totalItems={totalItems}
        />
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedAgent ? t("salesAgents.editAgent") : t("salesAgents.newAgent")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="agent_code">{t("salesAgents.agentCode")}</Label>
              <div className="flex gap-2">
                <Input
                  id="agent_code"
                  value={formData.agent_code}
                  onChange={(e) => setFormData({ ...formData, agent_code: e.target.value })}
                  placeholder="e.g., S001, B001, D001"
                  className="flex-1"
                />
                {!selectedAgent && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Regenerate code using the same logic as handleOpenCreate
                      const generateNextCode = () => {
                        if (!agents || agents.length === 0) return "S001";
                        
                        const sortedAgents = [...agents].sort((a, b) => 
                          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
                        );
                        
                        const recentCode = sortedAgents[0]?.agent_code;
                        if (!recentCode) return "S001";
                        
                        const match = recentCode.match(/^([A-Z]+)(\d+)$/);
                        if (!match) return "S001";
                        
                        const prefix = match[1];
                        const numberLength = match[2].length;
                        
                        const existingNumbers = agents
                          .map(a => a.agent_code)
                          .filter(code => code.startsWith(prefix))
                          .map(code => {
                            const numMatch = code.match(new RegExp(`^${prefix}(\\d+)$`));
                            return numMatch ? parseInt(numMatch[1], 10) : 0;
                          })
                          .filter(num => !isNaN(num));
                        
                        const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
                        const nextNumber = maxNumber + 1;
                        return `${prefix}${nextNumber.toString().padStart(numberLength, '0')}`;
                      };
                      
                      setFormData({ ...formData, agent_code: generateNextCode() });
                    }}
                    className="px-3"
                  >
                    Auto
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {!selectedAgent 
                  ? "Dapat diinput manual atau klik 'Auto' untuk mengikuti pola kode sebelumnya"
                  : "Kode sales agent"
                }
              </p>
            </div>
            <div>
              <Label htmlFor="name">{t("salesAgents.name")}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t("salesAgents.name")}
              />
            </div>
            <div>
              <Label htmlFor="phone">{t("salesAgents.phone")}</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder={t("salesAgents.phone")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={handleSubmit} disabled={createAgent.isPending || updateAgent.isPending}>
              {selectedAgent ? t("common.save") : t("common.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.delete")} {t("salesAgents.title")}?</AlertDialogTitle>
            <AlertDialogDescription>
              {t("contracts.deleteWarning")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t("common.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Commission Payment Dialog */}
      {selectedAgent && (
        <CommissionPaymentDialog
          open={commissionDialogOpen}
          onOpenChange={setCommissionDialogOpen}
          agentId={selectedAgent.id}
          agentName={selectedAgent.name}
          agentCode={selectedAgent.agent_code}
          periodStart={periodRange.start}
          periodEnd={periodRange.end}
        />
      )}

      {/* Commission Tiers Dialog */}
      <CommissionTiersDialog
        open={tiersDialogOpen}
        onOpenChange={setTiersDialogOpen}
      />
    </div>
  );
}
